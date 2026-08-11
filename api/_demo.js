import { checkAuth } from '#api_util/auth_middleware.js'
import base from '#api_util/base.js'
import db from '#api_util/db.js'
import get_firebase_admin from '#api_util/firebase_admin.js'

const actions = {
	get: {},
	post: {},
}

/* 简单示例 */
actions.get.hello = async options => {
	const { req, resp, query, body } = options
	return resp.status(200).json({
		message: '你好世界! 这是通过合并路由返回的。',
		timestamp: new Date().toISOString(),
	})
}

/**
 * sayhello 方法：返回 Hello 消息
 * 仅用于演示动态路由 [action].js 的方法分发
 */
actions.get.sayhello = async options => {
	const now = base.getTime()
	return base.respSuccess({
		data: {
			info: 'Hello from /api/base/demo/sayhello',
			time: now,
		},
	})
}

/**
 * sayhi 方法：返回 Hi 消息
 * 仅用于演示动态路由 [action].js 的方法分发
 */
actions.get.sayhi = async options => {
	const now = base.getTime()
	return base.respSuccess({
		msg: '请求成功',
		data: {
			info: 'Hi from /api/base/demo/sayhi',
			time: now,
		},
	})
}

/* 鉴权测试 */
actions.get.auth = async options => {
	// 直接在此拦截。如果不通过，checkAuth 内部会自动执行 resp.status 并结束流返回 false
	if (!(await checkAuth(base.req, base.resp))) {
		return
	}

	try {
		const { userId, username } = base.req.user
		return base.respSuccess({
			msg: '操作成功。这是一个受保护的接口，只有登录用户才能访问。',
			data: {
				user: { userId, username },
				time: base.getTime(),
				random: Math.random(),
			},
		})
	} catch (error) {
		return base.respFailure({ msg: `服务器内部错误: ${error.message}` })
	}
}

/**
 * 获取 Firebase reCAPTCHA Site Key 配置
 * GET /api/demo/recaptcha_config
 */
actions.get.recaptcha_config = async () => {
	const apiKey = process.env.FIREBASE_WEB_API_KEY
	if (!apiKey) {
		return base.respFailure({ msg: '服务器缺少 FIREBASE_WEB_API_KEY 配置' })
	}

	try {
		const response = await fetch(`https://identitytoolkit.googleapis.com/v1/recaptchaParams?key=${apiKey}`)
		const data = await response.json()
		if (data.error) {
			return base.respFailure({ msg: data.error.message })
		}
		// recaptchaParams 返回官方真实的 recaptchaSiteKey 与 recaptchaStoken
		return base.respSuccess({
			data: {
				recaptchaSiteKey: data.recaptchaSiteKey || '',
				recaptchaStoken: data.recaptchaStoken || '',
				version: data.version || 'V2_INVISIBLE',
			},
		})
	} catch (error) {
		return base.respFailure({ msg: `获取配置失败: ${error.message}` })
	}
}

/**
 * 发送手机短信验证码
 * POST /api/demo/send_sms
 */
actions.post.send_sms = async ({ body }) => {
	const { phoneNumber, altchaPayload, recaptchaToken } = body || {}

	if (!phoneNumber) {
		return base.respFailure({ msg: '手机号不能为空' })
	}

	// 1. 若提供了 ALTCHA payload，进行二次双重人机校验（安全防护）
	if (altchaPayload) {
		const hmacKey = process.env.CRYPTO_SECRET
		if (hmacKey) {
			try {
				const { verifySolution } = await import('altcha-lib/v1')
				const isValid = await verifySolution(altchaPayload, hmacKey)
				if (!isValid) {
					return base.respFailure({ msg: 'ALTCHA 人机验证未通过' })
				}
			} catch (err) {
				console.error('ALTCHA 校验异常:', err)
				return base.respFailure({ msg: 'ALTCHA 人机验证校验异常' })
			}
		}
	}

	// 2. 调用 Firebase Identity Toolkit REST API 服务端发码
	const apiKey = process.env.FIREBASE_WEB_API_KEY
	if (!apiKey) {
		return base.respFailure({ msg: '服务器缺少 FIREBASE_WEB_API_KEY 配置' })
	}

	if (!recaptchaToken) {
		return base.respFailure({ msg: '未包含有效的 reCAPTCHA 人机凭证' })
	}

	try {
		const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${apiKey}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				phoneNumber,
				captchaResponse: recaptchaToken,
				recaptchaToken: recaptchaToken,
				clientType: 'CLIENT_TYPE_WEB',
			}),
		})

		const data = await response.json()
		if (data.error) {
			console.error('Firebase sendVerificationCode Error:', data.error)
			return base.respFailure({ msg: `发送失败: ${data.error.message}` })
		}

		return base.respSuccess({
			msg: '验证码发送成功',
			data: { sessionInfo: data.sessionInfo },
		})
	} catch (error) {
		console.error('发送短信异常:', error)
		return base.respFailure({ msg: `网络或接口通信异常: ${error.message}` })
	}
}

