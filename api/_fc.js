import db from '#api_util/db.js'
import base from '#api_util/base.js'
import provider from '#api_util/_storage_provider.js'

const BUCKET = 'cdn'
const actions = { get: {}, post: {} }

// ============================== 用户前台（无需鉴权） ==============================

/** 游戏列表（分页） */
actions.get.select = async ({ query }) => {
	const page = parseInt(query.page) || 1
	const pageSize = parseInt(query.pageSize) || 24
	const offset = (page - 1) * pageSize
	const sortMap = {
		hot: '"playCount" DESC',
		az: 'name ASC',
		new: '"insertTime" DESC',
	}
	const orderBy = sortMap[query.sort] || sortMap.new

	const wheres = ['"deleteTime" IS NULL']
	const binds = []
	let idx = 1

	// 分类筛选
	if (query.categoryId) {
		wheres.push(`id IN (SELECT "gameId" FROM game_category_link WHERE "categoryId" = $${idx})`)
		binds.push(query.categoryId)
		idx++
	}

	// 关键词搜索（名称 / 别称 / 厂家）
	if (query.keyword) {
		const kw = `%${query.keyword}%`
		wheres.push(`(name ILIKE $${idx} OR maker ILIKE $${idx + 1} OR id IN (SELECT "gameId" FROM game_alias WHERE alias ILIKE $${idx + 2}))`)
		binds.push(kw, kw, kw)
		idx += 3
	}

	const whereStr = wheres.length ? `WHERE ${wheres.join(' AND ')}` : ''

	try {
		// 总数
		const countRes = await db.query(`SELECT COUNT(*) FROM game ${whereStr}`, binds)
		const total = parseInt(countRes.rows[0].count)

		// 列表
		const listRes = await db.query(
			`SELECT id, name, cover, maker, "playerCount", "playCount", sort, "insertTime"
			 FROM game ${whereStr}
			 ORDER BY sort DESC, ${orderBy}
			 LIMIT $${idx} OFFSET $${idx + 1}`,
			[...binds, pageSize, offset]
		)

		// 批量查分类（用于卡片展示前 2 个分类标签）
		const ids = listRes.rows.map(r => r.id)
		let categoryMap = {}
		if (ids.length) {
			const catRes = await db.query(
				`SELECT cl."gameId", c.id, c.name
				 FROM game_category_link cl
				 JOIN game_category c ON cl."categoryId" = c.id
				 WHERE cl."gameId" = ANY($1)`,
				[ids]
			)
			catRes.rows.forEach(r => {
				if (!categoryMap[r.gameId]) categoryMap[r.gameId] = []
				categoryMap[r.gameId].push({ id: r.id, name: r.name })
			})
		}

		const data = listRes.rows.map(r => ({
			...r,
			categories: categoryMap[r.id] || [],
		}))

		return base.respSuccess({ data, total })
	} catch (error) {
		return base.respFailure({ msg: `查询失败: ${error.message}` })
	}
}

/** 游戏详情（聚合分类/标签/别称/图片） */
actions.get.detail = async ({ query }) => {
	if (!query.id) return base.respFailure({ msg: 'id 参数缺失' })

	try {
		// 主表
		const gameRes = await db.query('SELECT * FROM game WHERE id = $1', [query.id])
		if (!gameRes.rowCount) return base.respFailure({ msg: '游戏不存在' })
		const game = base.formatDbRows(gameRes.rows)[0]

		// 别称
		const aliasRes = await db.query('SELECT id, alias FROM game_alias WHERE "gameId" = $1', [query.id])
		game.aliases = aliasRes.rows.map(r => r.alias)

		// 分类
		const catRes = await db.query(
			`SELECT c.id, c.name FROM game_category_link cl
			 JOIN game_category c ON cl."categoryId" = c.id
			 WHERE cl."gameId" = $1`,
			[query.id]
		)
		game.categories = catRes.rows

		// 标签
		const tagRes = await db.query(
			`SELECT t.id, t.name FROM game_tag_link tl
			 JOIN game_tag t ON tl."tagId" = t.id
			 WHERE tl."gameId" = $1`,
			[query.id]
		)
		game.tags = tagRes.rows

		// 图片
		const imgRes = await db.query('SELECT id, url, sort FROM game_img WHERE "gameId" = $1 ORDER BY sort', [query.id])
		game.imgs = imgRes.rows

		return base.respSuccess({ data: game })
	} catch (error) {
		return base.respFailure({ msg: `查询失败: ${error.message}` })
	}
}

/** 游玩计数 +1 */
actions.post.play = async ({ body }) => {
	if (!body.id) return base.respFailure({ msg: 'id 参数缺失' })
	try {
		await db.query('UPDATE game SET "playCount" = "playCount" + 1 WHERE id = $1', [body.id])
		return base.respSuccess({ msg: '计数成功' })
	} catch (error) {
		return base.respFailure({ msg: `计数失败: ${error.message}` })
	}
}

