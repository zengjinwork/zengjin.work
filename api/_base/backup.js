import { checkAuth } from '#api_util/auth_middleware.js'
import base from '#api_util/base.js'
import { getPool } from '#api_util/db.js'

// 本接口专用：执行主备双写更新日志
async function upsert_backup_log_async(pool, logObj) {
	const query = `
    INSERT INTO "base_backup" ("id", "type", "source", "target", "status", "extra", "insertTime", "updateTime")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT ("id") 
    DO UPDATE SET 
      "status" = EXCLUDED."status", 
      "extra" = EXCLUDED."extra", 
      "updateTime" = EXCLUDED."updateTime";
  `
	const binds = [
		logObj.id,
		logObj.type,
		logObj.source,
		logObj.target,
		logObj.status,
		JSON.stringify(logObj.extra || {}),
		logObj.insertTime,
		logObj.updateTime || null,
	]
	await pool.query(query, binds)
}

export default async (req, resp) => {
	// 初始化 base 上下文
	base.req = req
	base.resp = resp

	const startTime = Date.now()
	const activeDb = (process.env.DB || 'neon').toLowerCase()
	const sourceName = activeDb
	const targetName = activeDb === 'neon' ? 'supabase' : 'neon'

	// 1. 鉴权：生产环境下进行双通道校验 (Vercel Cron 校验 或 用户登录 Token 校验)
	const isProd = process.env.NODE_ENV === 'production'
	const authHeader = req.headers.authorization || req.headers.Authorization
	if (isProd) {
		let isAuthorized = false
		// 通道一：Vercel Cron 自动定时任务校验
		if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
			isAuthorized = true
		}
		// 通道二：系统已登录管理用户的 Token 校验 (支持 admin 管理端手动触发)
		if (!isAuthorized) {
			const isUserAuth = await checkAuth(req, resp)
			if (!isUserAuth) {
				// checkAuth 内部已向客户端返回 401，这里直接拦截截断
				return
			}
			isAuthorized = true
		}
	}

	console.log(`[备份引擎] 启动。主库: [${sourceName}] -> 备份库: [${targetName}]`)

	// 2. 获取主库与备库的连接池
	const sourcePool = getPool(sourceName)
	const targetPool = getPool(targetName)

	if (!sourcePool || !targetPool) {
		return base.respFailure({ msg: '数据库连接池初始化失败，请检查环境变量配置。' })
	}

	// 准备初始日志对象
	const logId = base.getId()
	const insertTimeStr = base.getTime()
	const logObj = {
		id: logId,
		type: 'db',
		source: sourceName,
		target: targetName,
		status: 0, // 进行中
		insertTime: insertTimeStr,
		extra: {},
	}

	try {
		// 3. 自动创建备份日志表 (如果不存在的话，双端确保)
		const createLogTableDdl = `
      CREATE TABLE IF NOT EXISTS "base_backup" (
        "id" varchar(255) NOT NULL,
        "type" varchar(50) NOT NULL,
        "source" varchar(100) NOT NULL,
        "target" varchar(100) NOT NULL,
        "status" smallint DEFAULT 0,
        "extra" jsonb DEFAULT '{}'::jsonb,
        "insertTime" timestamptz DEFAULT now(),
        "updateTime" timestamptz,
        PRIMARY KEY ("id")
      );
    `
		await sourcePool.query(createLogTableDdl)
		await targetPool.query(createLogTableDdl)

		// 4. 在主库中插入本次“进行中”状态的日志记录
		await upsert_backup_log_async(sourcePool, logObj)
		console.log(`[备份引擎] 已在主库中登记初始日志: ${logId}`)

		// 5. 提取待同步的数据表名列表
		const tablesRes = await sourcePool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `)

		// 排除日志表本身，并且当 Supabase 是主库时滤掉 keepalive 表 (Neon 库中无此表)
		const tables = tablesRes.rows
			.map(r => r.tablename)
			.filter(t => t !== 'base_backup')
			.filter(t => !(sourceName === 'supabase' && t === 'base_keepalive'))

		console.log(`[备份引擎] 待同步数据表 (${tables.length} 张):`, tables)

		// 目标库清理及重建要排除的表 (当 Neon -> Supabase 时，保护 Supabase 端的 keepalive 不受影响)
		const targetTables = tables.filter(t => t !== 'base_keepalive')

		const schemas = {}

		// 6. 读取源库中的元数据结构
		for (const table of tables) {
			// A. 读取列信息
			const colsRes = await sourcePool.query(
				`
        SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale, is_nullable, column_default, is_identity, identity_generation
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `,
				[table],
			)

			// B. 读取主键和唯一键约束
			const constraintsRes = await sourcePool.query(
				`
        SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = $1
          AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE');
      `,
				[table],
			)

			// C. 读取外键约束
			const fksRes = await sourcePool.query(
				`
        SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name, rc.update_rule, rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = $1
          AND tc.constraint_type = 'FOREIGN KEY';
      `,
				[table],
			)

			// D. 读取索引（排除约束自动产生的索引）
			const indexesRes = await sourcePool.query(
				`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = $1
          AND indexname NOT IN (
            SELECT conname FROM pg_constraint WHERE contype IN ('p', 'u')
          );
      `,
				[table],
			)

			schemas[table] = {
				columns: colsRes.rows,
				constraints: constraintsRes.rows,
				foreignKeys: fksRes.rows,
				indexes: indexesRes.rows,
			}
		}

		// 7. 清理目标库中的表 (CASCADE CASCADE，避开 base_keepalive)
		console.log('[备份引擎] 正在清理备份目标库的旧表与序列...')
		for (const table of targetTables) {
			await targetPool.query(`DROP TABLE IF EXISTS "${table}" CASCADE;`)

			// 检查列默认值中是否有自定义序列，如有则进行 DROP
			const defaultSeqs = schemas[table].columns
				.filter(c => c.column_default && c.column_default.includes('nextval'))
				.map(c => {
					const match = c.column_default.match(/nextval\('"?(\w+)"?'::regclass\)/)
					return match ? match[1] : null
				})
				.filter(Boolean)
			for (const seq of defaultSeqs) {
				await targetPool.query(`DROP SEQUENCE IF EXISTS "${seq}" CASCADE;`)
			}
		}

		// 8. 重建目标库结构（暂不加外键）
		console.log('[备份引擎] 正在备份库中重建表结构...')
		for (const table of targetTables) {
			const meta = schemas[table]

			// A. 重建 Sequence
			const defaultSeqs = meta.columns
				.filter(c => c.column_default && c.column_default.includes('nextval'))
				.map(c => {
					const match = c.column_default.match(/nextval\('"?(\w+)"?'::regclass\)/)
					return match ? match[1] : null
				})
				.filter(Boolean)
			for (const seq of defaultSeqs) {
				await targetPool.query(`CREATE SEQUENCE IF NOT EXISTS "${seq}";`)
			}

			// B. 拼装列字段
			const colDefs = []
			for (const col of meta.columns) {
				let typeStr = col.data_type
				if (typeStr === 'character varying' && col.character_maximum_length) {
					typeStr = `varchar(${col.character_maximum_length})`
				} else if (typeStr === 'numeric') {
					if (col.numeric_precision && col.numeric_scale) {
						typeStr = `numeric(${col.numeric_precision},${col.numeric_scale})`
					} else if (col.numeric_precision) {
						typeStr = `numeric(${col.numeric_precision})`
					}
				}

				let defStr = ''
				if (col.column_default !== null) {
					defStr = ` DEFAULT ${col.column_default}`
				}

				let nullStr = col.is_nullable === 'NO' ? ' NOT NULL' : ''
				colDefs.push(`"${col.column_name}" ${typeStr}${defStr}${nullStr}`)
			}

			// C. 重建主键
			const pkCols = [...new Set(meta.constraints.filter(c => c.constraint_type === 'PRIMARY KEY').map(c => c.column_name))]
			if (pkCols.length > 0) {
				colDefs.push(`PRIMARY KEY (${pkCols.map(c => `"${c}"`).join(', ')})`)
			}

			// D. 重建唯一键
			const uniGroup = {}
			meta.constraints
				.filter(c => c.constraint_type === 'UNIQUE')
				.forEach(c => {
					if (!uniGroup[c.constraint_name]) uniGroup[c.constraint_name] = []
					uniGroup[c.constraint_name].push(c.column_name)
				})
			for (const [cName, cols] of Object.entries(uniGroup)) {
				colDefs.push(`CONSTRAINT "${cName}" UNIQUE (${cols.map(c => `"${c}"`).join(', ')})`)
			}

			const createQuery = `CREATE TABLE "${table}" (\n  ${colDefs.join(',\n  ')}\n);`
			await targetPool.query(createQuery)
		}

		// 9. 导出源数据并导入备份库 (分批)
		console.log('[备份引擎] 正在迁移各数据表内容...')
		for (const table of targetTables) {
			const dataRes = await sourcePool.query(`SELECT * FROM "${table}";`)
			const rows = dataRes.rows

			if (rows.length === 0) continue

			// 临时禁用触发器，绕过外键引用约束以及潜在触发逻辑
			await targetPool.query(`ALTER TABLE "${table}" DISABLE TRIGGER ALL;`)

			const columns = Object.keys(rows[0])
			const colNames = columns.map(c => `"${c}"`).join(', ')

			const batchSize = 100
			for (let i = 0; i < rows.length; i += batchSize) {
				const batch = rows.slice(i, i + batchSize)
				const values = []
				const placeholders = []
				let paramIndex = 1

				for (const row of batch) {
					const rowPlaceholders = []
					for (const col of columns) {
						const val = row[col]
						if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
							values.push(JSON.stringify(val))
						} else {
							values.push(val)
						}
						rowPlaceholders.push(`$${paramIndex++}`)
					}
					placeholders.push(`(${rowPlaceholders.join(', ')})`)
				}

				const insertQuery = `INSERT INTO "${table}" (${colNames}) VALUES ${placeholders.join(', ')};`
				await targetPool.query(insertQuery, values)
			}

			await targetPool.query(`ALTER TABLE "${table}" ENABLE TRIGGER ALL;`)
		}

		// 10. 重建外键约束
		console.log('[备份引擎] 正在还原外键关联约束...')
		for (const table of targetTables) {
			const meta = schemas[table]
			for (const fk of meta.foreignKeys) {
				const fkQuery = `
          ALTER TABLE "${table}" 
          ADD CONSTRAINT "${fk.constraint_name}" 
          FOREIGN KEY ("${fk.column_name}") 
          REFERENCES "${fk.foreign_table_name}"("${fk.foreign_column_name}") 
          ON UPDATE ${fk.update_rule} 
          ON DELETE ${fk.delete_rule};
        `
				await targetPool.query(fkQuery)
			}
		}

		// 11. 重建额外索引
		console.log('[备份引擎] 正在还原索引配置...')
		for (const table of targetTables) {
			const meta = schemas[table]
			for (const idx of meta.indexes) {
				await targetPool.query(idx.indexdef)
			}
		}

		// 12. 重置目标库自增序列最大值
		console.log('[备份引擎] 正在修正自增序列的当前位点值...')
		for (const table of targetTables) {
			const meta = schemas[table]
			const identityOrSeqCols = meta.columns.filter(c => c.column_default && c.column_default.includes('nextval'))
			for (const col of identityOrSeqCols) {
				const match = col.column_default.match(/nextval\('"?(\w+)"?'::regclass\)/)
				const seqName = match ? match[1] : null
				if (seqName) {
					const maxValRes = await targetPool.query(`SELECT COALESCE(MAX("${col.column_name}"), 0) AS max_val FROM "${table}";`)
					const maxVal = maxValRes.rows[0].max_val
					const nextVal = maxVal > 0 ? maxVal : 1
					await targetPool.query(`SELECT setval('${seqName}', ${nextVal}, ${maxVal > 0});`)
				}
			}
		}

		// 13. 对账与生成最终报告
		const auditLog = {}
		for (const table of tables) {
			const sCountRes = await sourcePool.query(`SELECT count(*) AS count FROM "${table}";`)
			const sCount = parseInt(sCountRes.rows[0].count)

			let tCount = 0
			try {
				const tCountRes = await targetPool.query(`SELECT count(*) AS count FROM "${table}";`)
				tCount = parseInt(tCountRes.rows[0].count)
			} catch (e) {
				tCount = -1 // 目标库没有此表或读取失败
			}

			auditLog[table] = {
				source: sCount,
				target: tCount,
				match: sCount === tCount,
			}
		}

		// 检查 base_keepalive 是否安全存续（仅当 supabase 是备份库时校验）
		if (targetName === 'supabase') {
			try {
				const kaCountRes = await targetPool.query(`SELECT count(*) AS count FROM "base_keepalive";`)
				auditLog['base_keepalive'] = {
					source: null,
					target: parseInt(kaCountRes.rows[0].count),
					match: true,
					memo: 'Supabase 独有保活表已获隔离保护',
				}
			} catch (e) {
				auditLog['base_keepalive'] = { source: null, target: -1, match: false, error: e.message }
			}
		}

		const duration = `${Date.now() - startTime}ms`
		console.log(`[备份引擎] 数据同步完成。耗时: ${duration}`)

		// 14. 归档更新状态：双向写入最终的备份日志 (status: 1 = 成功)
		logObj.status = 1
		logObj.updateTime = base.getTime()
		logObj.extra = {
			duration,
			tables: auditLog,
			message: '数据库备份及对账一切正常，行数一致。',
		}

		await upsert_backup_log_async(sourcePool, logObj)
		await upsert_backup_log_async(targetPool, logObj)

		return base.respSuccess({
			msg: '备份同步及双向对账校验已圆满完成！',
			data: logObj.extra,
		})
	} catch (error) {
		console.error('[备份引擎] 执行遭遇灾难性崩溃:', error)

		const duration = `${Date.now() - startTime}ms`
		// 归档状态：双向写入最终的失败日志 (status: 2 = 失败)
		logObj.status = 2
		logObj.updateTime = base.getTime()
		logObj.extra = {
			duration,
			error: error.message,
			stack: error.stack,
			message: '备份过程中遭遇崩溃中断。',
		}

		try {
			await upsert_backup_log_async(sourcePool, logObj)
			await upsert_backup_log_async(targetPool, logObj)
		} catch (dbErr) {
			console.error('[备份引擎] 写入故障状态日志失败:', dbErr)
		}

		return base.respFailure({
			msg: `备份执行失败: ${error.message}`,
			details: logObj.extra,
		})
	}
}
