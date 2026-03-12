import { t } from './i18n'

type Listener = () => void

class Store {
  private jwt = localStorage.getItem('admin_jwt') || ''
  private listeners = new Set<Listener>()

  get token() { return this.jwt }
  get isLoggedIn() { return !!this.jwt }

  login(token: string) {
    this.jwt = token
    localStorage.setItem('admin_jwt', token)
    this.notify()
  }

  logout() {
    this.jwt = ''
    localStorage.removeItem('admin_jwt')
    this.notify()
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private notify() { this.listeners.forEach(fn => fn()) }
}

export const store = new Store()

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${store.token}`,
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string, string> || {}),
    },
  })

  let json: unknown
  try {
    json = await res.json()
  } catch {
    const text = t('api.nonJsonResponse', res.status)
    console.error(`[API] ${path}:`, text)
    throw new Error(text)
  }

  if (res.status === 401 && store.isLoggedIn && path !== '/auth/login') {
    store.logout()
    throw new Error(t('api.loginExpired'))
  }

  const body = json as { success?: boolean; error?: string; data?: T }
  if (!body.success) {
    const msg = body.error || t('api.requestFailed', res.status)
    console.error(`[API] ${path}:`, msg)
    throw new Error(msg)
  }
  return body.data as T
}
