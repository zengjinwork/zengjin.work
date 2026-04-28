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
	},

	post: {
		/**
		 * 登录
		 */
		login: async ({ req, resp, body }) => {
			const { username, password, turnstileToken } = body

			const invalids = base.checkValids(body, ['username', 'password', 'turnstileToken'])
			if (invalids) {
				return base.respFailure({ msg: `缺少必填参数: ${invalids}` })
			}

			// Turnstile 验证
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

			let users = []
			let queryError = null
			try {
				const result = await db.query('SELECT id, username, password, phone, nickname FROM base_user WHERE username = $1 LIMIT 1', [username])
				users = result.rows
			} catch (err) {
				queryError = err
			}

			if (queryError || !users || users.length === 0) {
				return base.respFailure({ msg: '用户名或密码错误' })
			}

			const user = users[0]
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
					'INSERT INTO base_user_session (user_id, refresh_token_hash, expires_at, user_agent, ip_address) VALUES ($1, $2, $3, $4, $5)',
					[user.id, tokenHash, expiresAt.toISOString(), userAgent, ipAddress]
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
					await db.query('UPDATE base_user_session SET revoked_at = $1 WHERE refresh_token_hash = $2', [new Date().toISOString(), tokenHash])
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
				const result = await db.query('SELECT id, user_id, expires_at, revoked_at FROM base_user_session WHERE refresh_token_hash = $1 LIMIT 1', [tokenHash])
				sessions = result.rows
			} catch (err) {
				queryError = err
			}

			if (queryError || !sessions || sessions.length === 0 || sessions[0].revoked_at || new Date(sessions[0].expires_at) < new Date()) {
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
				await db.query('UPDATE base_user_session SET revoked_at = $1 WHERE id = $2', [new Date().toISOString(), session.id])
			} catch (err) {
				console.error('更新 session 失败:', err)
			}

			const newAccessToken = generateAccessToken({ userId: user.id, username: user.username })
			const newRefreshToken = generateRefreshToken()
			const newTokenHash = hashToken(newRefreshToken)

			const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
			try {
				await db.query(
					'INSERT INTO base_user_session (user_id, refresh_token_hash, expires_at, user_agent, ip_address) VALUES ($1, $2, $3, $4, $5)',
					[user.id, newTokenHash, expiresAt.toISOString(), req.headers['user-agent'] || '', req.headers['x-forwarded-for'] || req.socket.remoteAddress || '']
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
				await db.query('UPDATE base_user_session SET revoked_at = $1 WHERE user_id = $2 AND revoked_at IS NULL', [new Date().toISOString(), userId])
			} catch (err) {
				console.error('作废 session 失败:', err)
			}

			return base.respSuccess({ msg: '密码修改成功' })
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
