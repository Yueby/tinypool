import { getMailSettings } from '../routes/settings'

interface RegisterResult {
  success: boolean
  key?: string
  email?: string
  error?: string
}

const URL_PREFIXES = ['https://tinypng.com/login?token=', 'https://tinify.com/login?token=']
const URL_END_CHARS = new Set([' ', '\t', '\r', '\n', '"', "'", '<', '>', ']', ')'])

function randomName(len = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz'
  const digits = '0123456789'
  let name = ''
  for (let i = 0; i < len - 3; i++) name += chars[Math.floor(Math.random() * chars.length)]
  for (let i = 0; i < 3; i++) name += digits[Math.floor(Math.random() * digits.length)]
  return name
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function extractCookies(res: Response): string {
  let cookies: string[] = []
  try {
    const arr = (res.headers as any).getSetCookie?.()
    if (Array.isArray(arr) && arr.length > 0) cookies = arr
  } catch {}

  if (cookies.length === 0) {
    const raw = res.headers.get('set-cookie') || ''
    if (raw) cookies = raw.split(/,(?=[^ ]+=)/)
  }

  return cookies.map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ')
}

function mergeCookies(existing: string, incoming: string): string {
  if (!incoming) return existing
  if (!existing) return incoming
  const map = new Map<string, string>()
  for (const pair of `${existing}; ${incoming}`.split('; ')) {
    const [name] = pair.split('=', 1)
    if (name) map.set(name.trim(), pair.trim())
  }
  return [...map.values()].join('; ')
}

async function fetchWithCookies(
  url: string,
  cookies: string,
  init?: RequestInit,
): Promise<{ res: Response; cookies: string }> {
  const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) || {}) }
  if (cookies) headers['cookie'] = cookies

  let res = await fetch(url, { ...init, headers, redirect: 'manual' })
  let allCookies = mergeCookies(cookies, extractCookies(res))

  let redirects = 0
  while ([301, 302, 303, 307].includes(res.status) && redirects < 10) {
    const location = res.headers.get('location')
    if (!location) break
    const nextUrl = location.startsWith('http') ? location : new URL(location, url).href
    res = await fetch(nextUrl, { headers: { cookie: allCookies }, redirect: 'manual' })
    allCookies = mergeCookies(allCookies, extractCookies(res))
    redirects++
  }

  return { res, cookies: allCookies }
}

function scanUrlFrom(text: string): string | null {
  for (const prefix of URL_PREFIXES) {
    const idx = text.indexOf(prefix)
    if (idx < 0) continue
    let end = idx + prefix.length
    while (end < text.length && !URL_END_CHARS.has(text[end])) end++
    return text.substring(idx, end)
  }
  return null
}

