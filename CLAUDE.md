# zengjin.work 服务端开发规范

## 常用命令

- 测试：`bun test` / `bun test:watch`
- 格式：`bun format:check` / `bun format`
- 本地调试：`bun serve` (端口 1232)

## 架构与编码规范

- 运行环境：Node.js ESM (Vercel Serverless Functions)，`"type": "module"`
- 别名使用：必须使用 `#api_util/xxx` 引用基础设施层（定义在 package.json imports）
- 路由分发：基于 `actions[method][action]` 分发模式，统一使用 `base.getReqInfo()` 解析
- 响应结构：使用 `base.respSuccess` / `base.respFailure` 统一输出，不改变 200 HTTP 状态码
- 数据库：PostgreSQL (pg)，必须使用 `$1` / `$2` 参数化占位符，严禁字符串拼接 SQL
- 时间处理：强制使用 `base.getTime()` 北京时间 (Asia/Shanghai)
- ID 生成：使用 `base.getId()` (12 位 36 进制字符串)
- 鉴权模式：私有接口统一使用 `requireAuth(handler)` 装饰器包裹

## 专项文档指引（需要时按需查阅）

- API 架构总览 → `../zengjin.work-source/docs/_api.md`
- 通用 CRUD 引擎 → `../zengjin.work-source/docs/_crud.md`
- 数据库架构 / 双库 / 连接池 → `../zengjin.work-source/docs/_database.md`
- 部署 / 环境变量 / Cron 备份 → `../zengjin.work-source/docs/_deployment.md`
- 用户鉴权 / 双Token / AES加密 → `../zengjin.work-source/docs/_user.md`
- 七牛云存储适配器 → `../zengjin.work-source/docs/_storage.md`

## 文档维护规则

- 代码重构、新增功能、修补重要 Bug 后，必须同步更新对应的专项文档（`docs/*.md`）、`README.md` 或 `CLAUDE.md`。
- `CLAUDE.md` 保持精简（控制在 60 行内），只保留最核心命令与规范；详细架构移步 `CLAUDE.md` 或 `docs/` 专项文档。
