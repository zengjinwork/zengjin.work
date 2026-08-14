import { decide_searchByRule } from '#api_util/ai_search.js'
import { build_titleMessages, clean_localTitle, clean_titleText } from '#api_util/ai_title.js'
import { requireAuth } from '#api_util/auth_middleware.js'
import base from '#api_util/base.js'
import db from '#api_util/db.js'
import { verifyAccessToken } from '#api_util/jwt.js'

// 核心初始化状态（Boolean 命名符合规则：ed 后缀，无 is 前缀）
let dbInitialized = false

/**
 * 确保数据库表和预设数据已初始化 (异步，首个请求触发)
 */
async function ensure_dbInitialized_async() {
	if (dbInitialized) return

	// 创建模型配置表
	await db.query(`
		CREATE TABLE IF NOT EXISTS base_ai (
			id VARCHAR(255) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			domain VARCHAR(255),
			provider VARCHAR(50) NOT NULL DEFAULT 'openai',
			url VARCHAR(500) NOT NULL,
			key VARCHAR(500) NOT NULL,
			model VARCHAR(255) NOT NULL,
			"desc" TEXT,
			status INT NOT NULL DEFAULT 1,
			"isReasoning" INT NOT NULL DEFAULT 0,
			sort INT NOT NULL DEFAULT 0,
			speed INT NOT NULL DEFAULT 2,
			"createTime" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			"updateTime" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`)

	// 自动补齐 domain 字段
	await db.query('ALTER TABLE base_ai ADD COLUMN IF NOT EXISTS domain VARCHAR(255)')

	// 自动补齐联网搜索能力字段 (1=支持/允许联网搜索, 0=关闭)
	await db.query('ALTER TABLE base_ai ADD COLUMN IF NOT EXISTS "search" INT NOT NULL DEFAULT 1')

	// 自动补齐响应速度字段 (1=快 2=中 3=慢, 前台下拉展示对应标签)
	await db.query('ALTER TABLE base_ai ADD COLUMN IF NOT EXISTS "speed" INT NOT NULL DEFAULT 2')

	// 创建会话表 (user_id 关联 base_user)
	await db.query(`
		CREATE TABLE IF NOT EXISTS base_ai_session (
			id VARCHAR(255) PRIMARY KEY,
			user_id VARCHAR(255) REFERENCES base_user(id) ON DELETE CASCADE,
			title VARCHAR(255) NOT NULL,
			"modelId" VARCHAR(255) NOT NULL,
			"createTime" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			"updateTime" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`)

	// 自动补齐标题来源字段 (auto=自动提炼 / manual=用户手动改名, 手动后自动机制永不覆盖)
	await db.query('ALTER TABLE base_ai_session ADD COLUMN IF NOT EXISTS "titleSource" VARCHAR(20) NOT NULL DEFAULT \'auto\'')

	// 创建消息表
	await db.query(`
		CREATE TABLE IF NOT EXISTS base_ai_message (
			id VARCHAR(255) PRIMARY KEY,
			"sessionId" VARCHAR(255) NOT NULL REFERENCES base_ai_session(id) ON DELETE CASCADE,
			role VARCHAR(50) NOT NULL,
			content TEXT NOT NULL,
			"reasoningContent" TEXT,
			"modelId" VARCHAR(255),
			"createTime" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`)

	// 插入默认预设模型 (如果为空)
	const countRes = await db.query('SELECT COUNT(*) FROM base_ai')
	if (parseInt(countRes.rows[0].count) === 0) {
		const presets = [
			// [id, name, provider, url, key, model, desc, status, isReasoning, sort, speed]
			[
				'deepseek-v4-pro',
				'DeepSeek v4 Pro',
				'openai',
				'https://api.deepseek.com/chat/completions',
				'sk-6accace0d21247ba9260e07ab7c3cfc4',
				'deepseek-v4-pro',
				'DeepSeek V4 Pro 旗舰模型',
				1,
				0,
				10,
				2,
			],
			[
				'deepseek-v4-flash',
				'DeepSeek v4 Flash',
				'openai',
				'https://api.deepseek.com/chat/completions',
				'sk-6accace0d21247ba9260e07ab7c3cfc4',
				'deepseek-v4-flash',
				'DeepSeek V4 Flash 快速响应模型',
				1,
				0,
				20,
				1,
			],
			[
				'agnes-2.0-flash',
				'Agnes 2.0 Flash',
				'openai',
				'https://apihub.agnes-ai.com/v1/chat/completions',
				'sk-h3yBwXGzolLZ1wqmz5ZpY5xW5Xy7vrbsqYGaElM2E8h1EFFQ',
				'agnes-2.0-flash',
				'Agnes AI 快速闪电模型',
				1,
				0,
				30,
				1,
			],
			[
				'nex-n2-pro',
				'Nex N2 Pro',
				'openai',
				'https://api.deepseek.com/chat/completions',
				'sk-wxicemrpvaokztekssdrytrzrogdvopemsqbozfljhpcgdrx',
				'nex-agi/Nex-N2-Pro',
				'Nex AGI 智能推理模型',
				1,
				1,
				40,
				3,
			],
			[
				'deepseek-r1-qwen-8b',
				'DeepSeek R1 Qwen 8B',
				'openai',
				'https://api.deepseek.com/chat/completions',
				'sk-wxicemrpvaokztekssdrytrzrogdvopemsqbozfljhpcgdrx',
				'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
				'DeepSeek R1 Qwen3 8B 蒸馏推理模型',
				1,
				1,
				50,
				3,
			],
			[
				'qwen3.5-4b',
				'Qwen 3.5 4B',
				'openai',
				'https://api.deepseek.com/chat/completions',
				'sk-wxicemrpvaokztekssdrytrzrogdvopemsqbozfljhpcgdrx',
				'Qwen/Qwen3.5-4B',
				'通义千问 Qwen3.5 4B 基础模型',
				1,
				0,
				60,
				2,
			],
			[
				'hunyuan-mt-7b',
				'Hunyuan MT 7B',
				'openai',
				'https://api.deepseek.com/chat/completions',
				'sk-wxicemrpvaokztekssdrytrzrogdvopemsqbozfljhpcgdrx',
				'tencent/Hunyuan-MT-7B',
				'腾讯混元多语言 Hunyuan MT 7B',
				1,
				0,
				70,
				2,
			],
			[
				'bge-m3',
				'BGE M3',
				'openai',
				'https://api.deepseek.com/chat/completions',
				'sk-wxicemrpvaokztekssdrytrzrogdvopemsqbozfljhpcgdrx',
				'BAAI/bge-m3',
				'北京人工智能研究院 BGE M3 向量/多功能模型',
				1,
				0,
				80,
				2,
			],
		]
		for (const p of presets) {
			await db.query(
				`
				INSERT INTO base_ai (id, name, provider, url, key, model, "desc", status, "isReasoning", sort, speed)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
			`,
				p,
			)
		}
	}

	dbInitialized = true
}

