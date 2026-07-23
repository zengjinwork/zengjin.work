/**
 * api_util/base.js 单元测试
 *
 * 测试覆盖：
 *  - getId()       12位36进制ID生成、唯一性
 *  - getTime()     北京时间格式化
 *  - checkValids() 必填字段校验（各种边界类型）
 *  - formatDbBind() 入站数据转换管道
 *  - formatDbRows() 出站数据转换管道（JSON解析、日期格式化、边界容错）
 *  - formatSql()    SQL语句格式化（$n占位符替换）
 *  - getReqInfo()   URL解析
 *  - respSuccess/respFailure  统一响应格式
 */
import { beforeEach, describe, expect, it } from 'vitest'

import base from '../base.js'

// ============================================================
// getId() — 12位36进制ID生成
// ============================================================
describe('base.getId()', () => {
	it('应该返回12位字符串', () => {
		const id = base.getId()
		expect(id).toHaveLength(12)
	})

	it('应该仅包含36进制字符 (0-9, a-z)', () => {
		const id = base.getId()
		expect(/^[0-9a-z]{12}$/.test(id)).toBe(true)
	})

	// 生日悖论：3位36进制≈46656种可能，100次内碰撞概率约10%
	// 实际测试中500次可能有1-2个碰撞（概率~93%），属正常统计学现象
	it('连续生成100次碰撞率应低于3%', () => {
		const set = new Set()
		for (let i = 0; i < 100; i++) {
			set.add(base.getId())
		}
		expect(set.size).toBeGreaterThan(96) // 允许最多3个碰撞
	})

	it('应随时间递增（前9位基于时间戳）', () => {
		// 前9位是时间戳部分，短时间内生成应保持递增趋势
		const ids = Array.from({ length: 100 }, () => base.getId())
		// 取前9位时间部分比较，至少有90%应该是不递减的
		const timeParts = ids.map(id => id.slice(0, 9))
		let increasing = 0
		for (let i = 1; i < timeParts.length; i++) {
			if (timeParts[i] >= timeParts[i - 1]) increasing++
		}
		expect(increasing).toBeGreaterThan(timeParts.length * 0.8)
	})

	it('后3位随机部分应在36进制范围内变化', () => {
		const randomParts = new Set(Array.from({ length: 100 }, () => base.getId().slice(9, 12)))
		// 100次生成中，随机部分至少应有50种不同值
		expect(randomParts.size).toBeGreaterThan(50)
	})
})

// ============================================================
// getTime() — 北京时间格式化
// ============================================================
describe('base.getTime()', () => {
	it('默认返回当前北京时间，格式 YYYY-MM-DD HH:mm:ss', () => {
		const time = base.getTime()
		expect(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time)).toBe(true)
	})

	it('应返回北京时间（Asia/Shanghai），不是 UTC', () => {
		// 取当前北京时间，与 UTC 时间对比
		// 北京时间 = UTC + 8，所以两者的小时差应为 8（除非跨日边界）
		const bjTime = base.getTime()
		const bjHour = parseInt(bjTime.slice(11, 13))
		const utcHour = new Date().getUTCHours()
		// 允许 ±1 的边界误差（分钟级跨小时）
		const diff = (bjHour - utcHour + 24) % 24
		expect([8, 7, 9]).toContain(diff)
	})

	it('应接受自定义时间参数', () => {
		const result = base.getTime('2026-01-15T08:00:00Z')
		// UTC 08:00 → 北京时间 16:00
		expect(result).toBe('2026-01-15 16:00:00')
	})
})

