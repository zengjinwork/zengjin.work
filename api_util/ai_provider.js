/**
 * AI 聊天 - 服务商接入配置规范化 (纯函数, 零外部依赖)
 *
 * 用于 base_ai(模型) 抽离 base_ai_provider(服务商) 的存量迁移:
 *   ① 从 URL 提取服务商显示名 (与前端 ai_form.vue get_urlDomain 同款启发式, 服务端兜底真值)
 *   ② 把存量模型行按 (url, key) 分组, 派生每组服务商的 name/domain/provider
 */

// 二级后缀列表 (如 co.uk / com.cn 中 "co"/"com" 是后缀, 品牌名在其前一级)
const SECOND_SUFFIXES = ['com', 'net', 'org', 'gov', 'edu', 'co']

/**
 * ① 从 URL 提取服务商显示名 (取二级域名, 首字母大写)
 * - 兼容缺省协议 / IP / localhost / 多级域 / 二级后缀
 * - 解析失败或空串返回 ''
 */
export function derive_domainFromUrl(url) {
	if (!url) return ''
	try {
		let tempUrl = url
		if (!/^https?:\/\//i.test(tempUrl)) {
			tempUrl = 'http://' + tempUrl
		}
		const hostname = new URL(tempUrl).hostname
		const parts = hostname.split('.')
		let rawDomain = ''
		if (parts.length >= 2) {
			if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname === 'localhost') {
				rawDomain = hostname
			} else {
				const secondLast = parts[parts.length - 2]
				if (SECOND_SUFFIXES.includes(secondLast) && parts.length >= 3) {
					rawDomain = parts[parts.length - 3]
				} else {
					rawDomain = secondLast
				}
			}
		} else {
			rawDomain = hostname
		}
		if (!rawDomain) return ''
		return rawDomain.charAt(0).toUpperCase() + rawDomain.slice(1)
	} catch (e) {
		return ''
	}
}

/**
 * ② 把存量 base_ai 行按 (url, key) 分组, 派生每组服务商信息
 * @param {Array} rows 模型行 [{ id, url, key, provider, domain }]
 * @returns {Array} [{ url, key, provider, domain, name, ids: [] }]
 *   - name: 组内第一条非空 domain, 否则 derive_domainFromUrl(url), 再兜底 '未命名服务商'
 *   - provider: 组内首个非空, 默认 'openai'
 *   - domain: 组内首个非空 domain, 否则派生同名
 *   - 同 url 不同 key 会被分到不同组 (支持多套接入)
 */
export function build_providerGroups(rows) {
	const groups = []
	const index = new Map() // `${url}\x00${key}` -> group

	for (const row of rows || []) {
		const url = row.url || ''
		const key = row.key || ''
		const gkey = `${url}\x00${key}`
		let g = index.get(gkey)
		if (!g) {
			g = { url, key, provider: '', domain: '', name: '', ids: [] }
			index.set(gkey, g)
			groups.push(g)
		}
		g.ids.push(row.id)
		// 组内第一条非空值优先
		if (!g.name && row.domain) g.name = row.domain
		if (!g.domain && row.domain) g.domain = row.domain
		if (!g.provider && row.provider) g.provider = row.provider
	}

	for (const g of groups) {
		if (!g.name) g.name = derive_domainFromUrl(g.url) || '未命名服务商'
		g.provider = g.provider || 'openai'
	}
	return groups
}
