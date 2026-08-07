import { requireAuth } from '#api_util/auth_middleware.js'
import base from '#api_util/base.js'
import crud from '#api_util/crud.js'
import db from '#api_util/db.js'

const table = 'music'
const fields = [
	'id',
	'title',
	'coverUrl',
	'audioUrl',
	'duration',
	'releaseDate',
	'lyric',
	'lyricType',
	'isFavorite',
	'status',
	'createTime',
	'deleteTime',
]
const valids = ['title', 'audioUrl']

/**
 * 对应表结构初始化 (PostgreSQL):
 * CREATE TABLE IF NOT EXISTS music (
 *   "id" VARCHAR(32) PRIMARY KEY,
 *   "title" VARCHAR(255) NOT NULL,
 *   "coverUrl" TEXT,
 *   "audioUrl" TEXT NOT NULL,
 *   "duration" INTEGER DEFAULT 0,
 *   "releaseDate" VARCHAR(20),
 *   "lyric" TEXT,
 *   "lyricType" VARCHAR(10) DEFAULT 'static',
 *   "isFavorite" BOOLEAN DEFAULT false,
 *   "status" BOOLEAN DEFAULT true,
 *   "createTime" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *   "deleteTime" TIMESTAMP
 * );
 */

const actions = {
	get: {
		// 歌曲列表 (前台/后台通用)
		select: async () => {
			const { query } = base.getReqInfo()
			const page = parseInt(query.page) || 1
			const pageSize = parseInt(query.pageSize) || 100
			const offset = (page - 1) * pageSize

			const wheres = ['"deleteTime" IS NULL']
			const binds = []
			let idx = 1

			// 状态筛选：前台默认只查询上架状态 (status=true)
			if (query.status !== undefined && query.status !== '') {
				wheres.push(`"status" = $${idx}`)
				binds.push(query.status === 'true' || query.status === true)
				idx++
			} else if (query.isAdmin !== 'true') {
				wheres.push(`"status" = true`)
			}

			// 收藏筛选
			if (query.type === 'favorite') {
				wheres.push(`"isFavorite" = true`)
			}

			// 关键词搜索
			if (query.keyword) {
				wheres.push(`"title" ILIKE $${idx}`)
				binds.push(`%${query.keyword}%`)
				idx++
			}

			const whereStr = wheres.length ? `WHERE ${wheres.join(' AND ')}` : ''

			// 排序处理：默认为发布日期降序 (releaseDate DESC)，支持按名称排序 (title ASC)
			let orderBy = '"releaseDate" DESC, "createTime" DESC'
			if (query.sort === 'az') {
				orderBy = '"title" ASC'
			} else if (query.sort === 'new') {
				orderBy = '"releaseDate" DESC, "createTime" DESC'
			}

			try {
				const countRes = await db.query(`SELECT COUNT(*) FROM "${table}" ${whereStr}`, binds)
				const total = parseInt(countRes.rows[0].count)

				const listRes = await db.query(
					`SELECT * FROM "${table}" ${whereStr} ORDER BY ${orderBy} LIMIT $${idx} OFFSET $${idx + 1}`,
					[...binds, pageSize, offset],
				)

				const data = base.formatDbRows(listRes.rows)
				return base.respSuccess({ data, total })
			} catch (error) {
				return base.respFailure({ msg: `查询歌曲列表失败: ${error.message}` })
			}
		},

		// 歌曲详情
		detail: async () => {
			const { query } = base.getReqInfo()
			if (!query.id) return base.respFailure({ msg: 'id 参数缺失' })

			try {
				const res = await db.query(`SELECT * FROM "${table}" WHERE id = $1 AND "deleteTime" IS NULL`, [query.id])
				if (!res.rowCount) return base.respFailure({ msg: '歌曲不存在或已下架' })

				const data = base.formatDbRows(res.rows)[0]
				return base.respSuccess({ data })
			} catch (error) {
				return base.respFailure({ msg: `查询详情失败: ${error.message}` })
			}
		},
	},

	post: {
		// 新增歌曲
		insert: requireAuth(async () => {
			return await crud.post.insert({ table, fields, valids })
		}),

		// 更新歌曲
		update: requireAuth(async () => {
			return await crud.post.update({ table, fields, valids })
		}),

		// 软删除歌曲
		delete: requireAuth(async () => {
			return await crud.post.delete({ table, fields, valids })
		}),

		// 切换收藏状态
		toggleFavorite: async () => {
			const { body } = base.getReqInfo()
			if (!body?.id) return base.respFailure({ msg: 'id 参数缺失' })

			try {
				const isFav = body.isFavorite === true || body.isFavorite === 'true'
				const res = await db.query(
					`UPDATE "${table}" SET "isFavorite" = $1 WHERE id = $2 AND "deleteTime" IS NULL RETURNING *`,
					[isFav, body.id],
				)
				if (!res.rowCount) return base.respFailure({ msg: '歌曲不存在' })

				return base.respSuccess({ data: base.formatDbRows(res.rows)[0], msg: isFav ? '已加入收藏' : '已取消收藏' })
			} catch (error) {
				return base.respFailure({ msg: `更新收藏状态失败: ${error.message}` })
			}
		},

		// 切换上下架状态 (后台管理用)
		toggleStatus: requireAuth(async () => {
			const { body } = base.getReqInfo()
			if (!body?.id) return base.respFailure({ msg: 'id 参数缺失' })

			try {
				const status = body.status === true || body.status === 'true'
				const res = await db.query(
					`UPDATE "${table}" SET "status" = $1 WHERE id = $2 AND "deleteTime" IS NULL RETURNING *`,
					[status, body.id],
				)
				if (!res.rowCount) return base.respFailure({ msg: '歌曲不存在' })

				return base.respSuccess({ data: base.formatDbRows(res.rows)[0], msg: status ? '已上架' : '已下架' })
			} catch (error) {
				return base.respFailure({ msg: `更新上下架状态失败: ${error.message}` })
			}
		}),
	},
}

export default async function (req, resp) {
	base.req = req
	base.resp = resp
	const { method, action } = base.getReqInfo()

	if (actions[method]?.[action]) {
		return await actions[method][action]()
	}
	return base.respFailure({ msg: `未匹配的动作：${method} ${action}` })
}
