import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { store } from '../lib/api'
import { I18nController, getLocale, setLocale, t, type Locale } from '../lib/i18n'
import { getTheme, onThemeChange, setTheme, type ThemeMode } from '../lib/theme'

declare const __BUILD_VERSION__: string

const TABS = [
  { id: 'dash', i18n: 'nav.dashboard' },
  { id: 'keys', i18n: 'nav.keys' },
  { id: 'settings', i18n: 'nav.settings' },
] as const

const THEME_I18N: Record<ThemeMode, string> = { system: 'nav.themeSystem', light: 'nav.themeLight', dark: 'nav.themeDark' }
const THEME_CYCLE: ThemeMode[] = ['system', 'light', 'dark']

@customElement('tp-app')
export class TpApp extends LitElement {
  protected createRenderRoot(): HTMLElement { return this }

  private i18n = new I18nController(this)
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

  private changeLocale(e: Event) {
    setLocale((e.target as HTMLSelectElement).value as Locale)
  }

  private get themeIcon() {
    if (this.theme === 'light') return html`<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    if (this.theme === 'dark') return html`<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
    return html`<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" stroke-dasharray="0"/><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" stroke="none" opacity="0.3"/></svg>`
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
                ${TABS.map(tab => html`
                  <button
                    class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${this.tab === tab.id
                      ? 'bg-ac-bg text-ac'
                      : 'text-t2 hover:text-t1 hover:bg-sf2'}"
                    @click=${() => this.switchTab(tab.id)}
                  >${t(tab.i18n)}</button>
                `)}
              </div>
            </div>
            <div class="flex items-center gap-0.5">
              <select
                class="select text-xs"
                @change=${this.changeLocale}
              >
                <option value="zh-CN" ?selected=${getLocale() === 'zh-CN'}>中文</option>
                <option value="en" ?selected=${getLocale() === 'en'}>EN</option>
              </select>
              <div class="w-px h-4 bg-bd mx-0.5"></div>
              <button
                class="text-sm text-t3 hover:text-t2 transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-sf2"
                @click=${this.cycleTheme}
                title=${t(THEME_I18N[this.theme])}
              >${this.themeIcon}</button>
              <a href="https://github.com/Yueby/tinypool" target="_blank" rel="noopener" class="text-t3 hover:text-t2 transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-sf2" title="GitHub">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
              </a>
              <a href="/docs" target="_blank" rel="noopener" class="text-t3 hover:text-t2 transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-sf2" title=${t('nav.apiDocs')}>
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </a>
              <button class="text-t3 hover:text-err transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-sf2" title=${t('nav.logout')} @click=${() => store.logout()}>
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
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
