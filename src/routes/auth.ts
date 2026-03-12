import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { signJwt } from '../services/jwt'
import type { AppEnv } from '../types'

async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const keyData = enc.encode(a.padEnd(Math.max(a.length, b.length)))
  const cmpData = enc.encode(b.padEnd(Math.max(a.length, b.length)))
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, cmpData)
  const expected = await crypto.subtle.sign('HMAC', key, keyData)
  const s1 = new Uint8Array(sig)
  const s2 = new Uint8Array(expected)
  if (s1.length !== s2.length) return false
  let diff = 0
  for (let i = 0; i < s1.length; i++) diff |= s1[i] ^ s2[i]
  return diff === 0
}

const loginRoute = createRoute({
  method: 'post', path: '/login', tags: ['Auth'], summary: '管理员登录',
  request: { body: { content: { 'application/json': { schema: z.object({ password: z.string() }) } } } },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ token: z.string() }) }) } }, description: '登录成功' },
    401: { content: { 'application/json': { schema: z.object({ success: z.literal(false), error: z.string() }) } }, description: '密码错误' },
  },
})

export const authApp = new OpenAPIHono<AppEnv>()

authApp.openapi(loginRoute, async (c) => {
  const { password } = c.req.valid('json')
  const match = await constantTimeEqual(password, c.env.ADMIN_PASSWORD)
  if (!match) {
    return c.json({ success: false as const, error: '密码错误' }, 401)
  }
  const token = await signJwt({ role: 'admin' }, c.env.JWT_SECRET, 24)
  return c.json({ success: true as const, data: { token } }, 200)
})
