import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { adminJwtAuth } from '../middleware/auth'
import { KeyPool } from '../services/pool'
import { registerTinyPngKey } from '../services/register'
import type { AppEnv, TinyPngKeyRow } from '../types'

const KeySchema = z.object({
  id: z.number(), key: z.string(), email: z.string().nullable(),
  monthly_usage: z.number(), monthly_limit: z.number(), status: z.string(),
  created_at: z.string(), last_used_at: z.string().nullable(), last_checked_at: z.string().nullable(),
}).openapi('TinyPngKey')

const listRoute = createRoute({
  method: 'get', path: '/', tags: ['Keys'], summary: '获取所有 Key', security: [{ adminAuth: [] }],
  responses: { 200: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ keys: z.array(KeySchema) }) }) } }, description: 'Key 列表' } },
})

const addRoute = createRoute({
  method: 'post', path: '/', tags: ['Keys'], summary: '添加 Key', security: [{ adminAuth: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ key: z.string().min(1), email: z.string().email().optional() }) } } } },
  responses: {
    201: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ id: z.number(), valid: z.boolean(), compression_count: z.number().nullable() }) }) } }, description: '添加成功' },
    409: { content: { 'application/json': { schema: z.object({ success: z.literal(false), error: z.string() }) } }, description: '已存在' },
  },
})

const batchRoute = createRoute({
  method: 'post', path: '/batch', tags: ['Keys'], summary: '批量添加 Key', security: [{ adminAuth: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ keys: z.array(z.object({ key: z.string().min(1), email: z.string().email().optional() })).min(1).max(50) }) } } } },
  responses: { 200: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ added: z.number(), skipped: z.number() }) }) } }, description: '批量结果' } },
})

const exportRoute = createRoute({
  method: 'get', path: '/export', tags: ['Keys'], summary: '导出所有 Key', security: [{ adminAuth: [] }],
  responses: { 200: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ keys: z.array(z.object({ key: z.string(), email: z.string().nullable(), status: z.string() })) }) }) } }, description: '导出数据' } },
})

const toggleRoute = createRoute({
  method: 'patch', path: '/{id}/toggle', tags: ['Keys'], summary: '启用/禁用', security: [{ adminAuth: [] }],
  request: { params: z.object({ id: z.string().pipe(z.coerce.number()).openapi({ param: { name: 'id', in: 'path' }, example: '1' }) }) },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ status: z.string() }) }) } }, description: '切换成功' },
    404: { content: { 'application/json': { schema: z.object({ success: z.literal(false), error: z.string() }) } }, description: 'Key 不存在' },
  },
})

const registerRoute = createRoute({
  method: 'post', path: '/register', tags: ['Keys'], summary: '自动注册', security: [{ adminAuth: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ count: z.number().min(1).max(5).optional().default(1) }) } } } },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({
      results: z.array(z.object({ success: z.boolean(), key: z.string().optional(), email: z.string().optional(), error: z.string().optional() })),
      added: z.number(), failed: z.number(),
    }) }) } }, description: '注册结果' },
  },
})

export const keysApp = new OpenAPIHono<AppEnv>()
keysApp.use('/*', adminJwtAuth)

keysApp.openapi(listRoute, async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM tinypng_keys ORDER BY created_at DESC').all<TinyPngKeyRow>()
  return c.json({ success: true as const, data: { keys: result.results } }, 200)
})

keysApp.openapi(addRoute, async (c) => {
  const { key, email } = c.req.valid('json')
  const pool = new KeyPool(c.env.DB)
  const v = await pool.validateKey(key)
  let status: string
  if (v.valid) {
    status = v.compressionCount != null && v.compressionCount >= 500 ? 'exhausted' : 'active'
  } else {
    status = 'invalid'
  }
  try {
    const r = await c.env.DB.prepare('INSERT INTO tinypng_keys (key, email, monthly_usage, status) VALUES (?, ?, ?, ?)')
      .bind(key, email ?? null, v.compressionCount ?? 0, status)
      .run()
    return c.json({ success: true as const, data: { id: Number(r.meta.last_row_id), valid: v.valid, compression_count: v.compressionCount } }, 201)
  } catch (e: unknown) {
    if (e instanceof Error && e.message?.includes('UNIQUE')) return c.json({ success: false as const, error: 'Key already exists' }, 409)
    throw e
  }
})

keysApp.openapi(batchRoute, async (c) => {
  const { keys } = c.req.valid('json')
  const pool = new KeyPool(c.env.DB)
  let added = 0, skipped = 0
  for (const item of keys) {
    try {
      const v = await pool.validateKey(item.key)
      const status = !v.valid ? 'invalid' : (v.compressionCount != null && v.compressionCount >= 500) ? 'exhausted' : 'active'
      await c.env.DB.prepare('INSERT INTO tinypng_keys (key, email, monthly_usage, status) VALUES (?, ?, ?, ?)')
        .bind(item.key, item.email ?? null, v.compressionCount ?? 0, status).run()
      added++
    } catch { skipped++ }
  }
  return c.json({ success: true as const, data: { added, skipped } }, 200)
})

keysApp.openapi(exportRoute, async (c) => {
  const result = await c.env.DB.prepare('SELECT key, email, status FROM tinypng_keys ORDER BY created_at DESC').all<{ key: string; email: string | null; status: string }>()
  return c.json({ success: true as const, data: { keys: result.results } }, 200)
})

keysApp.openapi(toggleRoute, async (c) => {
  const { id } = c.req.valid('param')
  const row = await c.env.DB.prepare('SELECT id, status FROM tinypng_keys WHERE id = ?').bind(id).first<{ id: number; status: string }>()
  if (!row) return c.json({ success: false as const, error: 'Key not found' }, 404)
  const s = row.status === 'disabled' ? 'active' : 'disabled'
  await c.env.DB.prepare('UPDATE tinypng_keys SET status = ? WHERE id = ?').bind(s, id).run()
  return c.json({ success: true as const, data: { status: s } }, 200)
})

keysApp.openapi(registerRoute, async (c) => {
  const { count } = c.req.valid('json')
  const results: { success: boolean; key?: string; email?: string; error?: string }[] = []
  let added = 0, failed = 0
  for (let i = 0; i < count; i++) {
    const r = await registerTinyPngKey(c.env.DB)
    results.push(r)
    if (r.success && r.key) {
      try {
        await c.env.DB.prepare('INSERT INTO tinypng_keys (key, email, monthly_usage, status) VALUES (?, ?, 0, ?)').bind(r.key, r.email ?? null, 'active').run()
        added++
      } catch { results[results.length - 1].error = 'Duplicate key'; failed++ }
    } else { failed++ }
  }
  return c.json({ success: true as const, data: { results, added, failed } }, 200)
})