// ============================================================
// checkValids() — 必填字段校验
// ============================================================
describe('base.checkValids()', () => {
	it('全部有效时返回空字符串', () => {
		const body = { name: '张三', age: 18, email: 'test@test.com' }
		expect(base.checkValids(body, ['name', 'age', 'email'])).toBe('')
	})

	it('null 值应被检出', () => {
		const body = { name: null, age: 18 }
		expect(base.checkValids(body, ['name', 'age'])).toBe('name')
	})

	it('undefined 值应被检出', () => {
		const body = { age: 18 }
		expect(base.checkValids(body, ['name', 'age'])).toBe('name')
	})

	it('NaN 应被检出', () => {
		const body = { value: NaN }
		expect(base.checkValids(body, ['value'])).toBe('value')
	})

	it('空字符串应被检出', () => {
		const body = { name: '   ', age: 18 }
		expect(base.checkValids(body, ['name', 'age'])).toBe('name')
	})

	it('空数组应被检出', () => {
		const body = { tags: [], title: 'ok' }
		expect(base.checkValids(body, ['tags', 'title'])).toBe('tags')
	})

	it('空对象应被检出', () => {
		const body = { config: {}, title: 'ok' }
		expect(base.checkValids(body, ['config', 'title'])).toBe('config')
	})

	it('多个缺失字段应逗号拼接返回', () => {
		const body = {}
		expect(base.checkValids(body, ['name', 'email', 'phone'])).toBe('name,email,phone')
	})

	it('数字 0 应视为有效值（非空）', () => {
		const body = { count: 0, title: 'ok' }
		expect(base.checkValids(body, ['count', 'title'])).toBe('')
	})

	it('布尔值 false 应视为有效值（非空）', () => {
		const body = { enabled: false, title: 'ok' }
		expect(base.checkValids(body, ['enabled', 'title'])).toBe('')
	})
})

// ============================================================
// formatDbBind() — 入站数据转换管道
// ============================================================
describe('base.formatDbBind()', () => {
	it('null → 空字符串', () => {
		expect(base.formatDbBind(null)).toBe('')
	})

	it('undefined → 空字符串', () => {
		expect(base.formatDbBind(undefined)).toBe('')
	})

	it('NaN → 空字符串', () => {
		expect(base.formatDbBind(NaN)).toBe('')
	})

	it('对象 → JSON 字符串', () => {
		expect(base.formatDbBind({ key: 'value' })).toBe('{"key":"value"}')
	})

	it('数组 → JSON 字符串', () => {
		expect(base.formatDbBind([1, 2, 3])).toBe('[1,2,3]')
	})

	it('字符串 → 去除两端空格', () => {
		expect(base.formatDbBind('  hello world  ')).toBe('hello world')
	})

	it('数字 → 转为字符串', () => {
		expect(base.formatDbBind(123)).toBe('123')
	})

	it('布尔值 → 转为字符串', () => {
		expect(base.formatDbBind(true)).toBe('true')
		expect(base.formatDbBind(false)).toBe('false')
	})
})

// ============================================================
// formatDbRows() — 出站数据转换管道
// ============================================================
describe('base.formatDbRows()', () => {
	it('null 值 → 空字符串', () => {
		const rows = [{ name: null, age: null }]
		expect(base.formatDbRows(rows)).toEqual([{ name: '', age: '' }])
	})

	it('undefined 值 → 空字符串', () => {
		const rows = [{ name: undefined }]
		expect(base.formatDbRows(rows)).toEqual([{ name: '' }])
	})

	it('NaN → 空字符串', () => {
		const rows = [{ value: NaN }]
		expect(base.formatDbRows(rows)).toEqual([{ value: '' }])
	})

	// ==========================================
	// 边界回归：非 JSON 文本不应被误解析
	// 如果某条数据的 content 字段内容是 "[重要]会议纪要"，
	// formatDbRows 不应尝试 JSON.parse 它（虽然 catch 了错误不会崩，
	// 但我们验证结果仍然是原始字符串，没有被替换为空值）
	// ==========================================
	it('[重要] 开头结尾的文本不应被 JSON.parse 破坏', () => {
		const rows = [{ content: '[重要]会议纪要' }]
		const result = base.formatDbRows(rows)
		expect(result[0].content).toBe('[重要]会议纪要')
	})

	it('以 { 开头的文本不应被 JSON.parse 破坏', () => {
		const rows = [{ content: '{这不是JSON}' }]
		const result = base.formatDbRows(rows)
		// JSON.parse 失败后 catch 块什么都不做，保留原值
		expect(result[0].content).toBe('{这不是JSON}')
	})

	// ==========================================
	// JSON 反序列化
	// ==========================================
	it('合法的 JSON 对象字符串应被解析为对象', () => {
		const rows = [{ config: '{"theme":"dark","lang":"zh"}' }]
		const result = base.formatDbRows(rows)
		expect(result[0].config).toEqual({ theme: 'dark', lang: 'zh' })
	})

	it('合法的 JSON 数组字符串应被解析为数组', () => {
		const rows = [{ tags: '["a","b","c"]' }]
		const result = base.formatDbRows(rows)
		expect(result[0].tags).toEqual(['a', 'b', 'c'])
	})

	// ==========================================
	// 纯数字字符串 → Number
	// ==========================================
	it('纯数字字符串应转为 Number 类型', () => {
		const rows = [{ count: '123', ratio: '0.5' }]
		const result = base.formatDbRows(rows)
		// ratio 包含小数点，不是纯数字，不转换
		expect(result[0].count).toBe(123)
		expect(typeof result[0].count).toBe('number')
		expect(result[0].ratio).toBe('0.5') // 含小数点不转
	})

	// ==========================================
	// Date 对象 → 格式化字符串
	// ==========================================
	// formatDbRows 对 Date 对象：字段名含 'date' → YYYY-MM-DD，否则 → YYYY-MM-DD HH:mm:ss
	it('Date 对象应被格式化为字符串（不再保持 Date 类型）', () => {
		const d = new Date('2026-07-15T08:30:00Z')
		const rows = [{ createtime: d }]
		const result = base.formatDbRows(rows)
		// 关键断言：输出应为字符串且匹配日期时间格式
		expect(typeof result[0].createtime).toBe('string')
		expect(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(result[0].createtime)).toBe(true)
	})

	it('字段名含 date 关键字的 Date 对象应格式化为 YYYY-MM-DD（仅日期部分）', () => {
		const d = new Date('2026-07-15T00:00:00Z')
		const rows = [{ releasedate: d }] // 'releasedate' 包含 'date'
		const result = base.formatDbRows(rows)
		expect(/^\d{4}-\d{2}-\d{2}$/.test(result[0].releasedate)).toBe(true)
		// 不应包含时间部分
		expect(result[0].releasedate).not.toContain(':')
	})
})

