# 🐼 TinyPool

[English](./README.en.md)

TinyPNG API Key 池管理服务，部署在 Cloudflare Workers + D1 上。自动调度多个 TinyPNG Key，突破单 Key 每月 500 次免费限制。

## 功能

- **Key 池调度** — 自动选取剩余额度最多的 Key，按 Token 限流 60 次/分钟
- **Web 管理面板** — 管理 Key、查看统计、配置设置，支持深色模式
- **自动注册** — 通过临时邮箱自动注册 TinyPNG 账号
- **自动补键** — 号池不健康时 Cron 自动注册新 Key
- **用量统计** — 每日用量图表，支持按 API Token 筛选，30s 自动刷新
- **定时同步** — Cron 自动同步 Key 真实额度
- **导入导出** — JSON 格式导入导出 Key
- **API 文档** — 内置 Scalar OpenAPI 文档

## 快速开始

### 环境要求

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

```bash
npm install -g wrangler
wrangler login
```

### 安装

```bash
git clone https://github.com/your-username/tinypool.git
cd tinypool
npm install
cd frontend && npm install && cd ..
```

### 本地开发

```bash
cp wrangler.toml.example wrangler.toml
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 设置 ADMIN_PASSWORD 和 JWT_SECRET

npm run db:migrate   # 初始化本地数据库
npm run dev          # 启动开发服务
```

- 管理面板 / 前端热更新: http://localhost:5173
- API 文档: http://localhost:5173/docs

### 部署到 Cloudflare

```bash
# 1. 创建 D1 数据库
wrangler d1 create tinypool-db
# 将返回的 database_id 填入 wrangler.toml

# 2. 初始化远程数据库
wrangler d1 execute tinypool-db --remote --file=./src/db/schema.sql

# 3. 设置密钥
wrangler secret put ADMIN_PASSWORD
wrangler secret put JWT_SECRET

# 4. 构建并部署
npm run deploy
```

部署后访问 `https://your-worker.workers.dev/admin` 进入管理面板。后续更新只需 `npm run deploy`。

## API

所有公开接口需 API Token 认证（`Authorization: Bearer tpk_xxx`），在管理面板创建。

### 获取 Key

```
GET /pick
```

```json
{ "success": true, "data": { "key": "abc123...", "monthly_usage": 42, "monthly_limit": 500, "remaining": 458 } }
```

返回的 `key` 用于 TinyPNG Basic Auth（用户名 `api`，密码为 `key`）。限流 60 次/分钟。

### 刷新 Key 额度

```
POST /pick/refresh
Content-Type: application/json
{ "key": "abc123..." }
```

从 TinyPNG 获取实际压缩次数并更新数据库。推荐在使用完 Key 后调用。

### 管理接口（JWT 认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/login` | 登录（无需认证） |
| GET/POST | `/keys` | Key 列表 / 添加 |
| POST | `/keys/batch` | 批量添加 |
| GET | `/keys/export` | 导出 |
| PATCH | `/keys/{id}/toggle` | 启用/禁用 |
| POST | `/keys/register` | 自动注册 |
| GET | `/stats` | 概览（支持 `?token_id=X`） |
| GET | `/stats/usage/daily` | 每日用量（支持 `?token_id=X`） |
| POST | `/stats/sync` | 手动同步额度 |
| GET/POST/DELETE | `/tokens` | Token 管理 |
| GET/PUT | `/settings/sync-interval` | 同步间隔 |
| GET/PUT | `/settings/mail` | 临时邮箱配置 |
| GET/PUT | `/settings/auto-replenish` | 自动补键配置 |

统一返回 `{ "success": true, "data": {...} }` 或 `{ "success": false, "error": "..." }`。完整文档访问 `/docs`。

## 自动注册

自动注册功能依赖 [cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email) 作为临时邮箱后端，需要先自行部署该项目。

在设置页配置临时邮箱 API 地址、域名和管理员密码后，号池页会显示「自动注册」按钮。开启「自动补键」后，Cron 会在健康 Key 不足时自动注册。

## 技术栈

Cloudflare Workers + D1 | Hono + Zod OpenAPI | Lit + Tailwind CSS v4 | Vite | Scalar

## License

MIT