function findConfirmUrl(raw: string): string | null {
  // Strategy 0: direct indexOf on raw content
  const s0 = scanUrlFrom(raw)
  if (s0) return s0

  // Strategy 1: QP soft-break removal + =3D decode + HTML entity decode
  const s1 = scanUrlFrom(raw.replace(/=\r?\n/g, '').replace(/=3D/gi, '=').replace(/&amp;/g, '&'))
  if (s1) return s1

  // Strategy 2: remove ALL line breaks + =3D decode
  const s2 = scanUrlFrom(raw.replace(/[\r\n]+/g, '').replace(/=3D/gi, '=').replace(/&amp;/g, '&'))
  if (s2) return s2

  // Strategy 3: full quoted-printable decode
  const decoded = raw
    .replace(/=\r?\n/g, '')
    .replace(/[\r\n]+/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
  const s3 = scanUrlFrom(decoded)
  if (s3) return s3

  // Strategy 4: base64 body block extraction
  const b64Re = /Content-Transfer-Encoding:\s*base64[\s\S]*?\n\n([\s\S]*?)(?=\n--)/gi
  let m: RegExpExecArray | null
  while ((m = b64Re.exec(raw)) !== null) {
    try {
      const b64decoded = atob(m[1].replace(/\s/g, ''))
      const s4 = scanUrlFrom(b64decoded.replace(/&amp;/g, '&'))
      if (s4) return s4
    } catch {}
  }

  // Strategy 5: JSON.stringify fallback
  const jsonStr = JSON.stringify(raw).replace(/\\[rn]/g, '').replace(/=3D/gi, '=').replace(/&amp;/g, '&')
  const s5 = scanUrlFrom(jsonStr)
  if (s5) return s5

  return null
}

export async function registerTinyPngKey(db: D1Database): Promise<RegisterResult> {
  const mail = await getMailSettings(db)
  if (!mail.enabled) {
    return { success: false, error: '临时邮箱未配置' }
  }
  mail.url = mail.url.replace(/\/+$/, '')

  const mailName = randomName()
  let email: string
  let mailJwt: string | undefined

  try {
    const res = await fetch(`${mail.url}/admin/new_address`, {
      method: 'POST',
      headers: { 'x-admin-auth': mail.password, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enablePrefix: true, name: mailName, domain: mail.domain }),
    })
    if (!res.ok) {
      let detail = ''
      try { detail = await res.text() } catch {}
      if (res.status === 401) return { success: false, error: `临时邮箱认证失败 (401)，请检查 Admin 密码是否正确${detail ? ': ' + detail : ''}` }
      return { success: false, error: `创建邮箱失败 (HTTP ${res.status})${detail ? ': ' + detail : ''}` }
    }
    const ct = res.headers.get('content-type') || 'none'
    if (!ct.includes('json'))
      return { success: false, error: `临时邮箱返回非 JSON (HTTP ${res.status}, Content-Type: ${ct})，请检查 API 地址是否正确` }
    const data = (await res.json()) as { address?: string; jwt?: string }
    email = data.address || `${mailName}@${mail.domain}`
    mailJwt = data.jwt
    console.log('[Register] Created email:', email)
  } catch (e: any) {
    return { success: false, error: `创建邮箱网络错误: ${e.message}` }
  }

  // 2. Register on TinyPNG
  try {
    const res = await fetch('https://tinypng.com/web/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: mailName, mail: email }),
    })
    if (res.status === 429) return { success: false, email, error: 'TinyPNG 请求频率限制 (429)，请稍后再试' }
    if (!res.ok) return { success: false, email, error: `TinyPNG 注册请求失败 (HTTP ${res.status})` }
    console.log('[Register] TinyPNG registration OK')
  } catch (e: any) {
    return { success: false, email, error: `TinyPNG 注册网络错误: ${e.message}` }
  }

  // 3. Poll for confirmation email (10 attempts × 5s = 50s max)
  let confirmUrl: string | null = null
  let lastPollInfo = ''

  for (let i = 0; i < 10; i++) {
    await sleep(5000)
    try {
      const res = mailJwt
        ? await fetch(`${mail.url}/api/mails?limit=10&offset=0`, {
            headers: { Authorization: `Bearer ${mailJwt}` },
          })
        : await fetch(
            `${mail.url}/admin/mails?address=${encodeURIComponent(email)}&limit=10&offset=0`,
            { headers: { 'x-admin-auth': mail.password } },
          )

      if (!res.ok) {
        lastPollInfo = `邮件 API 返回 ${res.status}`
        continue
      }
      const body = (await res.json()) as any
      const mails: any[] = Array.isArray(body) ? body : body?.results || body?.data || body?.list || []
      lastPollInfo = `第 ${i + 1} 次轮询: ${mails.length} 封邮件`

      for (const msg of mails) {
        const raw = (msg.raw || msg.text || msg.html || msg.content || msg.body || '') as string
        if (!raw) continue
        confirmUrl = findConfirmUrl(raw)
        if (confirmUrl) break
      }
      if (confirmUrl) break
    } catch (e: any) {
      lastPollInfo = `轮询错误: ${e.message}`
    }
  }

  if (!confirmUrl) return { success: false, email, error: `未收到确认邮件 (${lastPollInfo})` }
  console.log('[Register] Found confirm URL')

  // 4-7. Activate account → get session → create & retrieve API key
  try {
    const { cookies } = await fetchWithCookies(confirmUrl, '')

    let session: { token?: string } | null = null
    for (const domain of ['https://tinypng.com', 'https://tinify.com']) {
      const sessionRes = await fetch(`${domain}/web/session`, { headers: { cookie: cookies } })
      if (sessionRes.ok && sessionRes.headers.get('content-type')?.includes('json')) {
        session = (await sessionRes.json()) as { token?: string }
        if (session?.token) break
      }
    }
    if (!session?.token) return { success: false, email, error: '获取会话 Token 失败（两个域名均未返回）' }

    const createRes = await fetch('https://api.tinify.com/api/keys', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
    })
    if (!createRes.ok) return { success: false, email, error: `创建 API Key 失败 (HTTP ${createRes.status})` }

    const apiRes = await fetch('https://api.tinify.com/api', {
      headers: { Authorization: `Bearer ${session.token}` },
    })
    if (!apiRes.ok) return { success: false, email, error: `获取 Key 列表失败 (HTTP ${apiRes.status})` }
    const apiData = (await apiRes.json()) as { keys?: { key: string }[] }
    if (!apiData.keys?.length) return { success: false, email, error: 'API 未返回任何 Key' }

    console.log('[Register] Success, got API key for', email)
    return { success: true, key: apiData.keys[apiData.keys.length - 1].key, email }
  } catch (e: any) {
    return { success: false, email, error: `激活账号失败: ${e.message}` }
  }
}
