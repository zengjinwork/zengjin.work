import pkg from 'pg'
import dns from 'dns'

// 强制 Node.js (v17+) 在 DNS 解析时优先使用 IPv4，避免因本地不支持 IPv6 导致连接云数据库时产生 3 秒以上的超时回退延迟
dns.setDefaultResultOrder('ipv4first')

const { Pool } = pkg

// 检查必要的环境变量是否存在
if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD) {
	console.error('错误: 缺少必要的数据库连接环境变量。请确保设置了 DB_HOST, DB_USER 和 DB_PASSWORD。')
}

// 数据库连接配置
const dbConfig = {
	host: process.env.DB_HOST,
	port: process.env.DB_PORT || 5432,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME || 'postgres',
	max: 15, // 连接池最大连接数
	idleTimeoutMillis: 30000, // 连接最大空闲时间
	// 始终启用 SSL，但允许自签名证书
	ssl: {
		require: true,
		rejectUnauthorized: false, // 设置为 false 以允许自签名证书
	},
}

// 判断环境
const isProd = process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production'
console.log('当前环境:', isProd ? '生产环境' : '开发环境')

// 全局单例缓存，防止无服务器开发环境下不断重复新建对象和 TLS 握手（类似你朋友给出的方案二思路，但作用于原生 pg 模块）
if (!global.dbPool) {
	global.dbPool = new Pool(dbConfig)
}

const db = global.dbPool
export default db
