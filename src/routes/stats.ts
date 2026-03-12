import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { adminJwtAuth } from '../middleware/auth'
import { KeyPool } from '../services/pool'
import type { AppEnv } from '../types'

interface DayRow { date: string; count: number }

const overviewRoute = createRoute({
  method: 'get', path: '/', tags: ['Stats'], summary: '概览统计', security: [{ adminAuth: [] }],
  request: {
    query: z.object({
      token_id: z.string().pipe(z.coerce.number()).optional()
        .openapi({ param: { name: 'token_id', in: 'query' }, example: '1' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              total_keys: z.number(), active_keys: z.number(), exhausted_keys: z.number(),
              disabled_keys: z.number(), invalid_keys: z.number(),
              total_usage_this_month: z.number(), total_capacity: z.number(), remaining: z.number(),
              total_picks: z.number(), picks_today: z.number(),
            }),
          }),
        },
      },
      description: '统计数据',
    },
  },
})

const dailyRoute = createRoute({
  method: 'get', path: '/usage/daily', tags: ['Stats'], summary: '每日用量', security: [{ adminAuth: [] }],
  request: {
    query: z.object({
      days: z.string().pipe(z.coerce.number().min(1).max(90)).optional().default('30')
        .openapi({ param: { name: 'days', in: 'query' }, example: '30' }),
      token_id: z.string().pipe(z.coerce.number()).optional()
        .openapi({ param: { name: 'token_id', in: 'query' }, example: '1' }),
    }),
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ daily: z.array(z.object({ date: z.string(), count: z.number() })) }) }) } }, description: '每日用量' },
  },
})

const syncRoute = createRoute({
  method: 'post', path: '/sync', tags: ['Stats'], summary: '手动同步所有 Key 额度', security: [{ adminAuth: [] }],
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ checked: z.number(), updated: z.number(), invalid: z.number() }) }) } }, description: '同步结果' },
  },
})

export const statsApp = new OpenAPIHono<AppEnv>()
statsApp.use('/*', adminJwtAuth)

statsApp.openapi(overviewRoute, async (c) => {
  const { token_id } = c.req.valid('query')
  const today = new Date().toISOString().slice(0, 10)
  const tokenFilter = token_id != null ? ' AND api_token_id = ?' : ''
  const tokenBind = token_id != null ? [token_id] : []

  const [keySummary, totalPicks, picksToday] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) as total_keys,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_keys,
              SUM(CASE WHEN status = 'exhausted' THEN 1 ELSE 0 END) as exhausted_keys,
              SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) as disabled_keys,
              SUM(CASE WHEN status = 'invalid' THEN 1 ELSE 0 END) as invalid_keys,
              SUM(monthly_usage) as total_usage, SUM(monthly_limit) as total_capacity
       FROM tinypng_keys`
    ).first<{ total_keys: number; active_keys: number; exhausted_keys: number; disabled_keys: number; invalid_keys: number; total_usage: number; total_capacity: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as c FROM usage_logs WHERE 1=1${tokenFilter}`).bind(...tokenBind).first<{ c: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as c FROM usage_logs WHERE timestamp >= ?${tokenFilter}`).bind(today, ...tokenBind).first<{ c: number }>(),
  ])
  const s = keySummary ?? { total_keys: 0, active_keys: 0, exhausted_keys: 0, disabled_keys: 0, invalid_keys: 0, total_usage: 0, total_capacity: 0 }
  const usage = s.total_usage ?? 0
  const cap = s.total_capacity ?? 0
  return c.json({
    success: true as const,
    data: {
      total_keys: s.total_keys ?? 0, active_keys: s.active_keys ?? 0,
      exhausted_keys: s.exhausted_keys ?? 0, disabled_keys: s.disabled_keys ?? 0,
      invalid_keys: s.invalid_keys ?? 0, total_usage_this_month: usage, total_capacity: cap,
      remaining: cap - usage, total_picks: totalPicks?.c ?? 0, picks_today: picksToday?.c ?? 0,
    },
  }, 200)
})

statsApp.openapi(dailyRoute, async (c) => {
  const { days, token_id } = c.req.valid('query')
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)
  const tokenFilter = token_id != null ? ' AND api_token_id = ?' : ''
  const binds: (string | number)[] = [since.toISOString().slice(0, 10)]
  if (token_id != null) binds.push(token_id)
  const result = await c.env.DB.prepare(
    `SELECT DATE(timestamp) as date, COUNT(*) as count FROM usage_logs WHERE timestamp >= ?${tokenFilter} GROUP BY DATE(timestamp) ORDER BY date ASC`
  ).bind(...binds).all<DayRow>()
  return c.json({ success: true as const, data: { daily: result.results } }, 200)
})

statsApp.openapi(syncRoute, async (c) => {
  const pool = new KeyPool(c.env.DB)
  const result = await pool.syncAllKeys()
  return c.json({ success: true as const, data: result }, 200)
})