/**
 * 校验手机短信验证码
 * POST /api/demo/verify_code
 * @deprecated 已被 verify_token 替代，保留作兼容备用
 */
actions.post.verify_code = async ({ body }) => {
	const { sessionInfo, code } = body || {}

	if (!sessionInfo || !code) {
		return base.respFailure({ msg: 'sessionInfo 和验证码均不能为空' })
	}

	const apiKey = process.env.FIREBASE_WEB_API_KEY
	if (!apiKey) {
		return base.respFailure({ msg: '服务器缺少 FIREBASE_WEB_API_KEY 配置' })
	}

	try {
		const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${apiKey}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sessionInfo, code }),
		})

		const data = await response.json()
		if (data.error) {
			console.error('Firebase signInWithPhoneNumber Error:', data.error)
			return base.respFailure({ msg: `验证失败: ${data.error.message}` })
		}

		let customToken = null
		try {
			const admin = get_firebase_admin()
			if (admin && admin.apps.length) {
				customToken = await admin.auth().createCustomToken(data.localId, { phoneNumber: data.phoneNumber })
			}
		} catch (adminErr) {
			console.warn('Firebase Admin Token 签发失败:', adminErr.message)
		}

		return base.respSuccess({
			msg: '验证成功',
			data: {
				uid: data.localId,
				phoneNumber: data.phoneNumber,
				idToken: data.idToken,
				refreshToken: data.refreshToken,
				customToken,
			},
		})
	} catch (error) {
		console.error('校验短信验证码异常:', error)
		return base.respFailure({ msg: `服务端校验失败: ${error.message}` })
	}
}

/**
 * 校验前端登录成功后颁发的 Firebase idToken，并签发系统级 Custom Token
 * POST /api/demo/verify_token
 */
actions.post.verify_token = async ({ body }) => {
	const { idToken } = body || {}

	if (!idToken) {
		return base.respFailure({ msg: 'idToken 不能为空' })
	}

	try {
		const admin = get_firebase_admin()
		if (!admin || !admin.apps.length) {
			return base.respFailure({ msg: 'Firebase Admin SDK 未正常初始化，请检查服务端环境变量' })
		}

		// 使用 Firebase Admin 验证前端传来的 idToken
		const decodedToken = await admin.auth().verifyIdToken(idToken)

		// 签发 Custom Token（含手机号 claim）
		const customToken = await admin.auth().createCustomToken(decodedToken.uid, {
			phoneNumber: decodedToken.phone_number,
		})

		return base.respSuccess({
			msg: '身份验证成功',
			data: {
				uid: decodedToken.uid,
				phoneNumber: decodedToken.phone_number,
				customToken,
			},
		})
	} catch (error) {
		console.error('Firebase idToken 验证失败:', error)
		return base.respFailure({ msg: `身份验证失败: ${error.message}` })
	}
}

// 这是被总开关包含在内的隐形控制器模块
export default async (req, resp) => {
	base.req = req
	base.resp = resp

	const { table, method, action, query, body } = base.getReqInfo()

	try {
		if (actions[method]?.[action]) {
			return await actions[method][action]({ req, resp, query, body })
		} else {
			return base.respFailure({
				msg: '请求类型或方法无效',
			})
		}
	} catch (error) {
		return base.respFailure({
			msg: `服务器内部错误: ${error.message}`,
		})
	}
}
