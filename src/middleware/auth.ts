import { type Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { verifyJwt } from '../services/jwt'
import type { AppEnv } from '../types'

function getBearerToken(c: Context<AppEnv>): string {
  const auth = c.req.header('Authorization') ?? ''
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : ''
}

function fail(c: Context<AppEnv>, msg: string) {
  return c.json({ success: false, error: msg }, 401)
}

export const apiTokenAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getBearerToken(c)
  if (!token) return fail(c, 'Missing Authorization header')
  try {
    await c.env.DB.prepare("CREATE TABLE IF NOT EXISTS api_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, token TEXT NOT NULL UNIQUE, created_at TEXT DEFAULT (datetime('now')))").run()
    const row = await c.env.DB.prepare('SELECT id FROM api_tokens WHERE token = ?').bind(token).first<{ id: number }>()
    if (row) {
      c.set('apiTokenId', row.id)
      await next()
      return
    }
  } catch (e) {
    console.error('[apiTokenAuth]', e)
  }
  return fail(c, 'Invalid API token')
})

export const adminJwtAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getBearerToken(c)
  if (!token) return fail(c, 'Missing Authorization header')
  const payload = await verifyJwt(token, c.env.JWT_SECRET)
  if (!payload || payload.role !== 'admin') return fail(c, 'Invalid or expired token')
  c.set('adminAuth', true)
  await next()
})