/**
 * 提取令牌中附带的用户上下文 (可空，用于兼容游客模式)
 */
function select_authUser(req) {
	const authHeader = req.headers.authorization || req.headers.Authorization
	if (!authHeader) return null
	const parts = authHeader.split(' ')
	if (parts.length !== 2 || parts[0] !== 'Bearer') return null
	try {
		const decoded = verifyAccessToken(parts[1])
		return {
			userId: decoded.userId,
			username: decoded.username,
		}
	} catch (e) {
		return null
	}
}

// ------------------------------------ 联网搜索辅助 ------------------------------------

/**
 * 提取最近一条用户提问作为搜索关键词
 */
function extract_searchQuery(messages) {
	if (!Array.isArray(messages)) return ''
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === 'user' && messages[i].content) {
			return messages[i].content.trim().slice(0, 300)
		}
	}
	return ''
}

/**
 * 联网搜索参数注入
 * 1) 上游原生支持搜索 (OpenRouter/Aihubmix) 时直接注入官方参数
 * 2) 其余上游通过网关侧搜索 (需配置 SEARCH_API_KEY) 将实时结果拼入上下文, 不依赖上游能力
 */
async function enable_webSearch_async(targetBody, modelConfig, messages) {
	const url = modelConfig.url || ''

	// 原生支持: OpenRouter Web 插件
	if (url.includes('openrouter.ai')) {
		targetBody.plugins = [{ id: 'web' }]
		return
	}

	// 原生支持: Aihubmix LLM Search
	if (url.includes('aihubmix.com')) {
		targetBody.web_search_options = {}
		return
	}

	// 网关侧搜索兜底 (通用方案, 需要配置 SEARCH_API_KEY)
	const searchApiKey = process.env.SEARCH_API_KEY || process.env.TAVILY_API_KEY
	if (!searchApiKey) return

	const query = extract_searchQuery(messages)
	if (!query) return

	try {
		const results = await search_tavily_async(query, searchApiKey)
		if (results.length > 0) {
			targetBody.messages = [{ role: 'system', content: build_searchContext(results) }, ...messages]
		}
	} catch (error) {
		// 搜索失败不阻断对话, 仅降级为无联网搜索
		console.warn('[AI Search] 网关侧搜索失败:', error.message)
	}
}