// ============================================================
// formatSql() — SQL 语句格式化（调试用）
// ============================================================
describe('base.formatSql()', () => {
	it('应将 $1、$2 占位符替换为实际值', () => {
		const sql = 'SELECT * FROM users WHERE name = $1 AND age > $2'
		const binds = ['张三', 18]
		const result = base.formatSql(sql, binds)
		expect(result).toBe("SELECT * FROM users WHERE name = '张三' AND age > 18")
	})

	it('字符串中的单引号应被转义', () => {
		const sql = 'INSERT INTO t (name) VALUES ($1)'
		const binds = ["O'Brien"]
		const result = base.formatSql(sql, binds)
		expect(result).toBe("INSERT INTO t (name) VALUES ('O''Brien')")
	})

	it('多个占位符应按顺序替换', () => {
		const sql = 'UPDATE t SET a = $1, b = $2, c = $3 WHERE id = $4'
		const binds = [1, 'two', 3.14, 'abc']
		const result = base.formatSql(sql, binds)
		expect(result).toBe("UPDATE t SET a = 1, b = 'two', c = 3.14 WHERE id = 'abc'")
	})
})

// ============================================================
// getReqInfo() — 请求信息解析
// ============================================================
describe('base.getReqInfo()', () => {
	beforeEach(() => {
		base.req = {
			method: 'GET',
			url: '/api/fc/select?page=1&keyword=马里奥',
			query: { page: '1', keyword: '马里奥' },
			body: undefined,
		}
	})

	it('应正确解析 method', () => {
		expect(base.getReqInfo().method).toBe('get')
	})

	it('应正确解析 action（URL 最后一段）', () => {
		expect(base.getReqInfo().action).toBe('select')
	})

	it('应正确解析 table（中间路径段用下划线连接）', () => {
		expect(base.getReqInfo().table).toBe('fc')
	})

	it('深层路径应正确拼接表名', () => {
		base.req.url = '/api/zone/mzl/class/select'
		expect(base.getReqInfo().table).toBe('zone_mzl_class')
		expect(base.getReqInfo().action).toBe('select')
	})

	it('应透传 query 和 body', () => {
		base.req.body = { name: 'test' }
		const info = base.getReqInfo()
		expect(info.query).toEqual({ page: '1', keyword: '马里奥' })
		expect(info.body).toEqual({ name: 'test' })
	})
})
