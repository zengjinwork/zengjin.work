import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const sourceEnv = path.resolve(__dirname, '../zengjin.work-source/.env.development')
const targetEnv = path.resolve(__dirname, './.env')

function copy_envFile() {
	if (fs.existsSync(sourceEnv)) {
		try {
			// 读取源文件并清理其中的“源头文件”提示 Banner
			let envContent = fs.readFileSync(sourceEnv, 'utf8')
			envContent = envContent.replace(/^#\s*<ENV_BANNER_START>[\s\S]*?#\s*<ENV_BANNER_END>\s*/, '')

			// 组装并拼接针对生成副本的警告 Banner
			const copyBanner = `# =========================================================================
# ⚠️ 此文件为 vercel 本地开发环境变量只读文件，请勿直接修改！在此做出的任何修改都将在下一次启动 serve 服务时被覆盖！
# 💡 若需修改配置请前往源文件"zengjin.work-source/.env.development"
# =========================================================================

`
			fs.writeFileSync(targetEnv, copyBanner + envContent, 'utf8')
			console.log(`[Env Sync] 成功同步 .env.development 至 .env (已注入防误触提示)`)
		} catch (err) {
			console.error(`[Env Sync] 复制环境变量文件失败:`, err.message)
			process.exit(1)
		}
	} else {
		if (fs.existsSync(targetEnv)) {
			console.warn(`[Env Sync] 警告：未找到源文件 '${sourceEnv}'。将继续使用本地已有的 .env 文件。`)
		} else {
			console.error(`[Env Sync] 错误：未找到源文件 '${sourceEnv}' 且本地不存在 .env 文件！请确保平级目录下有 zengjin.work-source，或手动创建本地 .env。`)
			process.exit(1)
		}
	}
}

copy_envFile()
