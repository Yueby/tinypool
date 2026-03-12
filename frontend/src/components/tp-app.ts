import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { store } from '../lib/api'
import { getTheme, onThemeChange, setTheme, type ThemeMode } from '../lib/theme'

declare const __BUILD_VERSION__: string

const TABS = [
  { id: 'dash', label: '概览' },
  { id: 'keys', label: '号池' },
  { id: 'settings', label: '设置' },
] as const

const THEME_LABELS: Record<ThemeMode, string> = { system: '跟随系统', light: '浅色', dark: '深色' }
const THEME_CYCLE: ThemeMode[] = ['system', 'light', 'dark']

@customElement('tp-app')
export class TpApp extends LitElement {
  protected createRenderRoot(): HTMLElement { return this }

  @state() tab = 'dash'
  @state() loggedIn = store.isLoggedIn
  @state() theme: ThemeMode = getTheme()

  private unsubs: (() => void)[] = []

  connectedCallback() {
    super.connectedCallback()
    this.unsubs.push(store.subscribe(() => { this.loggedIn = store.isLoggedIn }))
    this.unsubs.push(onThemeChange(() => { this.theme = getTheme() }))
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.unsubs.forEach(fn => fn())
    this.unsubs = []
  }

  private switchTab(id: string) {
    this.tab = id
    const tag = { dash: 'tp-dashboard', keys: 'tp-keys', settings: 'tp-settings' }[id]
    if (tag) (this.querySelector(tag) as any)?.load?.()
  }

  private cycleTheme() {
    const idx = THEME_CYCLE.indexOf(this.theme)
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length])
  }

  private get themeIconClass(): string {
    if (this.theme === 'dark') return 'bg-current border-current'
    if (this.theme === 'light') return 'bg-transparent border-current'
    return 'border-current'
  }

  render() {
    if (!this.loggedIn) return html`<tp-login></tp-login>`

    return html`
      <div class="flex flex-col h-screen overflow-hidden">
        <nav class="shrink-0 border-b border-bd bg-sf/80 backdrop-blur-lg z-40">
          <div class="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
            <div class="flex items-center gap-5">
              <span class="font-semibold text-t1 text-sm tracking-tight">🐼 <span class="text-ac">Tiny</span>Pool</span>
              <div class="flex items-center gap-0.5">
                ${TABS.map(t => html`
                  <button
                    class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${this.tab === t.id
                      ? 'bg-ac-bg text-ac'
                      : 'text-t2 hover:text-t1 hover:bg-sf2'}"
                    @click=${() => this.switchTab(t.id)}
                  >${t.label}</button>
                `)}
              </div>
            </div>
            <div class="flex items-center gap-3">
              <button
                class="text-sm text-t3 hover:text-t2 transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-sf2"
                @click=${this.cycleTheme}
                title=${THEME_LABELS[this.theme]}
              ><span class="inline-block w-3 h-3 rounded-full border-[1.5px] ${this.themeIconClass}" style="${this.theme === 'system' ? 'background: linear-gradient(90deg, currentColor 50%, transparent 50%)' : ''}"></span></button>
              <span class="text-[10px] text-t3 font-mono">${__BUILD_VERSION__}</span>
              <a href="/docs" class="text-xs text-t3 hover:text-t2 transition-colors">API</a>
              <button class="text-xs text-t3 hover:text-err transition-colors" @click=${() => store.logout()}>退出</button>
            </div>
          </div>
        </nav>

        <main class="flex-1 overflow-y-auto"><div class="max-w-5xl w-full mx-auto px-4 py-5">
          <div class="${this.tab === 'dash' ? '' : 'hidden'}"><tp-dashboard></tp-dashboard></div>
          <div class="${this.tab === 'keys' ? '' : 'hidden'}"><tp-keys></tp-keys></div>
          <div class="${this.tab === 'settings' ? '' : 'hidden'}"><tp-settings></tp-settings></div>
        </div></main>
      </div>
    `
  }
}
