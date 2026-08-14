/**
 * AI 聊天 - 会话标题智能生成规则 (纯函数, 零外部依赖)
 *
 * 标题机制三层分工:
 *   ① 本地临时标题 (前端即时展示 + 失败兜底): clean_localTitle
 *   ② 智能提炼 (小模型对"首条用户消息 + 首条 AI 回复"提炼): build_titleMessages + clean_titleText
 *   ③ 手动改名锁定: titleSource='manual' 后自动机制永不覆盖 (由上层 session 管理实现)
 */

// 本地临时标题: 剥离常见礼貌引导词 (注意交替顺序, 长词在前; 不放"求/我想"等易误伤字)
const STRIP_PREFIX = /^(请问|请你|请|麻烦你|麻烦|帮我一下|帮我|能不能|可以帮我|能帮我)/

// 纯数学表达式 (仅数字与运算符)
const PURE_MATH = /^[\d\s+\-*\/^().,=<>%!?×÷:：]+$/

// 纯问候 / 寒暄 (标题应保持"新对话", 等待后续有效消息再提炼)
const GREETING = /^(你好|您好|嗨|哈喽|hi|hello|hey|在吗|在不在|早上好|下午好|晚上好|谢谢|感谢|再见|拜拜|嗯|好的|ok|是的|好的谢谢)[\s，。！？!?,.~～、]*$/i

/**
 * 是否为纯问候/寒暄消息
 * 纯问候的第一条消息不触发正式标题生成, 会话标题保持"新对话"
 */
export function is_pureGreeting(text) {
	const t = (text || '').trim()
	if (!t) return true
	return GREETING.test(t)
}

/**
 * ① 本地临时标题规则 (前端即时展示, 后端模型失败时兜底)
 * - 剥离 请问/请/帮我/麻烦 等礼貌前缀
 * - 纯数学表达式 → 「数学计算」
 * - 明显测试 → 「测试」
 * - 压缩空白 / 去尾标点 / 截断
 * - 纯问候 → 「新对话」
 */
export function clean_localTitle(text) {
	let t = (text || '').trim()
	if (is_pureGreeting(t)) return '新对话'
	const stripped = t.replace(STRIP_PREFIX, '').trim()
	if (PURE_MATH.test(stripped)) return '数学计算'
	if (/^(test|测试)$/i.test(stripped)) return '测试'
	t = stripped.replace(/\s+/g, ' ').trim()
	t = t.replace(/[。！？!?~～,.，、]+$/, '')
	if (t.length > 20) t = t.slice(0, 20) + '…'
	return t || '新对话'
}

// 智能提炼的系统提示 (小模型只输出标题本身)
// 中文优先: 除非对话内容为纯英文, 否则一律简体中文; 允许保留英文专有名词 (技术/模型/产品/品牌名等)
const TITLE_SYSTEM_PROMPT = `你是会话标题提炼助手。请根据用户的第一条消息与 AI 的首条回复，提炼出一个简短、准确、能代表该对话核心主题的标题。
要求:
- 只输出标题本身，不要任何解释、引号、标点或多余文字;
- 除纯英文对话外，一律使用简体中文; 中英混杂对话同样以中文为主;
- 英文专有名词 (如技术名称、模型名、产品名、品牌名) 可原样保留，其余内容译为中文;
- 标题不超过 20 个字符;
- 不要以"关于/如何/请问"等开头，直接给核心主题的名词短语。`

/**
 * ② 智能提炼的请求上下文 (首条用户消息 + 首条 AI 回复)
 */
export function build_titleMessages(userMessage, assistantMessage) {
	return [
		{ role: 'system', content: TITLE_SYSTEM_PROMPT },
		{
			role: 'user',
			content: `用户消息：${(userMessage || '').slice(0, 500)}\n\nAI 回复（摘要）：${(assistantMessage || '').slice(0, 800)}\n\n请提炼会话标题。`,
		},
	]
}

/**
 * ② 模型输出清洗: 去装饰引号 / 压缩空白 / 去尾句号 / 长度上限
 * 返回空串表示模型输出无效, 由调用方降级为本地临时标题
 */
export function clean_titleText(raw) {
	let t = (raw || '').trim()
	if (!t) return ''
	t = t.replace(/^[「『"“'‘《【(（\-—\s]+/, '').replace(/[」』"”'’》】)）\-—\s]+$/, '')
	t = t.replace(/\s+/g, ' ').trim()
	t = t.replace(/[。．！？!?.~～]+$/, '')
	if (t.length > 24) t = t.slice(0, 24)
	return t
}
