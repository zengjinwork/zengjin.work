import base from '#api_util/base.js'
import { publish_message_ws } from '#api_util/ws.js'

const actions = {
	post: {
		/**
		 * 模拟推送消息
		 * POST /api/base/wsdemo/push
		 */
		push: async ({ body }) => {
			const { targetId, app, type, title, content } = body

			if (!targetId) {
				return base.respFailure({ msg: '缺少目标用户ID(targetId)参数' })
			}

			// 遵循规范：个人频道名称使用 "user_用户id"
			const channel = `user_${targetId}`

			// 遵循规范：标准消息体结构
			const payload = {
				app: app || '$base',
				type: type || 'notice_soft',
				data: {
					title: title || '系统通知',
					content: content || '这是一条测试消息',
					timestamp: Date.now(), // 可以放进 data 中用于排序或业务判断
				},
			}

			const result = await publish_message_ws(channel, payload)

			if (result.success) {
				return base.respSuccess({ msg: '推送成功' })
			} else {
				return base.respFailure({ msg: `推送失败: ${JSON.stringify(result.error)}` })
			}
		},
	},
}

export default async (req, resp) => {
	base.req = req
	base.resp = resp
	const { method, action, body, query } = base.getReqInfo()

	try {
		if (actions[method]?.[action]) {
			const handler = actions[method][action]
			return await handler({ req, resp, body, query })
		}
		return base.respFailure({ msg: '无效的操作' })
	} catch (error) {
		console.error('接口处理错误:', error)
		return base.respFailure({ msg: `服务器内部错误: ${error.message}` })
	}
}
