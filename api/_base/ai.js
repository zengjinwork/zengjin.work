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
			provider VARCHAR(50) NOT NULL DEFAULT 'openai',
			url VARCHAR(500) NOT NULL,
			key VARCHAR(500) NOT NULL,
			model VARCHAR(255) NOT NULL,
			"desc" TEXT,
			status INT NOT NULL DEFAULT 1,
			"isReasoning" INT NOT NULL DEFAULT 0,
			sort INT NOT NULL DEFAULT 0,
			"createTime" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			"updateTime" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`)

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
			],
		]
		for (const p of presets) {
			await db.query(
				`
				INSERT INTO base_ai (id, name, provider, url, key, model, "desc", status, "isReasoning", sort)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
		const result = await db.query('SELECT id, name, provider, model, "desc", "isReasoning", status FROM base_ai WHERE status = 1 ORDER BY sort ASC')
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
actions.get.admin_models = requireAuth(async () => {
	await ensure_dbInitialized_async()
	try {
		const result = await db.query('SELECT * FROM base_ai ORDER BY sort ASC')
		return base.respSuccess({
			data: base.formatDbRows(result.rows),
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
	const { id, name, provider, url, key, model, desc, status = 1, isReasoning = 0, sort = 0 } = body
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
				SET name = $2, provider = $3, url = $4, key = $5, model = $6, "desc" = $7, status = $8, "isReasoning" = $9, sort = $10, "updateTime" = $11
				WHERE id = $1
			`,
				[finalId, name, provider, url, key, model, desc || '', status, isReasoning, sort, nowTime],
			)
			return base.respSuccess({ msg: '更新模型成功', data: finalId })
		} else {
			// 新增
			await db.query(
				`
				INSERT INTO base_ai (id, name, provider, url, key, model, "desc", status, "isReasoning", sort, "createTime", "updateTime")
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
			`,
				[finalId, name, provider, url, key, model, desc || '', status, isReasoning, sort, nowTime],
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
		const result = await db.query('SELECT * FROM base_ai_session WHERE user_id = $1 ORDER BY "updateTime" DESC', [userId])
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
				SET title = $3, "modelId" = $4, "updateTime" = $5
				WHERE id = $1 AND user_id = $2
			`,
				[checkId, userId, title, modelId, nowTime],
			)
			return base.respSuccess({ msg: '会话更新成功', data: { id: checkId } })
		} else {
			// 新增
			await db.query(
				`
				INSERT INTO base_ai_session (id, user_id, title, "modelId", "createTime", "updateTime")
				VALUES ($1, $2, $3, $4, $5, $5)
			`,
				[checkId, userId, title, modelId, nowTime],
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
				INSERT INTO base_ai_session (id, user_id, title, "modelId", "createTime", "updateTime")
				VALUES ($1, $2, $3, $4, $5, $5)
				ON CONFLICT (id) DO NOTHING
			`,
				[s.id, userId, s.title, s.modelId, nowTime],
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

		const result = await db.query(
			'SELECT id, role, content, "reasoningContent", "modelId", "createTime" FROM base_ai_message WHERE "sessionId" = $1 ORDER BY "createTime" ASC',
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
	const { modelId, messages, sessionId } = body

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

				// 异步无等待写入数据库
				db.query(
					`
					INSERT INTO base_ai_message (id, "sessionId", role, content, "modelId", "createTime")
					VALUES ($1, $2, $3, $4, $5, $6)
				`,
					[userMsgId, sessionId, 'user', lastUserMsg.content, modelId, createTime],
				).catch(err => {
					console.error('[Async DB log user message failed]', err)
				})

				db.query(
					`
					INSERT INTO base_ai_message (id, "sessionId", role, content, "reasoningContent", "modelId", "createTime")
					VALUES ($1, $2, $3, $4, $5, $6, $7)
				`,
					[assistantMsgId, sessionId, 'assistant', completeContent, completeReasoning, modelId, createTime],
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