/** 分类列表 */
actions.get.category = async () => {
	try {
		const res = await db.query('SELECT id, name, sort FROM game_category ORDER BY sort DESC, id')
		return base.respSuccess({ data: res.rows })
	} catch (error) {
		return base.respFailure({ msg: `查询失败: ${error.message}` })
	}
}

/** 标签列表 */
actions.get.tag = async () => {
	try {
		const res = await db.query('SELECT id, name FROM game_tag ORDER BY id')
		return base.respSuccess({ data: res.rows })
	} catch (error) {
		return base.respFailure({ msg: `查询失败: ${error.message}` })
	}
}

/** Banner 列表 */
actions.get.banner = async () => {
	try {
		const res = await db.query(
			'SELECT id, "gameId", image, link, sort FROM game_banner WHERE "deleteTime" IS NULL ORDER BY sort DESC, id'
		)
		return base.respSuccess({ data: res.rows })
	} catch (error) {
		return base.respFailure({ msg: `查询失败: ${error.message}` })
	}
}

// ============================== 管理后台（需鉴权） ==============================
// TODO: 接入 checkAuth 鉴权守卫，当前先跳过便于调试

/** 新增游戏（返回新 id，不含文件 URL，文件上传后再 update 补充） */
actions.post.insert = async ({ body }) => {
	if (!body.name) return base.respFailure({ msg: 'name 参数缺失' })

	try {
		const now = base.getTime()
		const res = await db.query(
			`INSERT INTO game (name, maker, "playerCount", "releaseDate", summary, sort, "insertTime")
			 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
			[body.name, body.maker || '', body.playerCount || '', body.releaseDate || null, body.summary || '', body.sort || 0, now]
		)
		return base.respSuccess({ msg: '新增成功', data: res.rows[0].id })
	} catch (error) {
		return base.respFailure({ msg: `新增失败: ${error.message}` })
	}
}

/** 更新游戏（含文件清理 + 关联表同步） */
actions.post.update = async ({ body }) => {
	if (!body.id) return base.respFailure({ msg: 'id 参数缺失' })

	try {
		// 读取旧记录，用于文件对比
		const oldRes = await db.query('SELECT * FROM game WHERE id = $1', [body.id])
		if (!oldRes.rowCount) return base.respFailure({ msg: '游戏不存在' })
		const oldRecord = oldRes.rows[0]

		// 更新主表
		const now = base.getTime()
		await db.query(
			`UPDATE game SET
				name = $1, cover = $2, maker = $3, "playerCount" = $4, "releaseDate" = $5,
				summary = $6, "romPath" = $7, sort = $8, "keymapConfig" = $9, "keymapDesc" = $10,
				"updateTime" = $11
			 WHERE id = $12`,
			[
				body.name ?? oldRecord.name,
				body.cover ?? oldRecord.cover,
				body.maker ?? oldRecord.maker,
				body.playerCount ?? oldRecord.playerCount,
				body.releaseDate ?? oldRecord.releaseDate,
				body.summary ?? oldRecord.summary,
				body.romPath ?? oldRecord.romPath,
				body.sort ?? oldRecord.sort,
				body.keymapConfig != null ? JSON.stringify(body.keymapConfig) : oldRecord.keymapConfig,
				body.keymapDesc != null ? JSON.stringify(body.keymapDesc) : oldRecord.keymapDesc,
				now,
				body.id,
			]
		)

		// 同步别称表（先删后插）
		if (body.aliases) {
			await db.query('DELETE FROM game_alias WHERE "gameId" = $1', [body.id])
			for (const alias of body.aliases) {
				if (alias) await db.query('INSERT INTO game_alias ("gameId", alias) VALUES ($1, $2)', [body.id, alias])
			}
		}

		// 同步分类关联（先删后插）
		if (body.categoryIds) {
			await db.query('DELETE FROM game_category_link WHERE "gameId" = $1', [body.id])
			for (const cid of body.categoryIds) {
				await db.query('INSERT INTO game_category_link ("gameId", "categoryId") VALUES ($1, $2)', [body.id, cid])
			}
		}

		// 同步标签关联（先删后插）
		if (body.tagIds) {
			await db.query('DELETE FROM game_tag_link WHERE "gameId" = $1', [body.id])
			for (const tid of body.tagIds) {
				await db.query('INSERT INTO game_tag_link ("gameId", "tagId") VALUES ($1, $2)', [body.id, tid])
			}
		}

		// 同步图片表（先删后插）
		if (body.imgs) {
			await db.query('DELETE FROM game_img WHERE "gameId" = $1', [body.id])
			for (let i = 0; i < body.imgs.length; i++) {
				const img = body.imgs[i]
				if (img.url) {
					await db.query(
						'INSERT INTO game_img ("gameId", url, sort) VALUES ($1, $2, $3)',
						[body.id, img.url, img.sort ?? i]
					)
				}
			}
		}

		// 文件清理：数据库写入成功后，删除被替换的旧文件（先写后删）
		const filesToDelete = []
		if (body.cover && oldRecord.cover && body.cover !== oldRecord.cover) {
			filesToDelete.push(extract_key(oldRecord.cover))
		}
		if (body.romPath && oldRecord.romPath && body.romPath !== oldRecord.romPath) {
			filesToDelete.push(extract_key(oldRecord.romPath))
		}
		// 异步清理旧文件，不阻塞响应
		for (const key of filesToDelete) {
			if (key) {
				try { await provider.deleteFile(BUCKET, key) } catch {}
			}
		}

		return base.respSuccess({ msg: '更新成功' })
	} catch (error) {
		return base.respFailure({ msg: `更新失败: ${error.message}` })
	}
}

/** 软删除游戏 */
actions.post.delete = async ({ body }) => {
	if (!body.id) return base.respFailure({ msg: 'id 参数缺失' })
	const ids = body.id.toString().split(',').filter(Boolean)
	try {
		const now = base.getTime()
		for (const id of ids) {
			await db.query('UPDATE game SET "deleteTime" = $1 WHERE id = $2', [now, id])
		}
		return base.respSuccess({ msg: `已移入回收站 ${ids.length} 条` })
	} catch (error) {
		return base.respFailure({ msg: `删除失败: ${error.message}` })
	}
}

/** 回收站列表 */
actions.get.selectDeleted = async ({ query }) => {
	const page = parseInt(query.page) || 1
	const pageSize = parseInt(query.pageSize) || 24
	const offset = (page - 1) * pageSize
	try {
		const countRes = await db.query('SELECT COUNT(*) FROM game WHERE "deleteTime" IS NOT NULL')
		const total = parseInt(countRes.rows[0].count)
		const listRes = await db.query(
			`SELECT id, name, cover, maker, "playCount", "deleteTime"
			 FROM game WHERE "deleteTime" IS NOT NULL
			 ORDER BY "deleteTime" DESC
			 LIMIT $1 OFFSET $2`,
			[pageSize, offset]
		)
		return base.respSuccess({ data: listRes.rows, total })
	} catch (error) {
		return base.respFailure({ msg: `查询失败: ${error.message}` })
	}
}

/** 恢复软删除游戏 */
actions.post.restore = async ({ body }) => {
	if (!body.id) return base.respFailure({ msg: 'id 参数缺失' })
	try {
		await db.query('UPDATE game SET "deleteTime" = NULL WHERE id = $1', [body.id])
		return base.respSuccess({ msg: '恢复成功' })
	} catch (error) {
		return base.respFailure({ msg: `恢复失败: ${error.message}` })
	}
}

/** 硬删除（清除文件 + 关联数据 + 主表） */
actions.post.hardDelete = async ({ body }) => {
	if (!body.id) return base.respFailure({ msg: 'id 参数缺失' })
	try {
		// 清理存储文件：列举 fc/{id}/ 前缀下所有文件
		try {
			const files = await provider.listFiles(BUCKET, { prefix: `fc/${body.id}/`, limit: 1000 })
			if (files?.items) {
				for (const file of files.items) {
					await provider.deleteFile(BUCKET, file.key)
				}
			}
		} catch {}

		// 删除所有关联表数据
		await db.query('DELETE FROM game_alias WHERE "gameId" = $1', [body.id])
		await db.query('DELETE FROM game_category_link WHERE "gameId" = $1', [body.id])
		await db.query('DELETE FROM game_tag_link WHERE "gameId" = $1', [body.id])
		await db.query('DELETE FROM game_img WHERE "gameId" = $1', [body.id])

		// 删除主表
		await db.query('DELETE FROM game WHERE id = $1', [body.id])

		return base.respSuccess({ msg: '永久删除成功' })
	} catch (error) {
		return base.respFailure({ msg: `删除失败: ${error.message}` })
	}
}

/** 新增分类 */
actions.post.insertCategory = async ({ body }) => {
	if (!body.name) return base.respFailure({ msg: 'name 参数缺失' })
	try {
		const res = await db.query(
			'INSERT INTO game_category (name, sort) VALUES ($1, $2) RETURNING id',
			[body.name, body.sort || 0]
		)
		return base.respSuccess({ msg: '新增成功', data: res.rows[0].id })
	} catch (error) {
		return base.respFailure({ msg: `新增失败: ${error.message}` })
	}
}

/** 更新分类 */
actions.post.updateCategory = async ({ body }) => {
	if (!body.id) return base.respFailure({ msg: 'id 参数缺失' })
	try {
		await db.query('UPDATE game_category SET name = $1, sort = $2 WHERE id = $3', [body.name, body.sort || 0, body.id])
		return base.respSuccess({ msg: '更新成功' })
	} catch (error) {
		return base.respFailure({ msg: `更新失败: ${error.message}` })
	}
}

/** 删除分类 */
actions.post.deleteCategory = async ({ body }) => {
	if (!body.id) return base.respFailure({ msg: 'id 参数缺失' })
	try {
		await db.query('DELETE FROM game_category_link WHERE "categoryId" = $1', [body.id])
		await db.query('DELETE FROM game_category WHERE id = $1', [body.id])
		return base.respSuccess({ msg: '删除成功' })
	} catch (error) {
		return base.respFailure({ msg: `删除失败: ${error.message}` })
	}
}

/** 新增标签 */
actions.post.insertTag = async ({ body }) => {
	if (!body.name) return base.respFailure({ msg: 'name 参数缺失' })
	try {
		const res = await db.query('INSERT INTO game_tag (name) VALUES ($1) RETURNING id', [body.name])
		return base.respSuccess({ msg: '新增成功', data: res.rows[0].id })
	} catch (error) {
		return base.respFailure({ msg: `新增失败: ${error.message}` })
	}
}

/** 删除标签 */
actions.post.deleteTag = async ({ body }) => {
	if (!body.id) return base.respFailure({ msg: 'id 参数缺失' })
	try {
		await db.query('DELETE FROM game_tag_link WHERE "tagId" = $1', [body.id])
		await db.query('DELETE FROM game_tag WHERE id = $1', [body.id])
		return base.respSuccess({ msg: '删除成功' })
	} catch (error) {
		return base.respFailure({ msg: `删除失败: ${error.message}` })
	}
}

/** 新增 Banner */
actions.post.insertBanner = async ({ body }) => {
	try {
		const now = base.getTime()
		const res = await db.query(
			'INSERT INTO game_banner ("gameId", image, link, sort, "insertTime") VALUES ($1, $2, $3, $4, $5) RETURNING id',
			[body.gameId || null, body.image || '', body.link || '', body.sort || 0, now]
		)
		return base.respSuccess({ msg: '新增成功', data: res.rows[0].id })
	} catch (error) {
		return base.respFailure({ msg: `新增失败: ${error.message}` })
	}
}

/** 更新 Banner */
actions.post.updateBanner = async ({ body }) => {
	if (!body.id) return base.respFailure({ msg: 'id 参数缺失' })
	try {
		const oldRes = await db.query('SELECT image FROM game_banner WHERE id = $1', [body.id])
		await db.query(
			'UPDATE game_banner SET "gameId" = $1, image = $2, link = $3, sort = $4 WHERE id = $5',
			[body.gameId || null, body.image || '', body.link || '', body.sort || 0, body.id]
		)
		// 清理旧图片
		if (oldRes.rowCount && body.image && oldRes.rows[0].image && body.image !== oldRes.rows[0].image) {
			const oldKey = extract_key(oldRes.rows[0].image)
			if (oldKey) try { await provider.deleteFile(BUCKET, oldKey) } catch {}
		}
		return base.respSuccess({ msg: '更新成功' })
	} catch (error) {
		return base.respFailure({ msg: `更新失败: ${error.message}` })
	}
}

/** 删除 Banner（含文件清理） */
actions.post.deleteBanner = async ({ body }) => {
	if (!body.id) return base.respFailure({ msg: 'id 参数缺失' })
	try {
		const oldRes = await db.query('SELECT image FROM game_banner WHERE id = $1', [body.id])
		await db.query('DELETE FROM game_banner WHERE id = $1', [body.id])
		// 清理图片文件
		if (oldRes.rowCount && oldRes.rows[0].image) {
			const key = extract_key(oldRes.rows[0].image)
			if (key) try { await provider.deleteFile(BUCKET, key) } catch {}
		}
		return base.respSuccess({ msg: '删除成功' })
	} catch (error) {
		return base.respFailure({ msg: `删除失败: ${error.message}` })
	}
}

// ============================== 工具函数 ==============================

/** 从完整 CDN URL 中提取存储 Key（去除域名前缀） */
function extract_key(url) {
	if (!url) return ''
	try {
		return new URL(url).pathname.slice(1) // 去掉开头的 /
	} catch {
		return url // 如果不是合法 URL 则原样返回（可能本身就是 key）
	}
}

// ============================== 路由分发 ==============================

export default async (req, resp) => {
	base.req = req
	base.resp = resp
	const { method, action, query, body } = base.getReqInfo()

	try {
		if (actions[method]?.[action]) {
			return await actions[method][action]({ query, body })
		}
		return base.respFailure({ msg: `未知操作: ${action}` })
	} catch (error) {
		return base.respFailure({ msg: `服务器内部错误: ${error.message}` })
	}
}
