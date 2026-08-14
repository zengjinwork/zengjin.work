import admin from 'firebase-admin'

/**
 * 修改 Identity Platform 管理端 reCAPTCHA SMS defense 配置(用于隔离 tollFraud 阈值假设)
 *
 * 用法(在 zengjin.work-server 目录下,bun 自动加载 .env):
 *   bun patch_config.mjs audit          # phoneEnforcementState -> AUDIT(评估但不拦截,仅记录)
 *   bun patch_config.mjs enforce        # phoneEnforcementState -> ENFORCE(恢复拦截,当前状态)
 *   bun patch_config.mjs score 0.8      # tollFraudManagedRules.startScore -> 0.8(更宽松,官方推荐)
 *
 * 改完可运行 bun get_config.mjs 验证,再到 https://zengjin.work/demo 用真实号码复测。
 */
const mode = process.argv[2]
if (!['audit', 'enforce', 'score'].includes(mode)) {
	console.error('用法: bun patch_config.mjs audit | enforce | score <0.0-0.9>')
	process.exit(1)
}

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

const body = { recaptchaConfig: {} }
let updateMask = ''

if (mode === 'audit') {
	body.recaptchaConfig.phoneEnforcementState = 'AUDIT'
	updateMask = 'recaptchaConfig.phoneEnforcementState'
} else if (mode === 'enforce') {
	body.recaptchaConfig.phoneEnforcementState = 'ENFORCE'
	updateMask = 'recaptchaConfig.phoneEnforcementState'
} else if (mode === 'score') {
	const score = parseFloat(process.argv[3])
	if (isNaN(score) || score < 0 || score > 0.9) {
		console.error('score 需在 0.0 ~ 0.9 之间')
		process.exit(1)
	}
	body.recaptchaConfig.tollFraudManagedRules = [{ startScore: score, action: 'BLOCK' }]
	updateMask = 'recaptchaConfig.tollFraudManagedRules'
}

const resp = await fetch(
	`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=${updateMask}`,
	{
		method: 'PATCH',
		headers: {
			Authorization: `Bearer ${access_token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	}
)
console.log('HTTP', resp.status)
console.log(await resp.text())
