import DypnsapiPackage from '@alicloud/dypnsapi20170525'
import OpenApiPackage from '@alicloud/openapi-client'
import UtilPackage from '@alicloud/tea-util'

/**
 * 兼容 ESM/CJS 的 SDK 构造器解析辅助函数
 */
function getConstructor(pkg, name) {
	if (!pkg) return null
	if (name) {
		if (typeof pkg[name] === 'function') return pkg[name]
		if (pkg.default && typeof pkg.default[name] === 'function') return pkg.default[name]
	}
	if (typeof pkg === 'function') return pkg
	if (typeof pkg.default === 'function') return pkg.default
	if (pkg.default && typeof pkg.default.default === 'function') return pkg.default.default
	return pkg[name] || pkg.default?.[name] || pkg
}

const DypnsapiClient = getConstructor(DypnsapiPackage)
const SendSmsVerifyCodeRequest = getConstructor(DypnsapiPackage, 'SendSmsVerifyCodeRequest')
const CheckSmsVerifyCodeRequest = getConstructor(DypnsapiPackage, 'CheckSmsVerifyCodeRequest')
const OpenApiConfig = getConstructor(OpenApiPackage, 'Config')
const RuntimeOptions = getConstructor(UtilPackage, 'RuntimeOptions')

/**
 * 创建阿里云 Dypnsapi 客户端
 */
function create_alicloudClient() {
	const accessKeyId = process.env.ALICLOUD_ACCESS_KEY_ID || process.env.ALIBABA_CLOUD_ACCESS_KEY_ID
	const accessKeySecret = process.env.ALICLOUD_ACCESS_KEY_SECRET || process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET

	if (!accessKeyId || !accessKeySecret) {
		throw new Error('未配置阿里云 AccessKey 凭证 (ALICLOUD_ACCESS_KEY_ID / ALICLOUD_ACCESS_KEY_SECRET)')
	}

	const config = new OpenApiConfig({
		accessKeyId,
		accessKeySecret,
		endpoint: process.env.ALICLOUD_SMS_ENDPOINT || 'dypnsapi.aliyuncs.com',
	})

	return new DypnsapiClient(config)
}

/**
 * 发送短信验证码
 * @param {string} phoneNumber 11位中国大陆手机号码
 * @returns {Promise<{ success: boolean, msg: string, data?: any }>}
 */