/**
 * 调用 Tavily 搜索接口获取实时信息
 */
async function search_tavily_async(query, apiKey) {
	const resp = await fetch('https://api.tavily.com/search', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			api_key: apiKey,
			query,
			search_depth: 'basic',
			max_results: 5,
			include_answer: true,
		}),
	})
	if (!resp.ok) {
		throw new Error(`Tavily 接口异常 HTTP ${resp.status}`)
	}
	const data = await resp.json()
	const results = []
	if (data.answer) {
		results.push({ title: 'AI 摘要', content: data.answer, url: '' })
	}
	for (const item of data.results || []) {
		results.push({
			title: item.title || '无标题',
			content: (item.content || '').slice(0, 500),
			url: item.url || '',
		})
	}
	return results
}

/**
 * 将搜索结果组装为注入上下文的 system 消息
 */
function build_searchContext(results) {
	const lines = ['以下是联网搜索到的实时信息，请基于这些信息并结合你的知识回答用户的问题：']
	results.forEach((item, index) => {
		lines.push(`${index + 1}. ${item.title}${item.url ? `（来源: ${item.url}）` : ''}\n${item.content}`)
	})
	return lines.join('\n\n')
}

// ------------------------------------ 联网搜索意图判定 ------------------------------------

const CLASSIFY_SYSTEM_PROMPT =
	'你是搜索意图分类器。只判断用户最新提问是否需要"实时联网信息"才能更好回答，返回且仅返回一个单词：SEARCH 或 NO_SEARCH 或 UNCERTAIN，不要输出任何其他内容。'

/**
 * ⑤ 小模型分类器: 判断模糊问题是否需要实时搜索
 * 复用当前模型做一次极小的非流式判定; 异常/超时/非法返回统一降级为 NO_SEARCH (安全优先, 不浪费搜索额度)
 */
