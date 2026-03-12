# 🐼 TinyPool

[中文](./README.md)

A TinyPNG API Key pool manager on Cloudflare Workers + D1. Dispatches requests across multiple keys, bypassing the 500 free compressions per key monthly limit.

## Features

- **Key Pool Dispatch** — Picks the key with the most remaining quota, rate-limited 60 req/min per token
- **Web Dashboard** — Manage keys, view stats, configure settings, with dark mode
- **Auto Registration** — Register TinyPNG accounts via temp email service
- **Auto-replenish** — Cron registers new keys when the pool is unhealthy
- **Usage Analytics** — Daily charts, filterable by API Token, 30s auto-refresh
- **Scheduled Sync** — Cron-based quota synchronization
- **Import/Export** — JSON-based key import and export
- **API Docs** — Built-in Scalar OpenAPI documentation

## Quick Start

### Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

```bash
npm install -g wrangler
wrangler login
```

### Install

```bash
git clone https://github.com/your-username/tinypool.git
cd tinypool
npm install
cd frontend && npm install && cd ..
```

### Local Development

```bash
cp wrangler.toml.example wrangler.toml
cp .dev.vars.example .dev.vars
# Edit .dev.vars to set ADMIN_PASSWORD and JWT_SECRET

npm run db:migrate   # Initialize local database
npm run dev          # Start dev server
```

- Dashboard / Frontend HMR: http://localhost:5173
- API Docs: http://localhost:5173/docs

### Deploy to Cloudflare

```bash
# 1. Create D1 database
wrangler d1 create tinypool-db
# Copy the returned database_id into wrangler.toml

# 2. Initialize remote database
wrangler d1 execute tinypool-db --remote --file=./src/db/schema.sql

# 3. Set secrets
wrangler secret put ADMIN_PASSWORD
wrangler secret put JWT_SECRET

# 4. Build and deploy
npm run deploy
```

Access the dashboard at `https://your-worker.workers.dev/admin`. Subsequent updates only need `npm run deploy`.

## API

Public endpoints require an API Token (`Authorization: Bearer tpk_xxx`), created in the dashboard.

### Pick a Key

```
GET /pick
```

```json
{ "success": true, "data": { "key": "abc123...", "monthly_usage": 42, "monthly_limit": 500, "remaining": 458 } }
```

Use the returned `key` for TinyPNG Basic Auth (username: `api`, password: key). Rate-limited to 60 req/min.

### Refresh Key Quota

```
POST /pick/refresh
Content-Type: application/json
{ "key": "abc123..." }
```

Fetches actual compression count from TinyPNG and updates the database. Recommended after using a key.

### Admin Endpoints (JWT Auth)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login (no auth required) |
| GET/POST | `/keys` | List / Add keys |
| POST | `/keys/batch` | Batch add |
| GET | `/keys/export` | Export |
| PATCH | `/keys/{id}/toggle` | Enable/disable |
| POST | `/keys/register` | Auto-register |
| GET | `/stats` | Overview (supports `?token_id=X`) |
| GET | `/stats/usage/daily` | Daily usage (supports `?token_id=X`) |
| POST | `/stats/sync` | Manual sync |
| GET/POST/DELETE | `/tokens` | Token management |
| GET/PUT | `/settings/sync-interval` | Sync interval |
| GET/PUT | `/settings/mail` | Temp email config |
| GET/PUT | `/settings/auto-replenish` | Auto-replenish config |

All endpoints return `{ "success": true, "data": {...} }` or `{ "success": false, "error": "..." }`. Full docs at `/docs`.

## Auto Registration

Auto-registration depends on [cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email) as the temp email backend. You need to deploy it first.

Configure in Settings: temp email API URL, domain, and admin password. Once configured, the "Auto Register" button appears on the Pool page. Enable "Auto-replenish" to have Cron register new keys automatically when the pool is unhealthy.

## Tech Stack

Cloudflare Workers + D1 | Hono + Zod OpenAPI | Lit + Tailwind CSS v4 | Vite | Scalar

## License

MIT
