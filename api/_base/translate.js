import crypto from 'crypto'

import base from '#api_util/base.js'

const actions = {
	get: {},
	post: {},
}

/**
 * 计算 sha256 hex 哈希值
 */
function hash_sha256(data) {
	return crypto.createHash('sha256').update(data).digest('hex')
}

/**
 * 计算 hmac-sha256 值 (返回 Buffer)
 */
function compute_hmac(key, data) {
	return crypto.createHmac('sha256', key).update(data).digest()
}

/**
 * 生成火山引擎 V4 签名请求头
 */
function sign_volcRequest(method, path, query, headers, body, service, region, ak, sk) {
	const isoStr = new Date().toISOString()
	const xDate = isoStr.replace(/[:-]/g, '').replace(/\.\d{3}/, '')
	const date = xDate.substring(0, 8)

	// 计算 Payload Hash
	const bodyStr = typeof body === 'string' ? body : JSON.stringify(body || '')
	const hashedPayload = hash_sha256(bodyStr)

	// 构建新的 headers (仅签名 host 和 x-date 确保兼容与精简)
	const newHeaders = {
		...headers,
		host: 'translate.volcengineapi.com',
		'x-date': xDate,
	}

	const signedHeadersKeys = ['host', 'x-date']
	const canonicalHeaders = signedHeadersKeys.map(k => `${k}:${String(newHeaders[k]).trim()}`).join('\n') + '\n'

	const signedHeaders = 'host;x-date'

	// 规范化查询参数
	const canonicalQuery = Object.keys(query)
		.sort()
		.map(key => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`)
		.join('&')

	// 构建规范请求
	const canonicalRequest = [method.toUpperCase(), path, canonicalQuery, canonicalHeaders, signedHeaders, hashedPayload].join('\n')

	const hashedCanonicalRequest = hash_sha256(canonicalRequest)
	const credentialScope = `${date}/${region}/${service}/request`

	// 待签字符串
	const stringToSign = ['HMAC-SHA256', xDate, credentialScope, hashedCanonicalRequest].join('\n')

	// 计算派生签名密钥
	const kDate = compute_hmac(sk, date)
	const kRegion = compute_hmac(kDate, region)
	const kService = compute_hmac(kRegion, service)
	const kSigning = compute_hmac(kService, 'request')

	// 计算最终签名
	const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

	// 返回发送请求时所需的全部 Headers
	const requestHeaders = {
		'Content-Type': 'application/json',
		Host: 'translate.volcengineapi.com',
		'X-Date': xDate,
		Authorization: `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
	}

	return requestHeaders
}

// 腾讯翻译接口
actions.get.tx = async options => {
	const { query } = options

	const rawText = query.text || query['text[]']

	if (!rawText) {
		return base.respFailure({
			msg: '必要参数缺失',
		})
	}

	const tencentcloud = await import('tencentcloud-sdk-nodejs-tmt')
	const TmtClient = tencentcloud.tmt.v20180321.Client

	// 请参见：https://cloud.tencent.com/document/product/1278/85305
	const clientConfig = {
		credential: {
			secretId: process.env.TENCENTCLOUD_SECRET_ID,
			secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
		},
		region: 'ap-seoul',
		profile: {
			httpProfile: {
				endpoint: 'tmt.tencentcloudapi.com',
			},
		},
	}

	const client = new TmtClient(clientConfig)

	const textList = Array.isArray(rawText) ? rawText : [rawText]

	const params = {
		ProjectId: +process.env.TENCENTCLOUD_PROJECT_ID,
		Source: query.source || 'auto',
		Target: query.target || 'zh',
		SourceTextList: textList,
	}

	try {
		const res = await client.TextTranslateBatch(params)
		const data = res.TargetTextList
		delete res.TargetTextList
		return base.respSuccess({
			...res,
			msg: '翻译成功',
			data: Array.isArray(rawText) ? data : data[0],
		})
	} catch (error) {
		console.error('腾讯翻译错误:', error)
		return base.respFailure({
			msg: `翻译失败：${error.message}`,
		})
	}
}

// 火山翻译接口
actions.get.hs = async options => {
	const { query } = options

	const rawText = query.text || query['text[]']

	if (!rawText) {
		return base.respFailure({
			msg: '必要参数缺失',
		})
	}

	const accessKeyId = process.env.VOLCENGINE_ACCESS_KEY_ID
	const secretAccessKey = process.env.VOLCENGINE_SECRET_ACCESS_KEY

	if (!accessKeyId || !secretAccessKey) {
		return base.respFailure({
			msg: '火山引擎 API 密钥未配置',
		})
	}

	const textList = Array.isArray(rawText) ? rawText : [rawText]
	const targetLanguage = query.target || 'zh'
	const sourceLanguage = query.source && query.source !== 'auto' ? query.source : undefined

	const requestBody = {
		TargetLanguage: targetLanguage,
		TextList: textList,
	}
	if (sourceLanguage) {
		requestBody.SourceLanguage = sourceLanguage
	}

	const service = 'translate'
	const region = 'cn-north-1'
	const host = 'translate.volcengineapi.com'
	const path = '/'
	const queryParams = {
		Action: 'TranslateText',
		Version: '2020-06-01',
	}

	try {
		// 生成 V4 签名 Headers
		const signedHeaders = sign_volcRequest('POST', path, queryParams, {}, requestBody, service, region, accessKeyId, secretAccessKey)

		// 发送 POST 请求到火山引擎
		const queryString = new URLSearchParams(queryParams).toString()
		const url = `https://${host}${path}?${queryString}`

		const response = await fetch(url, {
			method: 'POST',
			headers: signedHeaders,
			body: JSON.stringify(requestBody),
		})

		if (!response.ok) {
			const errorText = await response.text()
			return base.respFailure({
				msg: `火山引擎请求失败: HTTP ${response.status} - ${errorText}`,
			})
		}

		const resJson = await response.json()

		if (resJson.ResponseMetadata?.Error) {
			const errorDetail = resJson.ResponseMetadata.Error
			return base.respFailure({
				msg: `火山引擎翻译错误: [${errorDetail.Code}] ${errorDetail.Message}`,
			})
		}

		const translationList = resJson.TranslationList || []
		const translations = translationList.map(item => item.Translation)

		return base.respSuccess({
			...resJson,
			msg: '翻译成功',
			data: Array.isArray(rawText) ? translations : translations[0],
		})
	} catch (error) {
		console.error('火山翻译错误:', error)
		return base.respFailure({
			msg: `翻译失败：${error.message}`,
		})
	}
}

// 翻译接口 (GET) 映射入口，降级为 tx (腾讯)，后续随时切换其他接口
actions.get.translate = async options => {
	return await actions.get.tx(options)
}

export default async (req, resp) => {
	base.req = req
	base.resp = resp
	const { table, method, action, query, body } = base.getReqInfo()

	try {
		if (actions[method]?.[action]) {
			return await actions[method][action]({ query, body })
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
