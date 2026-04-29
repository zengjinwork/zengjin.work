import pkg from 'pg'
import dns from 'dns'

// 强制 Node.js (v17+) 在 DNS 解析时优先使用 IPv4，避免延迟
dns.setDefaultResultOrder('ipv4first')

const { Pool } = pkg

// 1. 获取当前默认数据库标识 (如 'neon' 或 'supabase')
const DEFAULT_KEY = (process.env.DB || 'neon').toUpperCase()

/**
 * 获取连接池配置
 * @param {string} key - 数据库标识前缀
 */
function getPoolConfig(key) {
	const prefix = `DB_${key}_`
	const host = process.env[`${prefix}HOST`]

	if (!host) {
		console.error(`错误: 缺少数据库 [${key}] 的连接配置。请检查环境变量 ${prefix}HOST 等。`)
		return null
	}

	return {
		host,
		port: process.env[`${prefix}PORT`] || 5432,
		user: process.env[`${prefix}USER`],
		password: process.env[`${prefix}PASSWORD`],
		database: process.env[`${prefix}NAME`] || 'postgres',
		max: 15,
		idleTimeoutMillis: 30000,
		ssl: {
			require: true,
			rejectUnauthorized: false,
		},
	}
}

// 2. 全局连接池注册表（用于单例缓存）
if (!global.dbPools) {
	global.dbPools = {}
}

/**
 * 获取指定的数据库连接池
 * @param {string} name - 数据库标识 (如 'neon', 'supabase')
 * @returns {Pool} pg 连接池实例
 */
export function getPool(name) {
	const key = name.toUpperCase()
	if (!global.dbPools[key]) {
		const config = getPoolConfig(key)
		if (!config) return null
		global.dbPools[key] = new Pool(config)
		console.log(`已初始化数据库连接池: [${key}]`)
	}
	return global.dbPools[key]
}

// 默认导出：指向 .env 中 DB 变量指定的那个库
const db = getPool(DEFAULT_KEY)

// 打印当前主库状态
if (db) {
	const isProd = process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production'
	console.log(`数据库就绪: [${DEFAULT_KEY}] | 环境: ${isProd ? '生产' : '开发'}`)
}

export default db