async function classify_searchIntent_async(modelConfig, messages) {
	// 携带最近若干轮上下文, 解决多轮对话中的省略表达 ("它现在多少钱?")
	const context = (messages || [])
		.slice(-5)
		.map(m => `${m.role === 'user' ? '用户' : '助手'}: ${(m.content || '').slice(0, 200)}`)
		.join('\n')
	const classifyMessages = [
		{ role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
		{ role: 'user', content: `对话上下文：\n${context}\n\n请判断最新提问是否需要实时联网搜索。` },
	]
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 5000)
	try {
		const resp = await fetch(modelConfig.url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${modelConfig.key}` },
			body: JSON.stringify({ model: modelConfig.model, messages: classifyMessages, max_tokens: 32, temperature: 0, stream: false }),
			signal: controller.signal,
		})
		if (!resp.ok) return 'NO_SEARCH'
		const data = await resp.json()
		const verdict = (data.choices?.[0]?.message?.content || '').trim()
		return ['SEARCH', 'NO_SEARCH', 'UNCERTAIN'].includes(verdict) ? verdict : 'NO_SEARCH'
	} catch (error) {
		console.warn('[AI Search] 意图分类器异常, 默认不搜索:', error.message)
		return 'NO_SEARCH'
	} finally {
		clearTimeout(timeout)
	}
}

/**
 * 自动模式: 规则快路径 + 小模型分类器兜底, 输出是否执行搜索
 */
async function decide_webSearch_async(modelConfig, messages) {
	const query = extract_searchQuery(messages)
	const ruleResult = decide_searchByRule(query)
	if (ruleResult !== 'UNCERTAIN') return ruleResult === 'SEARCH'
	return (await classify_searchIntent_async(modelConfig, messages)) === 'SEARCH'
}

// ------------------------------------ API Actions ------------------------------------

const actions = {
	get: {},
	post: {},
}

/**
 * [游客/普通用户] 获取安全的可用模型列表 (隐藏 url 和 key)
 */
actions.get.models = async () => {
	await ensure_dbInitialized_async()
	try {
		// 排序与后台列表一致 (sort ASC, createTime DESC 次级), 保证前台下拉顺序严格跟随后台配置
		const result = await db.query(
			'SELECT id, name, domain, provider, model, "desc", "isReasoning", search, status, speed FROM base_ai WHERE status = 1 ORDER BY sort ASC, "createTime" DESC',
		)
		return base.respSuccess({
			data: base.formatDbRows(result.rows),
		})
	} catch (error) {
		return base.respFailure({ msg: `获取模型失败: ${error.message}` })
	}
}

/**
 * [管理端] 获取完整模型配置列表 (含 url 和 key)
 */
actions.get.admin_models = requireAuth(async ({ query }) => {
	await ensure_dbInitialized_async()
	try {
		const current = parseInt(query?.current || query?.pageNum || query?.page) || 1
		const pageSize = parseInt(query?.pageSize) || 20
		const offset = (current - 1) * pageSize

		const wheres = []
		const binds = []
		let idx = 1

		if (query?.name) {
			wheres.push(`(name ILIKE $${idx} OR model ILIKE $${idx})`)
			binds.push(`%${query.name}%`)
			idx++
		}

		if (query?.provider) {
			wheres.push(`provider = $${idx}`)
			binds.push(query.provider)
			idx++
		}

		if (query?.status !== undefined && query?.status !== '') {
			wheres.push(`status = $${idx}`)
			binds.push(parseInt(query.status))
			idx++
		}

		const whereStr = wheres.length ? `WHERE ${wheres.join(' AND ')}` : ''

		const countRes = await db.query(`SELECT COUNT(*) FROM base_ai ${whereStr}`, binds)
		const total = parseInt(countRes.rows[0]?.count) || 0

		const listRes = await db.query(`SELECT * FROM base_ai ${whereStr} ORDER BY sort ASC, "createTime" DESC LIMIT $${idx} OFFSET $${idx + 1}`, [
			...binds,
			pageSize,
			offset,
		])

		return base.respSuccess({
			data: base.formatDbRows(listRes.rows),
			total,
		})
	} catch (error) {
		return base.respFailure({ msg: `获取模型失败: ${error.message}` })
	}
})

/**
 * [管理端] 新增或修改模型
 */
actions.post.admin_models_save = requireAuth(async ({ body }) => {
	await ensure_dbInitialized_async()
	const { id, name, domain, provider, url, key, model, desc, status = 1, isReasoning = 0, search = 1, sort = 0 } = body
	// 响应速度: 1=快 2=中 3=慢, 非法值归一为默认"中"
	const speed = [1, 2, 3].includes(parseInt(body.speed)) ? parseInt(body.speed) : 2
	const invalids = base.checkValids(body, ['name', 'provider', 'url', 'key', 'model'])
	if (invalids) {
		return base.respFailure({ msg: `缺少必填参数: ${invalids}` })
	}

	try {
		const finalId = id || base.getId()
		const check = await db.query('SELECT id FROM base_ai WHERE id = $1', [finalId])
		const nowTime = base.getTime()

		if (check.rowCount > 0 && id) {
			// 更新
			await db.query(
				`
				UPDATE base_ai
				SET name = $2, domain = $3, provider = $4, url = $5, key = $6, model = $7, "desc" = $8, status = $9, "isReasoning" = $10, search = $11, sort = $12, speed = $13, "updateTime" = $14
				WHERE id = $1
			`,
				[finalId, name, domain || '', provider, url, key, model, desc || '', status, isReasoning, search, sort, speed, nowTime],
			)
			return base.respSuccess({ msg: '更新模型成功', data: finalId })
		} else {
			// 新增
			await db.query(
				`
				INSERT INTO base_ai (id, name, domain, provider, url, key, model, "desc", status, "isReasoning", search, sort, speed, "createTime", "updateTime")
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
			`,
				[finalId, name, domain || '', provider, url, key, model, desc || '', status, isReasoning, search, sort, speed, nowTime],
			)
			return base.respSuccess({ msg: '创建模型成功', data: finalId })
		}
	} catch (error) {
		return base.respFailure({ msg: `保存失败: ${error.message}` })
	}
})

/**
 * [管理端] 删除模型
 */
actions.post.admin_models_delete = requireAuth(async ({ body }) => {
	await ensure_dbInitialized_async()
	const { id } = body
	if (!id) return base.respFailure({ msg: 'ID不能为空' })
	try {
		await db.query('DELETE FROM base_ai WHERE id = $1', [id])
		return base.respSuccess({ msg: '删除成功' })
	} catch (error) {
		return base.respFailure({ msg: `删除失败: ${error.message}` })
	}
})

/**
 * [已登录用户] 获取用户的对话会话列表
 */
actions.get.sessions = requireAuth(async ({ req }) => {
	await ensure_dbInitialized_async()
	const { userId } = req.user
	try {
		// 附带消息条数 msgCount, 便于前端过滤历史遗留的空会话 (延迟创建后不再产生新空会话)
		const result = await db.query(
			`
			SELECT s.*, (SELECT COUNT(*) FROM base_ai_message m WHERE m."sessionId" = s.id) AS "msgCount"
			FROM base_ai_session s
			WHERE s.user_id = $1
			ORDER BY s."updateTime" DESC
		`,
			[userId],
		)
		return base.respSuccess({
			data: base.formatDbRows(result.rows),
		})
	} catch (error) {
		return base.respFailure({ msg: `获取会话失败: ${error.message}` })
	}
})

/**
 * [已登录用户] 创建或重命名会话
 */
actions.post.session_save = requireAuth(async ({ req, body }) => {
	await ensure_dbInitialized_async()
	const { userId } = req.user
	const { id, title, modelId } = body
	const titleSource = body.titleSource === 'manual' ? 'manual' : 'auto'
	const invalids = base.checkValids(body, ['title', 'modelId'])
	if (invalids) {
		return base.respFailure({ msg: `缺少参数: ${invalids}` })
	}

	try {
		const checkId = id || base.getId()
		const check = await db.query('SELECT id FROM base_ai_session WHERE id = $1 AND user_id = $2', [checkId, userId])
		const nowTime = base.getTime()

		if (check.rowCount > 0) {
			// 更新
			await db.query(
				`
				UPDATE base_ai_session
				SET title = $3, "modelId" = $4, "titleSource" = $5, "updateTime" = $6
				WHERE id = $1 AND user_id = $2
			`,
				[checkId, userId, title, modelId, titleSource, nowTime],
			)
			return base.respSuccess({ msg: '会话更新成功', data: { id: checkId } })
		} else {
			// 新增
			await db.query(
				`
				INSERT INTO base_ai_session (id, user_id, title, "modelId", "titleSource", "createTime", "updateTime")
				VALUES ($1, $2, $3, $4, $5, $6, $6)
			`,
				[checkId, userId, title, modelId, titleSource, nowTime],
			)
			return base.respSuccess({ msg: '会话创建成功', data: { id: checkId } })
		}
	} catch (error) {
		return base.respFailure({ msg: `保存会话失败: ${error.message}` })
	}
})

/**
 * [已登录用户] 批量同步本地会话至云端 (游客转登录的同步接口)
 */
actions.post.sessions_sync = requireAuth(async ({ req, body }) => {
	await ensure_dbInitialized_async()
	const { userId } = req.user
	const { sessions } = body // 格式: [{ id, title, modelId, messages: [...] }]
	if (!Array.isArray(sessions)) {
		return base.respFailure({ msg: '参数结构错误' })
	}

	try {
		for (const s of sessions) {
			// 1. 保存会话
			const nowTime = base.getTime()
			await db.query(
				`
				INSERT INTO base_ai_session (id, user_id, title, "modelId", "titleSource", "createTime", "updateTime")
				VALUES ($1, $2, $3, $4, $5, $6, $6)
				ON CONFLICT (id) DO NOTHING
			`,
				[s.id, userId, s.title, s.modelId, s.titleSource === 'manual' ? 'manual' : 'auto', nowTime],
			)

			// 2. 插入对应的消息历史
			if (Array.isArray(s.messages)) {
				for (const m of s.messages) {
					await db.query(
						`
						INSERT INTO base_ai_message (id, "sessionId", role, content, "reasoningContent", "modelId", "createTime")
						VALUES ($1, $2, $3, $4, $5, $6, $7)
						ON CONFLICT (id) DO NOTHING
					`,
						[m.id || base.getId(), s.id, m.role, m.content, m.reasoningContent || '', m.modelId || s.modelId, m.createTime || nowTime],
					)
				}
			}
		}
		return base.respSuccess({ msg: '云端数据同步成功' })
	} catch (error) {
		return base.respFailure({ msg: `同步失败: ${error.message}` })
	}
})

/**
 * [已登录用户] 删除会话
 */
actions.post.session_delete = requireAuth(async ({ req, body }) => {
	await ensure_dbInitialized_async()
	const { userId } = req.user
	const { id } = body
	if (!id) return base.respFailure({ msg: '会话ID不能为空' })

	try {
		await db.query('DELETE FROM base_ai_session WHERE id = $1 AND user_id = $2', [id, userId])
		return base.respSuccess({ msg: '会话已成功删除' })
	} catch (error) {
		return base.respFailure({ msg: `会话删除失败: ${error.message}` })
	}
})

/**
 * [已登录用户] 获取单会话的历史消息记录
 */
actions.get.messages = requireAuth(async ({ req, query }) => {
	await ensure_dbInitialized_async()
	const { userId } = req.user
	const { sessionId } = query
	if (!sessionId) return base.respFailure({ msg: '缺少sessionId' })

	try {
		// 校验安全性：检查当前会话是否属于该用户
		const check = await db.query('SELECT id FROM base_ai_session WHERE id = $1 AND user_id = $2', [sessionId, userId])
		if (check.rowCount === 0) {
			return base.respFailure({ msg: '无权查看此会话或会话不存在' })
		}

		// 一轮问答的 user 与 assistant 共用同一个秒级 createTime, 同秒并列时排序不稳定会导致顺序错乱;
		// 以 role 作为次级排序键, 保证同一时间戳内 user 消息恒在 assistant 回复之前
		const result = await db.query(
			`
			SELECT id, role, content, "reasoningContent", "modelId", "createTime"
			FROM base_ai_message
			WHERE "sessionId" = $1
			ORDER BY "createTime" ASC, CASE WHEN role = 'user' THEN 0 ELSE 1 END
		`,
			[sessionId],
		)
		return base.respSuccess({
			data: base.formatDbRows(result.rows),
		})
	} catch (error) {
		return base.respFailure({ msg: `拉取消息历史失败: ${error.message}` })
	}
})

/**
 * [公用] 流式 AI 交互核心接口
 * 采用原生代理直通转发 SSE，在完成后异步将内容写入数据库 (如果属于登录用户)
 */
actions.post.chat = async ({ req, resp, body }) => {
	await ensure_dbInitialized_async()
	const { modelId, messages, sessionId, searchMode: rawSearchMode } = body

	if (!modelId || !Array.isArray(messages)) {
		return base.respFailure({ msg: '必要参数模型ID或上下文缺失' })
	}

	// 1. 查询模型配置
	const modelRes = await db.query('SELECT * FROM base_ai WHERE id = $1 AND status = 1 LIMIT 1', [modelId])
	if (modelRes.rowCount === 0) {
		return base.respFailure({ msg: `未找到指定或已启用的模型: ${modelId}` })
	}
	const modelConfig = modelRes.rows[0]

	// 2. 判定当前请求者角色 (可空，非阻塞)
	const currentUser = select_authUser(req)

	// 3. 构建向上游发送的请求
	const targetBody = {
		model: modelConfig.model,
		messages: messages,
		stream: true,
	}

	// 3.1 联网搜索: 三档模式 (auto 自动判定 / always 始终搜索 / never 从不搜索) + 模型级能力开关
	const searchMode = ['auto', 'always', 'never'].includes(rawSearchMode) ? rawSearchMode : 'auto'
	if (searchMode !== 'never' && modelConfig.search !== 0) {
		const shouldSearch = searchMode === 'always' || (await decide_webSearch_async(modelConfig, messages))
		if (shouldSearch) {
			await enable_webSearch_async(targetBody, modelConfig, messages)
		}
	}

	const controller = new AbortController()
	req.on('close', () => {
		// 客户端主动断开时立即取消上游请求，节约 token
		controller.abort()
	})

	try {
		let response
		let retryAttempt = 0 // 当前已重试的次数
		const retryMax = 3 // 最大重试次数
		const retryDelays = [1000, 2000, 4000] // 每次重试的间隔时间 (ms)

		while (true) {
			try {
				// 向大模型厂商发起 fetch 流式请求
				response = await fetch(modelConfig.url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${modelConfig.key}`,
					},
					body: JSON.stringify(targetBody),
					signal: controller.signal,
				})

				// 遇到 503 临时不可用且未超出重试次数，执行退避重试
				if (response.status === 503 && retryAttempt < retryMax) {
					retryAttempt++
					// 基础延时 + 0~500ms 随机抖动 (避免并发客户端同时发起重试造成二次拥堵)
					const retryDelay = (retryDelays[retryAttempt - 1] || 1000) + Math.floor(Math.random() * 500)
					console.warn(`[AI Proxy] 上游模型 503 负载过高 (尝试第 ${retryAttempt} 次重试), 将在 ${retryDelay}ms 后重试...`)
					await new Promise(resolve => setTimeout(resolve, retryDelay))
					continue
				}
			} catch (fetchError) {
				// 如果是用户主动取消了请求，直接中断抛出
				if (controller.signal.aborted) {
					throw fetchError
				}
				// 其它连接级别异常在未超出重试次数时也尝试重试
				if (retryAttempt < retryMax) {
					retryAttempt++
					const retryDelay = (retryDelays[retryAttempt - 1] || 1000) + Math.floor(Math.random() * 500)
					console.warn(`[AI Proxy] 请求网络异常: ${fetchError.message} (尝试第 ${retryAttempt} 次重试), 将在 ${retryDelay}ms 后重试...`)
					await new Promise(resolve => setTimeout(resolve, retryDelay))
					continue
				}
				throw fetchError
			}
			break
		}

		if (!response.ok) {
			const errText = await response.text()
			return base.respFailure({ msg: `上游模型报错 HTTP ${response.status}: ${errText}` })
		}

		// 4. 设置 SSE 响应头部并刷新
		resp.writeHead(200, {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
		})
		if (typeof resp.flushHeaders === 'function') {
			resp.flushHeaders()
		}

		// 5. 流式数据搬运与转发
		const reader = response.body.getReader()
		const decoder = new TextDecoder('utf-8')
		let buffer = ''
		let completeContent = ''
		let completeReasoning = ''

		while (true) {
			const { value, done } = await reader.read()
			if (done) break

			// 写入客户端
			resp.write(value)

			// 异步累计文本内容 (用于后台静默入库)
			if (currentUser && sessionId) {
				const chunkText = decoder.decode(value, { stream: true })
				buffer += chunkText
				const lines = buffer.split('\n')
				buffer = lines.pop() || ''

				for (const line of lines) {
					const cleaned = line.trim()
					if (!cleaned.startsWith('data: ') || cleaned === 'data: [DONE]') continue
					try {
						const jsonStr = cleaned.slice(6)
						const parsed = JSON.parse(jsonStr)
						const delta = parsed.choices?.[0]?.delta
						if (delta) {
							if (delta.content) completeContent += delta.content
							if (delta.reasoning_content) completeReasoning += delta.reasoning_content
						}
					} catch {}
				}
			}
		}

		// 刷新最后未解析的数据
		if (buffer && currentUser && sessionId) {
			const cleaned = buffer.trim()
			if (cleaned.startsWith('data: ') && cleaned !== 'data: [DONE]') {
				try {
					const jsonStr = cleaned.slice(6)
					const parsed = JSON.parse(jsonStr)
					const delta = parsed.choices?.[0]?.delta
					if (delta) {
						if (delta.content) completeContent += delta.content
						if (delta.reasoning_content) completeReasoning += delta.reasoning_content
					}
				} catch {}
			}
		}

		resp.end()

		// 6. 如果是登录用户且会话合法，异步将此轮问答的消息记录写入数据库
		if (currentUser && sessionId) {
			// 确保会话确实归当前用户所有
			const checkSession = await db.query('SELECT id FROM base_ai_session WHERE id = $1 AND user_id = $2', [sessionId, currentUser.userId])
			if (checkSession.rowCount > 0) {
				// 获取此轮对话的用户最后一句提问
				const lastUserMsg = messages[messages.length - 1]
				const userMsgId = base.getId()
				const assistantMsgId = base.getId()
				const createTime = base.getTime()

				const displayModelName = modelConfig ? `${modelConfig.name} [${modelConfig.provider}]` : modelId

				// 异步无等待写入数据库
				db.query(
					`
					INSERT INTO base_ai_message (id, "sessionId", role, content, "modelId", "createTime")
					VALUES ($1, $2, $3, $4, $5, $6)
				`,
					[userMsgId, sessionId, 'user', lastUserMsg.content, displayModelName, createTime],
				).catch(err => {
					console.error('[Async DB log user message failed]', err)
				})

				db.query(
					`
					INSERT INTO base_ai_message (id, "sessionId", role, content, "reasoningContent", "modelId", "createTime")
					VALUES ($1, $2, $3, $4, $5, $6, $7)
				`,
					[assistantMsgId, sessionId, 'assistant', completeContent, completeReasoning, displayModelName, createTime],
				).catch(err => {
					console.error('[Async DB log assistant message failed]', err)
				})

				// 同时更新会话的 updateTime 以及当前正在使用的 modelId
				db.query(
					`
					UPDATE base_ai_session SET "modelId" = $1, "updateTime" = $2 WHERE id = $3
				`,
					[modelId, createTime, sessionId],
				).catch(err => {
					console.error('[Async DB update session time failed]', err)
				})
			}
		}
	} catch (error) {
		console.error('[Chat Proxy Stream Error]', error)
		if (!resp.writableEnded) {
			// 在流输出中途出错，发送错误帧并关闭
			resp.write(`data: ${JSON.stringify({ error: `流传输异常中断: ${error.message}` })}\n\n`)
			resp.end()
		}
	}
}

