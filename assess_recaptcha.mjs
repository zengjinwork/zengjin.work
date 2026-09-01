import admin from 'firebase-admin'

/**
 * reCAPTCHA Enterprise token 体检脚本
 * 用法（在 zengjin.work-server 目录下，bun 会自动加载 .env）：
 *   bun assess_recaptcha.mjs <reCAPTCHA token>
 *
 * token 获取：浏览器 DevTools → Network → 失败的那个
 * POST identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode
 * → Payload 里的 captchaResponse 字段（有效期约 2 分钟，取完立即运行）。
 *
 * 前置：服务账号 FIREBASE_CLIENT_EMAIL（firebase-adminsdk）需具备
 *   roles/recaptchaenterprise.agent（reCAPTCHA Enterprise Agent）角色，
 *   否则 API 会返回 403 permission denied。
 */

const token = process.argv[2]
if (!token) {
	console.error('用法: bun assess_recaptcha.mjs <reCAPTCHA token>')
	process.exit(1)
}

const projectId = process.env.FIREBASE_PROJECT_ID
let privateKey = process.env.FIREBASE_PRIVATE_KEY
if (privateKey) {
	// 处理环境变量转义换行符
	privateKey = privateKey.replace(/\\n/g, '\n').replace(/^"(.*)"$/, '$1')
}

const cert = admin.credential.cert({
	projectId,
	clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
	privateKey,
})

// 取服务账号 OAuth access token
const { access_token } = await cert.getAccessToken()

// recaptchaConfig 下发的 site key（与前端一致）
const siteKey = process.env.FIREBASE_RECAPTCHA_SITE_KEY || '6Le9HIAtAAAAAMUEOvjS9eVYXGDo3pt7DebvQ0QN'

const resp = await fetch(`https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments`, {
	method: 'POST',
	headers: {
		Authorization: `Bearer ${access_token}`,
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({
		event: {
			token,
			siteKey,
			expectedAction: 'sendVerificationCode',
		},
	}),
})

const data = await resp.json()
console.log('HTTP', resp.status)
console.log(JSON.stringify(data, null, 2))
