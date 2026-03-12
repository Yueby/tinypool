import { ReactiveController, ReactiveControllerHost } from 'lit'
import { zhCN } from './locales/zh-CN'
import { en } from './locales/en'

export type Locale = 'zh-CN' | 'en'

type Messages = Record<string, Record<string, string>>

const messages: Record<Locale, Messages> = { 'zh-CN': zhCN, en }
const listeners = new Set<() => void>()
let current: Locale = 'zh-CN'

export function getLocale(): Locale { return current }

export function setLocale(locale: Locale) {
  current = locale
  localStorage.setItem('locale', locale)
  document.documentElement.lang = locale
  listeners.forEach(fn => fn())
}

export function onLocaleChange(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function t(key: string, ...args: (string | number)[]): string {
  const parts = key.split('.')
  let value: unknown = messages[current]
  for (const p of parts) {
    value = (value as Record<string, unknown>)?.[p]
    if (value === undefined) return key
  }
  if (typeof value !== 'string') return key
  if (!args.length) return value
  return value.replace(/\{(\d+)\}/g, (_, i) => String(args[parseInt(i)] ?? ''))
}

export class I18nController implements ReactiveController {
  private unsub?: () => void
  constructor(private host: ReactiveControllerHost) { host.addController(this) }
  hostConnected() { this.unsub = onLocaleChange(() => this.host.requestUpdate()) }
  hostDisconnected() { this.unsub?.() }
}

function detect(): Locale {
  const stored = localStorage.getItem('locale') as Locale | null
  if (stored && stored in messages) return stored
  return navigator.language.startsWith('zh') ? 'zh-CN' : 'en'
}

current = detect()
document.documentElement.lang = current
