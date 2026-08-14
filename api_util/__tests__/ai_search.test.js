/**
 * api_util/ai_search.js 联网搜索意图判定规则单元测试
 *
 * 覆盖自动搜索模式下的判定流水线:
 *   ③ 明确无需搜索 (数学/翻译/改写/总结/代码/问候/跟进) → NO_SEARCH
 *   ④ 明显需要实时信息 (显式搜索意图/强实时名词) → SEARCH
 *   ⑤ 模糊问题 → UNCERTAIN (交由小模型分类器)
 * 以及关键约束: ③ 必须优先于 ④ (避免"润色...最新..." / "计算2026×15" 误判为搜索)
 */
import { describe, expect, it } from 'vitest'

import { decide_searchByRule, rule_explicitNoSearch, rule_needRealtime } from '../ai_search.js'

describe('AI 联网搜索意图判定规则', () => {
	it('③ 明确无需搜索 (数学/翻译/改写/总结/代码/问候/跟进)', () => {
		const noSearchCases = [
			'123 × 456',
			'1000 / 17',
			'2^10',
			'计算 2026 × 15',
			'计算 2026 年的 15%',
			'计算这个数组的平均值',
			'把这段话翻译成英文',
			'Translate this into Chinese',
			'帮我润色这段话',
			'把这句话改得正式一点',
			'帮我改成小红书风格',
			'解释这段 Vue 代码',
			'帮我写一个 Vue3 组件',
			'帮我修复这个 JS Bug',
			'把这个函数改成 async/await',
			'总结下面这篇文章',
			'分析这段代码的问题',
			'继续',
			'你好',
			'太长了，缩短一点',
			'再详细一点',
		]
		for (const query of noSearchCases) {
			expect(rule_explicitNoSearch(query), query).toBe(true)
			expect(decide_searchByRule(query), query).toBe('NO_SEARCH')
		}
	})

	it('④ 明显需要实时信息', () => {
		const searchCases = [
			'今天北京天气怎么样',
			'现在英伟达股价多少',
			'最新的 Vue 版本是什么',
			'DeepSeek 最近有什么新闻',
			'帮我查一下苹果公司市值',
			'帮我搜一下最新的政策',
			'今天有 NBA 比赛吗',
			'现在美元兑人民币汇率多少',
		]
		for (const query of searchCases) {
			expect(rule_needRealtime(query), query).toBe(true)
			expect(decide_searchByRule(query), query).toBe('SEARCH')
		}
	})

	it('关键约束: ③ 明确无需搜索 必须 优先于 ④ 明显需要实时信息', () => {
		// 含"最新/2026"等敏感词, 但本质是润色/数学任务 → 不应搜索
		expect(decide_searchByRule('帮我润色"最新的 Vue 版本是……"')).toBe('NO_SEARCH')
		expect(decide_searchByRule('计算 2026 年的 15%')).toBe('NO_SEARCH')
	})

	it('⑤ 模糊问题交由小模型分类器 (UNCERTAIN)', () => {
		const uncertainCases = ['介绍一下 Vue', 'Vue 现在还有必要学吗', '它现在多少钱？', '帮我选一个合适的笔记本电脑']
		for (const query of uncertainCases) {
			expect(decide_searchByRule(query), query).toBe('UNCERTAIN')
		}
	})

	it('空输入安全降级为不搜索', () => {
		expect(decide_searchByRule('')).toBe('NO_SEARCH')
		expect(decide_searchByRule(null)).toBe('NO_SEARCH')
		expect(decide_searchByRule(undefined)).toBe('NO_SEARCH')
	})
})
