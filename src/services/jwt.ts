export async function signJwt(payload: Record<string, unknown>, secret: string, expiresInHours = 24): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = { ...payload, iat: now, exp: now + expiresInHours * 3600 }

  const enc = new TextEncoder()
  const headerB64 = base64url(enc.encode(JSON.stringify(header)))
  const payloadB64 = base64url(enc.encode(JSON.stringify(fullPayload)))
  const data = `${headerB64}.${payloadB64}`

  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))

  return `${data}.${base64url(new Uint8Array(sig))}`
}

export async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const [headerB64, payloadB64, sigB64] = token.split('.')
    if (!headerB64 || !payloadB64 || !sigB64) return null

    const enc = new TextEncoder()
    const data = `${headerB64}.${payloadB64}`
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const sig = fromBase64url(sigB64)
    const valid = await crypto.subtle.verify('HMAC', key, sig, enc.encode(data))
    if (!valid) return null

    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(payloadB64)))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null

    return payload
  } catch {
    return null
  }
}

function base64url(bytes: Uint8Array): string {
  const binStr = Array.from(bytes).map((b) => String.fromCharCode(b)).join('')
  return btoa(binStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (str.length % 4)) % 4)
  const binStr = atob(base64)
  return Uint8Array.from(binStr, (c) => c.charCodeAt(0))
}
