import db from '#api_util/db.js'
import base from '#api_util/base.js'
import { decryptPassword, encryptPassword, hashToken } from '#api_util/crypto.js'
import { generateAccessToken, generateRefreshToken } from '#api_util/jwt.js'
import { requireAuth } from '#api_util/auth_middleware.js'

/**
 * 用户及身份认证相关接口
 * GET  /api/base/user/me
 * POST /api/base/user/login
 * POST /api/base/user/logout
 * POST /api/base/user/refresh
 * POST /api/base/user/update_password
 */
const actions = {
	get: {
		/**
		 * 获取当前用户信息
		 */
		me: requireAuth(async ({ req }) => {
			const { userId } = req.user

			let users = []
			let error = null
			try {
				const result = await db.query('SELECT id, username, phone, nickname FROM base_user WHERE id = $1 LIMIT 1', [userId])
				users = result.rows
			} catch (err) {
				error = err
			}

			if (error || !users || users.length === 0) {
				return base.respFailure({ msg: '用户不存在或获取失败' })
			}

			return base.respSuccess({
				msg: '获取成功',
				data: users[0],
			})
		}),

		/**
		 * 用户列表
		 */
		select: requireAuth(async ({ query }) => {
			const page = Number(query.current || 1)
			const size = Number(query.pageSize || 20)
			const offset = (page - 1) * size

			const wheres = []
			const binds = []
			if (query.username) {
				binds.push(`%${query.username}%`)
				wheres.push(`username ILIKE $${binds.length}`)
			}
			if (query.nickname) {
				binds.push(`%${query.nickname}%`)
				wheres.push(`nickname ILIKE $${binds.length}`)
			}

			const whereStr = wheres.length ? `WHERE ${wheres.join(' AND ')}` : ''
			const sql = `SELECT id, username, phone, nickname, "status", "statusTime", "createTime", "updateTime" FROM base_user ${whereStr} ORDER BY "createTime" DESC LIMIT $${binds.length + 1} OFFSET $${binds.length + 2}`
			const countSql = `SELECT count(*) as total FROM base_user ${whereStr}`

			try {
				const [res, countRes] = await Promise.all([db.query(sql, [...binds, size, offset]), db.query(countSql, binds)])
				return base.respSuccess({
					data: base.formatDbRows(res.rows),
					total: Number(countRes.rows[0].total),
				})
			} catch (err) {
				return base.respFailure({ msg: `查询失败: ${err.message}` })
			}
		}),

		/**
		 * 用户详情
		 */
		detail: requireAuth(async ({ query }) => {
			if (!query.id) return base.respFailure({ msg: 'ID不能为空' })
			try {
				const res = await db.query(
					'SELECT id, username, phone, nickname, "status", "statusTime", "createTime", "updateTime" FROM base_user WHERE id = $1',
					[query.id],
				)
				if (res.rowCount === 0) return base.respFailure({ msg: '用户不存在' })
				return base.respSuccess({ data: base.formatDbRows(res.rows)[0] })
			} catch (err) {
				return base.respFailure({ msg: `获取失败: ${err.message}` })
			}
		}),

		/**
		 * 生成 ALTCHA 人机验证挑战
		 */
		challenge: async ({ req, resp }) => {
			const hmacKey = process.env.CRYPTO_SECRET
			if (!hmacKey) {
				console.error('ALTCHA 配置错误: CRYPTO_SECRET 未设置')
				return base.respFailure({ msg: '验证码服务配置错误' })
			}
			try {
				const { createChallenge } = await import('altcha-lib/v1')
				const challenge = await createChallenge({
					hmacKey,
					maxNumber: 100000, // 生成难度，越大计算时间越长
				})
				return resp.status(200).json(challenge)
			} catch (error) {
				console.error('ALTCHA 挑战生成失败:', error)
				return base.respFailure({ msg: '验证码服务不可用' })
			}
		},
	},

	post: {
		/**
		 * 登录
		 */
		login: async ({ req, resp, body }) => {
			const { username, password, altchaPayload, turnstileToken } = body

			const invalids = base.checkValids(body, ['username', 'password'])
			if (invalids) {
				return base.respFailure({ msg: `缺少必填参数: ${invalids}` })
			}

			// 优先使用 ALTCHA 验证
			if (altchaPayload) {
				const hmacKey = process.env.CRYPTO_SECRET
				if (!hmacKey) {
					console.error('ALTCHA 验证失败: CRYPTO_SECRET 未设置')
					return base.respFailure({ msg: '服务器安全配置错误' })
				}
				try {
					const { verifySolution } = await import('altcha-lib/v1')
					const isValid = await verifySolution(altchaPayload, hmacKey)
					if (!isValid) {
						return base.respFailure({ msg: '人机验证失败，请重试' })
					}
				} catch (err) {
					console.error('ALTCHA 验证异常:', err)
					return base.respFailure({ msg: '人机验证服务异常' })
				}
			}
			// 兼容旧版的 Turnstile 验证 (备份)
			else if (turnstileToken) {
				try {
					const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded',
						},
						body: `secret=${process.env.TURNSTILE_SECRET_KEY}&response=${turnstileToken}`,
					})
					const verifyOutcome = await verifyRes.json()
					if (!verifyOutcome.success) {
						return base.respFailure({ msg: '人机验证失败，请重试' })
					}
				} catch (err) {
					console.error('Turnstile 验证异常:', err)
					return base.respFailure({ msg: '人机验证服务异常' })
				}
			}
			// 如果两个都没有传
			else {
				return base.respFailure({ msg: '请完成人机验证' })
			}

			let users = []
			let queryError = null
			try {
				const result = await db.query('SELECT id, username, password, phone, nickname, "status" FROM base_user WHERE username = $1 LIMIT 1', [username])
				users = result.rows
			} catch (err) {
				queryError = err
			}

			if (queryError || !users || users.length === 0) {
				return base.respFailure({ msg: '用户名或密码错误' })
			}

			const user = users[0]
			if (user.status === 0) {
				return base.respFailure({ msg: '该账号已被禁用，请联系管理员' })
			}

			let dbPassword
			try {
				dbPassword = decryptPassword(user.password)
			} catch (error) {
				return base.respFailure({ msg: '系统错误' })
			}

			if (dbPassword !== password) {
				return base.respFailure({ msg: '用户名或密码错误' })
			}

			const accessToken = generateAccessToken({ userId: user.id, username: user.username })
			const refreshToken = generateRefreshToken()
			const tokenHash = hashToken(refreshToken)

			const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
			const userAgent = req.headers['user-agent'] || ''
			const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''

			try {
				await db.query(
					'INSERT INTO base_user_session (user_id, "refreshTokenHash", "expireTime", "userAgent", "ipAddress") VALUES ($1, $2, $3, $4, $5)',
					[user.id, tokenHash, expiresAt.toISOString(), userAgent, ipAddress],
				)
			} catch (err) {
				console.error('保存 session 失败:', err)
			}

			const isProd = process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production'
			const cookieOptions = [
				`refreshToken=${refreshToken}`,
				'HttpOnly',
				'Path=/',
				`Max-Age=${7 * 24 * 60 * 60}`,
				isProd ? 'SameSite=None; Secure' : 'SameSite=Lax',
			].join('; ')
			resp.setHeader('Set-Cookie', cookieOptions)

			return base.respSuccess({
				msg: '登录成功',
				data: {
					token: accessToken,
					info: { id: user.id, username: user.username, phone: user.phone, nickname: user.nickname },
				},
			})
		},

		/**
		 * 退出登录
		 */
		logout: async ({ req, resp }) => {
			const cookies = req.headers.cookie || ''
			const refreshToken = cookies
				.split(';')
				.find(c => c.trim().startsWith('refreshToken='))
				?.split('=')[1]

			if (refreshToken) {
				const tokenHash = hashToken(refreshToken)
				try {
					await db.query('UPDATE base_user_session SET "revokeTime" = $1 WHERE "refreshTokenHash" = $2', [new Date().toISOString(), tokenHash])
				} catch (err) {
					console.error('更新 session 失败:', err)
				}
			}

			resp.setHeader('Set-Cookie', 'refreshToken=; HttpOnly; Path=/; Max-Age=0')
			return base.respSuccess({ msg: '退出成功' })
		},

		/**
		 * 刷新Token
		 */
		refresh: async ({ req, resp }) => {
			const cookies = req.headers.cookie || ''
			const refreshToken = cookies
				.split(';')
				.find(c => c.trim().startsWith('refreshToken='))
				?.split('=')[1]

			if (!refreshToken) return resp.status(401).json({ code: -1, msg: '未提供刷新令牌' })

			const tokenHash = hashToken(refreshToken)
			let sessions = []
			let queryError = null
			try {
				const result = await db.query('SELECT id, user_id, "expireTime", "revokeTime" FROM base_user_session WHERE "refreshTokenHash" = $1 LIMIT 1', [
					tokenHash,
				])
				sessions = result.rows
			} catch (err) {
				queryError = err
			}

			if (queryError || !sessions || sessions.length === 0 || sessions[0].revokeTime || new Date(sessions[0].expireTime) < new Date()) {
				return resp.status(401).json({ code: -1, msg: '刷新令牌无效或已过期' })
			}

			const session = sessions[0]
			let users = []
			let userError = null
			try {
				const result = await db.query('SELECT id, username FROM base_user WHERE id = $1 LIMIT 1', [session.user_id])
				users = result.rows
			} catch (err) {
				userError = err
			}

			if (userError || !users || users.length === 0) return resp.status(401).json({ code: -1, msg: '用户不存在' })

			const user = users[0]
			try {
				await db.query('UPDATE base_user_session SET "revokeTime" = $1 WHERE id = $2', [new Date().toISOString(), session.id])
			} catch (err) {
				console.error('更新 session 失败:', err)
			}

			const newAccessToken = generateAccessToken({ userId: user.id, username: user.username })
			const newRefreshToken = generateRefreshToken()
			const newTokenHash = hashToken(newRefreshToken)

			const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
			try {
				await db.query(
					'INSERT INTO base_user_session (user_id, "refreshTokenHash", "expireTime", "userAgent", "ipAddress") VALUES ($1, $2, $3, $4, $5)',
					[
						user.id,
						newTokenHash,
						expiresAt.toISOString(),
						req.headers['user-agent'] || '',
						req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
					],
				)
			} catch (err) {
				console.error('保存 session 失败:', err)
			}

			const isProd = process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production'
			const cookieOptions = [
				`refreshToken=${newRefreshToken}`,
				'HttpOnly',
				'Path=/',
				`Max-Age=${7 * 24 * 60 * 60}`,
				isProd ? 'SameSite=None; Secure' : 'SameSite=Lax',
			].join('; ')
			resp.setHeader('Set-Cookie', cookieOptions)

			return base.respSuccess({ msg: '刷新成功', data: { token: newAccessToken } })
		},

		/**
		 * 修改密码
		 */
		update_password: requireAuth(async ({ req, body }) => {
			const { passwordOld, passwordNew } = body
			const { userId } = req.user

			// 校验参数
			const invalids = base.checkValids(body, ['passwordOld', 'passwordNew'])
			if (invalids) {
				return base.respFailure({ msg: `缺少必填参数: ${invalids}` })
			}

			let users = []
			let queryError = null
			try {
				const result = await db.query('SELECT password FROM base_user WHERE id = $1 LIMIT 1', [userId])
				users = result.rows
			} catch (err) {
				queryError = err
			}

			if (queryError || !users || users.length === 0) {
				return base.respFailure({ msg: '用户不存在' })
			}

			const user = users[0]
			let dbPassword
			try {
				dbPassword = decryptPassword(user.password)
			} catch (error) {
				return base.respFailure({ msg: '系统解密错误' })
			}

			if (dbPassword !== passwordOld) {
				return base.respFailure({ msg: '原密码错误' })
			}

			// 更新密码
			const encryptedNewPassword = encryptPassword(passwordNew)
			let updateError = null
			try {
				await db.query('UPDATE base_user SET password = $1 WHERE id = $2', [encryptedNewPassword, userId])
			} catch (err) {
				updateError = err
			}

			if (updateError) {
				console.error('更新密码失败:', updateError)
				return base.respFailure({ msg: '修改密码失败，请稍后重试' })
			}

			// 修改成功后作废该用户所有的 Session
			try {
				await db.query('UPDATE base_user_session SET "revokeTime" = $1 WHERE user_id = $2 AND "revokeTime" IS NULL', [new Date().toISOString(), userId])
			} catch (err) {
				console.error('作废 session 失败:', err)
			}

			return base.respSuccess({ msg: '密码修改成功' })
		}),

		/**
		 * 新增用户
		 */
		insert: requireAuth(async ({ body }) => {
			const { username, password, nickname, phone, status = 1 } = body
			if (!username || !password) return base.respFailure({ msg: '用户名和密码不能为空' })

			try {
				// 检查重复
				const check = await db.query('SELECT id FROM base_user WHERE username = $1', [username])
				if (check.rowCount > 0) return base.respFailure({ msg: '用户名已存在' })

				const id = base.getId()
				const createTime = base.getTime()
				const encryptedPassword = encryptPassword(password)

				await db.query('INSERT INTO base_user (id, username, password, nickname, phone, "status", "createTime") VALUES ($1, $2, $3, $4, $5, $6, $7)', [
					id,
					username,
					encryptedPassword,
					nickname || '',
					phone || '',
					status,
					createTime,
				])
				return base.respSuccess({ msg: '新增成功', data: id })
			} catch (err) {
				return base.respFailure({ msg: `新增失败: ${err.message}` })
			}
		}),

		/**
		 * 修改用户
		 */
		update: requireAuth(async ({ body }) => {
			const { id, username, password, nickname, phone, status } = body
			if (!id) return base.respFailure({ msg: 'ID不能为空' })

			try {
				// 防护：防止将系统管理员 admin 改名或禁用
				if (username && username !== 'admin') {
					const checkAdmin = await db.query('SELECT username FROM base_user WHERE id = $1', [id])
					if (checkAdmin.rows.length && checkAdmin.rows[0].username === 'admin') {
						return base.respFailure({ msg: '系统内置管理员(admin)不允许修改用户名' })
					}
				}
				if (status === 0) {
					const checkAdmin = await db.query('SELECT username FROM base_user WHERE id = $1', [id])
					if (checkAdmin.rows.length && checkAdmin.rows[0].username === 'admin') {
						return base.respFailure({ msg: '系统内置管理员(admin)不允许被禁用' })
					}
				}

				const fields = []
				const binds = []

				if (username) {
					binds.push(username)
					fields.push(`username = $${binds.length}`)
				}
				if (password) {
					binds.push(encryptPassword(password))
					fields.push(`password = $${binds.length}`)
				}
				if (nickname !== undefined) {
					binds.push(nickname)
					fields.push(`nickname = $${binds.length}`)
				}
				if (phone !== undefined) {
					binds.push(phone)
					fields.push(`phone = $${binds.length}`)
				}
				if (status !== undefined) {
					binds.push(status)
					fields.push(`"status" = $${binds.length}`)

					binds.push(base.getTime())
					fields.push(`"statusTime" = $${binds.length}`)
				}

				binds.push(base.getTime())
				fields.push(`"updateTime" = $${binds.length}`)

				if (fields.length === 1) return base.respFailure({ msg: '没有需要更新的内容' })

				binds.push(id)
				const sql = `UPDATE base_user SET ${fields.join(', ')} WHERE id = $${binds.length}`
				await db.query(sql, binds)
				return base.respSuccess({ msg: '更新成功' })
			} catch (err) {
				return base.respFailure({ msg: `更新失败: ${err.message}` })
			}
		}),

		/**
		 * 删除用户
		 */
		delete: requireAuth(async ({ body }) => {
			const { id } = body
			if (!id) return base.respFailure({ msg: 'ID不能为空' })
			const ids = id.toString().split(',')

			try {
				// 防护：防止删除系统管理员 admin
				const checkAdmin = await db.query(`SELECT username FROM base_user WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`, ids)
				if (checkAdmin.rows.some(row => row.username === 'admin')) {
					return base.respFailure({ msg: '系统内置管理员(admin)不允许被删除' })
				}

				await db.query(`DELETE FROM base_user WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`, ids)
				return base.respSuccess({ msg: '删除成功' })
			} catch (err) {
				return base.respFailure({ msg: `删除失败: ${err.message}` })
			}
		}),
	},
}

export default async (req, resp) => {
	base.req = req
	base.resp = resp
	const { method, action, body, query } = base.getReqInfo()

	try {
		if (actions[method]?.[action]) {
			const handler = actions[method][action]
			// 这里的handler如果是由requireAuth包装的，它内部会自行处理校验和返回
			return await handler({ req, resp, body, query })
		}
		return base.respFailure({ msg: '无效的操作' })
	} catch (error) {
		console.error('接口处理错误:', error)
		return base.respFailure({ msg: `服务器内部错误: ${error.message}` })
	}
}
