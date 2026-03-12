import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { adminJwtAuth } from '../middleware/auth'
import type { AppEnv } from '../types'

const TokenSchema = z.object({ id: z.number(), name: z.string(), token: z.string(), created_at: z.string() }).openapi('ApiToken')
interface TokenRow { id: number; name: string; token: string; created_at: string }

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return 'tpk_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function ensureTable(db: D1Database) {
  await db.prepare("CREATE TABLE IF NOT EXISTS api_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, token TEXT NOT NULL UNIQUE, created_at TEXT DEFAULT (datetime('now')))").run()
}

const listRoute = createRoute({
  method: 'get', path: '/', tags: ['Tokens'], summary: '获取所有 API Token', security: [{ adminAuth: [] }],
  responses: { 200: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ tokens: z.array(TokenSchema) }) }) } }, description: 'Token 列表' } },
})

const createTokenRoute = createRoute({
  method: 'post', path: '/', tags: ['Tokens'], summary: '创建 API Token', security: [{ adminAuth: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ name: z.string().min(1).max(50) }) } } } },
  responses: {
    201: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: TokenSchema }) } }, description: '创建成功' },
    500: { content: { 'application/json': { schema: z.object({ success: z.literal(false), error: z.string() }) } }, description: '创建失败' },
  },
})

const deleteRoute = createRoute({
  method: 'delete', path: '/{id}', tags: ['Tokens'], summary: '删除 API Token', security: [{ adminAuth: [] }],
  request: { params: z.object({ id: z.string().pipe(z.coerce.number()).openapi({ param: { name: 'id', in: 'path' }, example: '1' }) }) },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ message: z.string() }) }) } }, description: '删除成功' },
    404: { content: { 'application/json': { schema: z.object({ success: z.literal(false), error: z.string() }) } }, description: '不存在' },
  },
})

export const tokensApp = new OpenAPIHono<AppEnv>()
tokensApp.use('/*', adminJwtAuth)

tokensApp.openapi(listRoute, async (c) => {
  await ensureTable(c.env.DB)
  const result = await c.env.DB.prepare('SELECT * FROM api_tokens ORDER BY created_at DESC').all<TokenRow>()
  return c.json({ success: true as const, data: { tokens: result.results } }, 200)
})

tokensApp.openapi(createTokenRoute, async (c) => {
  await ensureTable(c.env.DB)
  const { name } = c.req.valid('json')
  const token = generateToken()
  const r = await c.env.DB.prepare('INSERT INTO api_tokens (name, token) VALUES (?, ?)').bind(name, token).run()
  const row = await c.env.DB.prepare('SELECT * FROM api_tokens WHERE id = ?').bind(r.meta.last_row_id).first<TokenRow>()
  if (!row) return c.json({ success: false as const, error: 'Failed to create token' }, 500)
  return c.json({ success: true as const, data: row }, 201)
})

tokensApp.openapi(deleteRoute, async (c) => {
  await ensureTable(c.env.DB)
  const { id } = c.req.valid('param')
  const existing = await c.env.DB.prepare('SELECT id FROM api_tokens WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ success: false as const, error: 'Token not found' }, 404)
  await c.env.DB.prepare('DELETE FROM api_tokens WHERE id = ?').bind(id).run()
  return c.json({ success: true as const, data: { message: 'Deleted' } }, 200)
})
