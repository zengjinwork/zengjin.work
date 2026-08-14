import admin from 'firebase-admin'

/**
 * SMS Toll Fraud 专项评估脚本
 *
 * 模拟 Firebase 服务端在启用 useSmsTollFraudProtection 时对 token 的评估方式:
 * 在 event.userInfo.userIds[].phoneNumber 带上真实手机号(官方字段结构)。
 * 核心看两点:
 *   1) 这个"带手机号"的评估请求本身是否成功 —— CN(+86) 号码是否被 Toll Fraud 模型支持。
 *   2) 响应里是否有 phoneFraudAssessment.smsTollFraudVerdict.risk:
 *      - 有 → 读出 risk(0.0=安全 1.0=高危),与 tollFraudManagedRules.startScore(当前 0.5)比较。
 *      - 无 → 说明 Account Defender 或 SMS Toll Fraud Protection 未在 GCP 层启用,
 *             phoneFraudAssessment 不会返回 —— 这本身可能就是根因。
 *
 * 用法(在 zengjin.work-server 目录下,bun 自动加载 .env):
 *   bun assess_sms_tollfraud.mjs <reCAPTCHA token> <E.164手机号>
 *   e.g. bun assess_sms_tollfraud.mjs <token> +8615588964506
 *
 * token 获取: 浏览器 DevTools → Network → 失败的
 *   POST identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode
 *   → Payload 里的 captchaResponse 字段(有效期约 2 分钟,取完立即运行)。
 */

const token = process.argv[2]
const phoneNumber = process.argv[3]
if (!token || !phoneNumber) {
	console.error('用法: bun assess_sms_tollfraud.mjs <reCAPTCHA token> <E.164手机号>')
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

// 服务端 recaptchaConfig 下发的 WEB key(与前端一致)
const siteKey = '6Le9HIAtAAAAAMUEOvjS9eVYXGDo3pt7DebvQ0QN'

const resp = await fetch(
	`https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments`,
	{
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
				userInfo: {
					accountId: phoneNumber,
					userIds: [
						{ phoneNumber },
					],
				},
			},
		}),
	}
)

const data = await resp.json()
console.log('HTTP', resp.status)
console.log(JSON.stringify(data, null, 2))

if (resp.ok) {
	const props = data.tokenProperties || {}
	const v = data.phoneFraudAssessment?.smsTollFraudVerdict
	console.log('\n=== 结论速读 ===')
	console.log('token valid:', props.valid, '| 无效原因:', props.invalidReason || '无')
	console.log('标准 score:', data.riskAnalysis?.score ?? '无', '| 原因:', data.riskAnalysis?.reasons?.join(',') || '无')
	if (v && v.risk !== undefined) {
		console.log('Toll Fraud risk:', v.risk, '(0.0=安全 1.0=高危, 当前阈值 startScore 0.5 BLOCK)')
		console.log('判定:', v.risk >= 0.5 ? '❌ risk >= 0.5 → 命中阈值 BLOCK,短信会被拦截' : '✅ risk < 0.5 → 通过阈值,不应被 BLOCK')
		if (v.reasons?.length) console.log('Toll Fraud reasons:', v.reasons.join(','))
	} else {
		console.log('⚠️ 无 phoneFraudAssessment.smsTollFraudVerdict')
		console.log('   → 评估调用本身成功(200),但未返回 Toll Fraud 风险分。')
		console.log('   → 大概率是 GCP 层未启用: reCAPTCHA Account Defender 或 SMS Toll Fraud Protection。')
		console.log('   → 若 Firebase 服务端同款调用也拿不到 verdict,可能正是真实号码 400 的根因。')
	}
}
