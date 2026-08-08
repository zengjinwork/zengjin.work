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
 * 发送手机短信验证码
 * POST /api/demo/send_sms
 */
actions.post.send_sms = async ({ body }) => {
	const { phoneNumber, altchaPayload, recaptchaToken } = body || {}

	if (!phoneNumber) {
		return base.respFailure({ msg: '手机号不能为空' })
	}

	// 1. 若提供了 ALTCHA payload，进行人机验证
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
				return base.respFailure({ msg: '人机验证校验异常' })
			}
		}
	}

	// 2. 调用 Firebase Identity Toolkit REST API 服务端发码
	const apiKey = process.env.FIREBASE_WEB_API_KEY
	if (!apiKey) {
		return base.respFailure({ msg: '服务器缺少 FIREBASE_WEB_API_KEY 配置' })
	}

	try {
		const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${apiKey}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				phoneNumber,
				recaptchaToken: recaptchaToken || 'SERVER_BYPASS',
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
		// 1. 请求 Firebase REST API 校验验证码
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

		// 2. 尝试使用 Firebase Admin SDK 签发 Custom Token
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

