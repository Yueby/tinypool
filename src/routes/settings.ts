import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { adminJwtAuth } from '../middleware/auth'
import type { AppEnv } from '../types'

export async function ensureTable(db: D1Database) {
  await db.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)").run()
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>()
  return row?.value ?? null
}

export async function setSetting(db: D1Database, key: string, value: string) {
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, value).run()
}

export interface AutoReplenishConfig {
  enabled: boolean
  min_healthy_keys: number
  remaining_threshold: number
}

export async function getAutoReplenishConfig(db: D1Database): Promise<AutoReplenishConfig> {
  await ensureTable(db)
  const [enabled, minKeys, threshold] = await Promise.all([
    getSetting(db, 'auto_replenish_enabled'),
    getSetting(db, 'auto_replenish_min_healthy_keys'),
    getSetting(db, 'auto_replenish_remaining_threshold'),
  ])
  return {
    enabled: enabled === 'true',
    min_healthy_keys: minKeys ? parseInt(minKeys, 10) : 3,
    remaining_threshold: threshold ? parseInt(threshold, 10) : 100,
  }
}

export async function getMailSettings(db: D1Database): Promise<{ enabled: boolean; url: string; domain: string; password: string }> {
  await ensureTable(db)
  const [url, domain, password] = await Promise.all([
    getSetting(db, 'temp_mail_url'),
    getSetting(db, 'temp_mail_domain'),
    getSetting(db, 'temp_mail_password'),
  ])
  const enabled = !!(url && domain && password)
  return { enabled, url: url || '', domain: domain || '', password: password || '' }
}

const getSyncRoute = createRoute({
  method: 'get', path: '/sync-interval', tags: ['Settings'], summary: '获取同步间隔', security: [{ adminAuth: [] }],
  responses: { 200: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ interval_minutes: z.number() }) }) } }, description: '当前间隔' } },
})

const setSyncRoute = createRoute({
  method: 'put', path: '/sync-interval', tags: ['Settings'], summary: '设置同步间隔', security: [{ adminAuth: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ interval_minutes: z.number().min(1).max(1440) }) } } } },
  responses: { 200: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ interval_minutes: z.number() }) }) } }, description: '设置成功' } },
})

const getMailRoute = createRoute({
  method: 'get', path: '/mail', tags: ['Settings'], summary: '获取临时邮箱配置', security: [{ adminAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ enabled: z.boolean(), url: z.string(), domain: z.string(), hasPassword: z.boolean() }) }) } },
      description: '配置信息',
    },
  },
})

const setMailRoute = createRoute({
  method: 'put', path: '/mail', tags: ['Settings'], summary: '设置临时邮箱配置', security: [{ adminAuth: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ url: z.string(), domain: z.string(), password: z.string().optional().default('') }) } } } },
  responses: { 200: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ enabled: z.boolean() }) }) } }, description: '保存成功' } },
})

const getAutoReplenishRoute = createRoute({
  method: 'get', path: '/auto-replenish', tags: ['Settings'], summary: '获取自动补充配置', security: [{ adminAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ enabled: z.boolean(), min_healthy_keys: z.number(), remaining_threshold: z.number() }) }) } },
      description: '配置信息',
    },
  },
})

const setAutoReplenishRoute = createRoute({
  method: 'put', path: '/auto-replenish', tags: ['Settings'], summary: '设置自动补充配置', security: [{ adminAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: z.object({ enabled: z.boolean(), min_healthy_keys: z.number().min(1).max(50), remaining_threshold: z.number().min(1).max(500) }) } } },
  },
  responses: { 200: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ enabled: z.boolean(), min_healthy_keys: z.number(), remaining_threshold: z.number() }) }) } }, description: '保存成功' } },
})

export const settingsApp = new OpenAPIHono<AppEnv>()
settingsApp.use('/*', adminJwtAuth)

settingsApp.openapi(getSyncRoute, async (c) => {
  await ensureTable(c.env.DB)
  const val = await getSetting(c.env.DB, 'sync_interval_minutes')
  const parsed = val ? parseInt(val, 10) : 360
  const interval = Number.isNaN(parsed) ? 360 : parsed
  return c.json({ success: true as const, data: { interval_minutes: interval } }, 200)
})

settingsApp.openapi(setSyncRoute, async (c) => {
  await ensureTable(c.env.DB)
  const { interval_minutes } = c.req.valid('json')
  await setSetting(c.env.DB, 'sync_interval_minutes', String(interval_minutes))
  return c.json({ success: true as const, data: { interval_minutes } }, 200)
})

settingsApp.openapi(getMailRoute, async (c) => {
  const data = await getMailSettings(c.env.DB)
  return c.json({ success: true as const, data: { enabled: data.enabled, url: data.url, domain: data.domain, hasPassword: !!data.password } }, 200)
})

settingsApp.openapi(setMailRoute, async (c) => {
  await ensureTable(c.env.DB)
  const { url, domain, password } = c.req.valid('json')
  const updates = [
    setSetting(c.env.DB, 'temp_mail_url', url),
    setSetting(c.env.DB, 'temp_mail_domain', domain),
  ]
  if (password) updates.push(setSetting(c.env.DB, 'temp_mail_password', password))
  await Promise.all(updates)
  const currentPw = password || await getSetting(c.env.DB, 'temp_mail_password') || ''
  const enabled = !!(url && domain && currentPw)
  return c.json({ success: true as const, data: { enabled } }, 200)
})

settingsApp.openapi(getAutoReplenishRoute, async (c) => {
  const config = await getAutoReplenishConfig(c.env.DB)
  return c.json({ success: true as const, data: config }, 200)
})

settingsApp.openapi(setAutoReplenishRoute, async (c) => {
  await ensureTable(c.env.DB)
  const { enabled, min_healthy_keys, remaining_threshold } = c.req.valid('json')
  await Promise.all([
    setSetting(c.env.DB, 'auto_replenish_enabled', String(enabled)),
    setSetting(c.env.DB, 'auto_replenish_min_healthy_keys', String(min_healthy_keys)),
    setSetting(c.env.DB, 'auto_replenish_remaining_threshold', String(remaining_threshold)),
  ])
  return c.json({ success: true as const, data: { enabled, min_healthy_keys, remaining_threshold } }, 200)
})