export async function send_smsVerifyCode(phoneNumber) {
	if (!phoneNumber || !/^1[3-9]\d{9}$/.test(phoneNumber)) {
		return { success: false, msg: '请输入有效的11位手机号码' }
	}

	const signName = process.env.ALICLOUD_SMS_SIGN_NAME || '速通互联验证服务'
	const templateCode = process.env.ALICLOUD_SMS_TEMPLATE_CODE || '100001'
	let templateParam = process.env.ALICLOUD_SMS_TEMPLATE_PARAM || '{"code":"##code##","min":"10"}'

	// 确保 templateParam 为合法标准 JSON 字符串
	if (typeof templateParam === 'object') {
		templateParam = JSON.stringify(templateParam)
	} else if (typeof templateParam === 'string') {
		try {
			// 去除两端可能残留的外层引号
			const unquoted = templateParam.trim().replace(/^['"]|['"]$/g, '')
			JSON.parse(unquoted)
			templateParam = unquoted
		} catch (e) {
			templateParam = '{"code":"##code##","min":"10"}'
		}
	}

	try {
		const client = create_alicloudClient()
		const sendRequest = new SendSmsVerifyCodeRequest({
			signName,
			templateCode,
			phoneNumber,
			templateParam,
		})
		const runtime = new RuntimeOptions({})
		const resp = await client.sendSmsVerifyCodeWithOptions(sendRequest, runtime)

		// 阿里云返回格式：resp.body.code / resp.body.message
		const body = resp?.body || {}
		if (body.code === 'OK') {
			return {
				success: true,
				msg: '验证码已发送，10分钟内有效',
				data: {
					bizId: body.model?.bizId,
				},
			}
		}

		// 常见错误码与流控提示中文化翻译
		const errorCodeMap = {
			'isv.BUSINESS_LIMIT_CONTROL': '短信发送过于频繁，请稍后再试',
			'isv.DAY_LIMIT_CONTROL': '今日短信发送次数已达上限',
			'isv.MOBILE_NUMBER_ILLEGAL': '手机号码格式不正确',
			'isv.AMOUNT_NOT_ENOUGH': '短信服务余额不足',
			'isv.SMS_SIGNATURE_ILLEGAL': '短信签名未审核或不合法',
			'isv.SMS_TEMPLATE_ILLEGAL': '短信模板未审核或不合法',
			'isp.SYSTEM_ERROR': '阿里云短信服务系统繁忙，请稍后重试',
			'isv.SYSTEM_ERROR': '阿里云短信服务系统繁忙，请稍后重试',
		}

		let errorMsg = errorCodeMap[body.code]
		if (!errorMsg && body.message) {
			if (/frequency/i.test(body.message)) {
				errorMsg = '短信发送过于频繁，请1分钟后再试'
			} else if (/internal error/i.test(body.message)) {
				errorMsg = '阿里云短信服务系统繁忙或配置不匹配，请稍后重试'
			} else {
				errorMsg = body.message
			}
		}
		if (!errorMsg) {
			errorMsg = '短信发送失败，请稍后重试'
		}

		console.error('[Aliyun SMS Send Error]', JSON.stringify(body, null, 2))
		return {
			success: false,
			msg: errorMsg,
			code: body.code,
		}
	} catch (error) {
		console.error('[Aliyun SMS Send Exception]', error)
		return {
			success: false,
			msg: error.message || '短信发送服务异常，请稍后重试',
		}
	}
}

/**
 * 核验短信验证码
 * @param {string} phoneNumber 手机号
 * @param {string} verifyCode 4位验证码
 * @returns {Promise<{ success: boolean, msg: string, data?: any }>}
 */
export async function check_smsVerifyCode(phoneNumber, verifyCode) {
	if (!phoneNumber || !verifyCode) {
		return { success: false, msg: '手机号和验证码不能为空' }
	}

	try {
		const client = create_alicloudClient()
		const checkRequest = new CheckSmsVerifyCodeRequest({
			phoneNumber,
			verifyCode,
		})
		const runtime = new RuntimeOptions({})
		const resp = await client.checkSmsVerifyCodeWithOptions(checkRequest, runtime)

		const body = resp?.body || {}
		// 阿里云核验成功条件：code === 'OK' 且 verifyResult === 'PASS'
		const verifyResult = body.model?.verifyResult
		if (body.code === 'OK' && (verifyResult === 'PASS' || verifyResult === 1 || verifyResult === '1')) {
			return {
				success: true,
				msg: '验证码核验成功',
				data: body.model,
			}
		}

		if (verifyResult === 'FAIL' || verifyResult === 0 || verifyResult === '0') {
			return {
				success: false,
				msg: '验证码错误或已过期，请重新输入',
			}
		}

		const errorCodeMap = {
			'isv.VERIFY_CODE_EXPIRED': '验证码已过期，请重新获取',
			'isv.VERIFY_CODE_ERROR': '验证码错误，请重新输入',
			'isv.BUSINESS_LIMIT_CONTROL': '验证尝试过于频繁，请稍后再试',
		}

		const errorMsg = errorCodeMap[body.code] || body.message || '验证码核验未通过，请检查'
		console.warn('[Aliyun SMS Verify Fail]', body)
		return {
			success: false,
			msg: errorMsg,
			code: body.code,
		}
	} catch (error) {
		console.error('[Aliyun SMS Verify Exception]', error)
		return {
			success: false,
			msg: error.message || '短信核验服务异常，请稍后重试',
		}
	}
}

export default {
	send_smsVerifyCode,
	check_smsVerifyCode,
}
