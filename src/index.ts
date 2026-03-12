import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import { cors } from 'hono/cors'
import ADMIN_HTML from '../frontend/dist/index.html'
import { apiTokenAuth } from './middleware/auth'
import { authApp } from './routes/auth'
import { keysApp } from './routes/keys'
import { settingsApp } from './routes/settings'
import { statsApp } from './routes/stats'
import { tokensApp } from './routes/tokens'
import { KeyPool } from './services/pool'
import { getAutoReplenishConfig } from './routes/settings'
import { getMailSettings } from './routes/settings'
import { registerTinyPngKey } from './services/register'
import type { AppEnv } from './types'

const app = new OpenAPIHono<AppEnv>()

app.use('/*', cors())

const rlMap = new Map<number, { count: number; resetAt: number }>()
function checkRateLimit(tokenId: number, maxPerMin = 60): boolean {
  const now = Date.now()
  const e = rlMap.get(tokenId)
  if (!e || now > e.resetAt) { rlMap.set(tokenId, { count: 1, resetAt: now + 60000 }); return true }
  if (e.count >= maxPerMin) return false
  e.count++
  return true
}

app.onError((err, c) => {
  console.error(`[${c.req.method}] ${c.req.path}:`, err.message, err.stack)
  const isD1 = err.message?.includes('D1_ERROR') || err.message?.includes('SQLITE_ERROR')
  const safeMsg = isD1 ? err.message : 'Internal Server Error'
  return c.json({ success: false, error: safeMsg }, 500)
})

const pickRoute = createRoute({
  method: 'get', path: '/pick', tags: ['Pick'], summary: '获取一个可用 Key',
  description: '从池中选取剩余额度最多的 Key，自动计数',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ key: z.string(), monthly_usage: z.number(), monthly_limit: z.number(), remaining: z.number() }) }) } },
      description: '返回可用 Key',
    },
    429: {
      content: { 'application/json': { schema: z.object({ success: z.literal(false), error: z.string() }) } },
      description: '请求频率超限',
    },
    503: {
      content: { 'application/json': { schema: z.object({ success: z.literal(false), error: z.string() }) } },
      description: '无可用 Key',
    },
  },
})

const refreshRoute = createRoute({
  method: 'post', path: '/pick/refresh', tags: ['Pick'], summary: '刷新指定 Key 的实际额度',
  description: '调用 TinyPNG API 获取最新压缩次数并更新',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ key: z.string().min(1) }) } } } },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ key: z.string(), monthly_usage: z.number(), monthly_limit: z.number(), remaining: z.number(), valid: z.boolean() }) }) } },
      description: '刷新结果',
    },
    404: {
      content: { 'application/json': { schema: z.object({ success: z.literal(false), error: z.string() }) } },
      description: 'Key 不存在',
    },
  },
})

app.use('/pick', apiTokenAuth)
app.use('/pick/*', apiTokenAuth)

app.openapi(pickRoute, async (c) => {
  const tokenId = c.get('apiTokenId')
  if (tokenId && !checkRateLimit(tokenId)) {
    return c.json({ success: false as const, error: 'Rate limit exceeded (60/min)' }, 429)
  }
  const pool = new KeyPool(c.env.DB)
  const key = await pool.pick()
  if (!key) return c.json({ success: false as const, error: 'No available keys' }, 503)
  return c.json({
    success: true as const,
    data: { key: key.key, monthly_usage: key.monthly_usage, monthly_limit: key.monthly_limit, remaining: key.monthly_limit - key.monthly_usage },
  }, 200)
})

app.openapi(refreshRoute, async (c) => {
  const { key } = c.req.valid('json')
  const row = await c.env.DB.prepare('SELECT * FROM tinypng_keys WHERE key = ?').bind(key).first<{ id: number; monthly_usage: number; monthly_limit: number }>()
  if (!row) return c.json({ success: false as const, error: 'Key not found' }, 404)
  const pool = new KeyPool(c.env.DB)
  const v = await pool.validateKey(key)
  const usage = v.compressionCount ?? 0
  const delta = Math.max(0, usage - row.monthly_usage)
  const status = !v.valid ? 'invalid' : usage >= row.monthly_limit ? 'exhausted' : 'active'
  const tokenId = c.get('apiTokenId') ?? null
  await c.env.DB.prepare("UPDATE tinypng_keys SET monthly_usage = ?, status = ?, last_checked_at = datetime('now') WHERE id = ? AND status != 'disabled'")
    .bind(usage, status, row.id).run()
  const BATCH_SIZE = 90
  for (let i = 0; i < delta; i += BATCH_SIZE) {
    const chunk = Array.from({ length: Math.min(BATCH_SIZE, delta - i) }, () =>
      c.env.DB.prepare('INSERT INTO usage_logs (tinypng_key_id, api_token_id) VALUES (?, ?)').bind(row.id, tokenId)
    )
    await c.env.DB.batch(chunk)
  }
  return c.json({
    success: true as const,
    data: { key, monthly_usage: usage, monthly_limit: row.monthly_limit, remaining: row.monthly_limit - usage, valid: v.valid },
  }, 200)
})

app.route('/auth', authApp)
app.route('/keys', keysApp)
app.route('/stats', statsApp)
app.route('/tokens', tokensApp)
app.route('/settings', settingsApp)

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: 'TinyPool', version: '2.0.0', description: 'TinyPNG API Key 池管理服务' },
})

app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http', scheme: 'bearer', description: 'API Token（管理面板创建）',
})
app.openAPIRegistry.registerComponent('securitySchemes', 'adminAuth', {
  type: 'http', scheme: 'bearer', description: '管理员 JWT（POST /auth/login）',
})

app.get('/docs', apiReference({ spec: { url: '/openapi.json' }, theme: 'kepler', layout: 'modern', defaultHttpClient: { targetKey: 'js', clientKey: 'fetch' } }))
app.get('/admin', (c) => c.html(ADMIN_HTML))
app.get('/', (c) => c.json({ name: 'TinyPool', version: '2.0.0', docs: '/docs', admin: '/admin' }))

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: { DB: D1Database }, _ctx: ExecutionContext) {
    try {
      const pool = new KeyPool(env.DB)
      await pool.resetIfNewMonth()
      const shouldSync = await pool.shouldSync()
      if (!shouldSync) return
      const result = await pool.syncAllKeys()
      console.log(`[Cron] Key sync: ${JSON.stringify(result)}`)

      const config = await getAutoReplenishConfig(env.DB)
      if (!config.enabled) return
      const mail = await getMailSettings(env.DB)
      if (!mail.enabled) return

      const healthyCount = await env.DB.prepare(
        `SELECT COUNT(*) as c FROM tinypng_keys WHERE status = 'active' AND (monthly_limit - monthly_usage) >= ?`
      ).bind(config.remaining_threshold).first<{ c: number }>()

      const healthy = healthyCount?.c ?? 0
      if (healthy >= config.min_healthy_keys) return

      console.log(`[Cron] Pool unhealthy: ${healthy}/${config.min_healthy_keys} healthy keys, registering 1 new key`)
      const r = await registerTinyPngKey(env.DB)
      if (r.success && r.key) {
        await env.DB.prepare("INSERT INTO tinypng_keys (key, email, monthly_usage, status) VALUES (?, ?, 0, 'active')")
          .bind(r.key, r.email ?? null).run()
        console.log(`[Cron] Auto-registered key for ${r.email}`)
      } else {
        console.log(`[Cron] Auto-register failed: ${r.error}`)
      }
    } catch (e) {
      console.error('[Cron] Sync failed:', e)
    }
  },
}
