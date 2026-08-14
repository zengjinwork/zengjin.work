/**
 * api_util/ai_title.js 会话标题智能生成规则单元测试
 *
 * 覆盖标题机制三层分工:
 *   ① 本地临时标题规则 (剥离礼貌前缀/纯数学/明显测试/问候保持"新对话")
 *   ② 智能提炼的请求组装 (build_titleMessages) 与模型输出清洗 (clean_titleText)
 * 以及关键约束: 问候语不触发正式标题生成; 本地规则失败兜底
 */
import { describe, expect, it } from 'vitest'

import { build_titleMessages, clean_localTitle, clean_titleText, is_pureGreeting } from '../ai_title.js'

describe('AI 会话标题智能生成规则', () => {
	it('is_pureGreeting 识别纯问候/寒暄', () => {
		const greetingCases = ['你好', '您好', '嗨', 'hi', 'Hello!', '在吗', '早上好', '谢谢', '好的', 'ok', '好的谢谢', '嗯，', '']
		for (const q of greetingCases) {
			expect(is_pureGreeting(q), q).toBe(true)
		}
		const realCases = ['你好，帮我看看这个Vue报错', '今天天气怎么样', '解释一下什么是闭包', '在吗？帮个忙']
		for (const q of realCases) {
			expect(is_pureGreeting(q), q).toBe(false)
		}
	})

	it('① 剥离常见礼貌前缀', () => {
		expect(clean_localTitle('请问如何学习Vue')).toBe('如何学习Vue')
		expect(clean_localTitle('帮我写一个Vue组件')).toBe('写一个Vue组件')
		expect(clean_localTitle('麻烦翻译一下这句话')).toBe('翻译一下这句话')
		expect(clean_localTitle('请告诉我明天的天气')).toBe('告诉我明天的天气')
	})

	it('① 纯数学表达式 → 数学计算', () => {
		expect(clean_localTitle('2026 × 15')).toBe('数学计算')
		expect(clean_localTitle('2+2')).toBe('数学计算')
		expect(clean_localTitle('帮我 1000 / 17')).toBe('数学计算')
	})

	it('① 明显测试 → 测试', () => {
		expect(clean_localTitle('test')).toBe('测试')
		expect(clean_localTitle('测试')).toBe('测试')
		expect(clean_localTitle('TEST')).toBe('测试')
	})

	it('① 纯问候 → 保持"新对话"', () => {
		expect(clean_localTitle('你好')).toBe('新对话')
		expect(clean_localTitle('嗨')).toBe('新对话')
	})

	it('① 空白压缩 / 去尾标点 / 长度截断', () => {
		expect(clean_localTitle('  你好呀！  ')).toBe('你好呀')
		const long = '这个函数用于处理用户输入并进行格式化输出同时还要考虑各种边界情况'
		expect(clean_localTitle(long).length).toBe(21) // 20字 + 省略号
		expect(clean_localTitle(long)).toBe(long.slice(0, 20) + '…')
	})

	it('② 提炼 prompt 强制中文优先且允许保留英文专有名词', () => {
		const systemPrompt = build_titleMessages('帮我写一个 Vue3 组件', '好的').find(m => m.role === 'system').content
		expect(systemPrompt).toMatch(/简体中文/)
		expect(systemPrompt).toMatch(/英文专有名词/)
		expect(systemPrompt).toMatch(/纯英文对话/)
	})

	it('② 智能提炼请求组装 (首条用户消息 + 首条 AI 回复)', () => {
		const msgs = build_titleMessages('帮我写一个 Vue3 拖拽排序组件', '好的，我为你实现了 Sortable 表格组件……')
		expect(msgs).toHaveLength(2)
		expect(msgs[0].role).toBe('system')
		expect(msgs[1].role).toBe('user')
		expect(msgs[1].content).toContain('Vue3 拖拽排序组件')
		expect(msgs[1].content).toContain('Sortable 表格组件')
		// 超长内容截断保护
		const longMsgs = build_titleMessages('x'.repeat(900), 'y'.repeat(1200))
		expect(longMsgs[1].content).not.toContain('x'.repeat(501))
	})

	it('② 模型输出清洗: 去装饰/压缩空白/去尾句号/长度上限', () => {
		expect(clean_titleText('「Vue3 拖拽排序」')).toBe('Vue3 拖拽排序')
		expect(clean_titleText('  "如何学习Vue"  ')).toBe('如何学习Vue')
		expect(clean_titleText('  多行\n  压缩  测试。')).toBe('多行 压缩 测试')
		expect(clean_titleText('这是一个非常非常长的标题用来验证长度截断是否生效').length).toBe(24)
		expect(clean_titleText('')).toBe('')
		expect(clean_titleText(null)).toBe('')
	})
})
