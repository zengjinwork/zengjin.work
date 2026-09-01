import admin from 'firebase-admin'

/**
 * 读取 Identity Platform 管理端配置（含 reCAPTCHA / SMS defense 的真实服务端设置）
 * 用法：bun get_config.mjs
 */
const projectId = process.env.FIREBASE_PROJECT_ID
let privateKey = process.env.FIREBASE_PRIVATE_KEY
if (privateKey) {
	privateKey = privateKey.replace(/\\n/g, '\n').replace(/^"(.*)"$/, '$1')
}

const cert = admin.credential.cert({
	projectId,
	clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
	privateKey,
})
const { access_token } = await cert.getAccessToken()

const resp = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`, {
	headers: { Authorization: `Bearer ${access_token}` },
})
console.log('HTTP', resp.status)
console.log(await resp.text())
