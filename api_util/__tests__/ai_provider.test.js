/**
 * api_util/ai_provider.js 服务商接入配置规范化单元测试
 *
 * 覆盖:
 *   ① derive_domainFromUrl 从 URL 提取服务商名 (IP/localhost/多级域/二级后缀/空值兜底)
 *   ② build_providerGroups 存量模型行分组派生 (组内首条非空 domain 优先 / 同 url 不同 key 隔离 / 空值兜底)
 */
import { describe, expect, it } from 'vitest'

import { build_providerGroups, derive_domainFromUrl } from '../ai_provider.js'

describe('服务商接入配置规范化', () => {
	it('derive_domainFromUrl 提取二级域名并首字母大写', () => {
		expect(derive_domainFromUrl('https://api.siliconflow.cn/v1/chat/completions')).toBe('Siliconflow')
		expect(derive_domainFromUrl('https://api.deepseek.com/chat/completions')).toBe('Deepseek')
		expect(derive_domainFromUrl('https://apihub.agnes-ai.com/v1')).toBe('Agnes-ai')
		expect(derive_domainFromUrl('https://openrouter.ai/api/v1')).toBe('Openrouter')
	})

	it('derive_domainFromUrl 缺省协议自动补齐', () => {
		expect(derive_domainFromUrl('example.com/v1')).toBe('Example')
	})

	it('derive_domainFromUrl 识别 IP 与 localhost', () => {
		expect(derive_domainFromUrl('http://192.168.1.1:3000/v1')).toBe('192.168.1.1')
		expect(derive_domainFromUrl('http://localhost:3000')).toBe('Localhost')
	})

	it('derive_domainFromUrl 处理二级后缀域名', () => {
		expect(derive_domainFromUrl('https://api.example.co.uk/v1')).toBe('Example')
		// com.cn 中 "com" 命中二级后缀, 品牌名取 "com" 前一级 (与前端 get_urlDomain 启发式一致)
		expect(derive_domainFromUrl('https://models.example.com.cn/v1')).toBe('Example')
	})

	it('derive_domainFromUrl 空值/非法输入兜底为空', () => {
		expect(derive_domainFromUrl('')).toBe('')
		expect(derive_domainFromUrl(null)).toBe('')
		expect(derive_domainFromUrl(':::')).toBe('')
		expect(derive_domainFromUrl(undefined)).toBe('')
	})

	it('build_providerGroups 组内首条非空 domain 优先', () => {
		const rows = [
			{ id: 'a', url: 'https://x.com/v1', key: 'k1', provider: 'openai', domain: 'XService' },
			{ id: 'b', url: 'https://x.com/v1', key: 'k1', provider: '', domain: '' },
		]
		const groups = build_providerGroups(rows)
		expect(groups).toHaveLength(1)
		expect(groups[0].name).toBe('XService')
		expect(groups[0].provider).toBe('openai')
		expect(groups[0].ids).toEqual(['a', 'b'])
	})

	it('build_providerGroups 同 url 不同 key 分组隔离', () => {
		const rows = [
			{ id: 'a', url: 'https://x.com/v1', key: 'k1', provider: 'openai', domain: 'X' },
			{ id: 'c', url: 'https://x.com/v1', key: 'k2', provider: 'openai', domain: '' },
			{ id: 'd', url: 'https://y.com/v1', key: 'k3', provider: 'claude', domain: 'Y' },
		]
		const groups = build_providerGroups(rows)
		expect(groups).toHaveLength(3)
		// 第二组无 domain, 用 URL 派生兜底
		expect(groups[1].name).toBe('X')
		expect(groups[1].url).toBe('https://x.com/v1')
		expect(groups[1].key).toBe('k2')
		expect(groups[1].ids).toEqual(['c'])
		// 第三组保留 claude 协议
		expect(groups[2].provider).toBe('claude')
		expect(groups[2].name).toBe('Y')
	})

	it('build_providerGroups 空值兜底 (URL 派生 / 未命名服务商 / 默认协议)', () => {
		const groups = build_providerGroups([
			{ id: 'a', url: 'https://api.siliconflow.cn/v1', key: 'k', provider: '', domain: '' },
			{ id: 'b', url: '', key: '', provider: '', domain: '' },
		])
		expect(groups).toHaveLength(2)
		expect(groups[0].name).toBe('Siliconflow')
		expect(groups[0].provider).toBe('openai')
		expect(groups[1].name).toBe('未命名服务商')
		expect(groups[1].provider).toBe('openai')
	})

	it('build_providerGroups 空数组/空输入安全', () => {
		expect(build_providerGroups([])).toEqual([])
		expect(build_providerGroups(null)).toEqual([])
	})
})