/**
 * [公用] 智能生成会话标题
 * 复用当前模型对"首条用户消息 + 首条 AI 回复"做一次极小非流式提炼 (max_tokens: 64);
 * 由前端在首轮回答完成后异步调用, 不阻塞主流程; 模型输出无效时降级为本地临时标题规则兜底。
 */
actions.post.title = async ({ body }) => {
	const { modelId, userMessage, assistantMessage } = body
	if (!modelId) return base.respFailure({ msg: '缺少模型ID' })

	try {
		await ensure_dbInitialized_async()
		const modelRes = await db.query('SELECT * FROM base_ai WHERE id = $1 AND status = 1 LIMIT 1', [modelId])
		const modelConfig = modelRes.rows[0]
		if (!modelConfig) return base.respFailure({ msg: '模型不存在或已停用' })

		let rawTitle = ''
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), 8000)
		try {
			const resp = await fetch(modelConfig.url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${modelConfig.key}` },
				body: JSON.stringify({
					model: modelConfig.model,
					messages: build_titleMessages(userMessage, assistantMessage),
					max_tokens: 64,
					temperature: 0.7,
					stream: false,
				}),
				signal: controller.signal,
			})
			if (resp.ok) {
				const data = await resp.json()
				rawTitle = data.choices?.[0]?.message?.content || ''
			}
		} catch (error) {
			console.warn('[AI Title] 标题生成请求异常:', error.message)
		} finally {
			clearTimeout(timeout)
		}

		// 模型输出无效时降级为本地临时标题规则 (保证始终返回可用标题)
		const title = clean_titleText(rawTitle) || clean_localTitle(userMessage)
		if (!title) return base.respFailure({ msg: '标题生成失败' })
		return base.respSuccess({ data: { title } })
	} catch (error) {
		return base.respFailure({ msg: `生成标题失败: ${error.message}` })
	}
}

// --------------------------- 统一入口路由分发 ---------------------------
export default async (req, resp) => {
	base.req = req
	base.resp = resp
	const { method, action, query, body } = base.getReqInfo()

	try {
		if (actions[method]?.[action]) {
			const handler = actions[method][action]
			return await handler({ req, resp, query, body })
		}
		return base.respFailure({ msg: '无效的操作路由' })
	} catch (error) {
		console.error('[AI Handler Error]', error)
		return base.respFailure({ msg: `服务器处理崩溃: ${error.message}` })
	}
}
