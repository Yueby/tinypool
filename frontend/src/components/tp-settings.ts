declare const __BUILD_VERSION__: string

import { LitElement, html, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { t, I18nController } from '../lib/i18n'

interface Token { id: number; name: string; token: string; created_at: string }
interface MailConfig { enabled: boolean; url: string; domain: string; password: string }
interface AutoReplenish { enabled: boolean; min_healthy_keys: number; remaining_threshold: number }

const INTERVAL_OPTIONS = [5, 15, 30, 60, 360, 720, 1440] as const
const INTERVAL_I18N: Record<number, string> = { 5: 'settings.every5min', 15: 'settings.every15min', 30: 'settings.every30min', 60: 'settings.everyHour', 360: 'settings.every6h', 720: 'settings.every12h', 1440: 'settings.everyDay' }

@customElement('tp-settings')
export class TpSettings extends LitElement {
  protected createRenderRoot(): HTMLElement { return this }

  private i18n = new I18nController(this)
  @state() syncInterval = 360
  @state() tokens: Token[] = []
  @state() showNewToken = false
  @state() mail: MailConfig = { enabled: false, url: '', domain: '', password: '' }
  @state() mailEditing = false
  @state() autoReplenish: AutoReplenish = { enabled: false, min_healthy_keys: 3, remaining_threshold: 100 }
  @state() arEditing = false

  connectedCallback() { super.connectedCallback(); this.load() }

  async load() {
    try {
      const [i, tk, m, ar] = await Promise.all([
        api<{ interval_minutes: number }>('/settings/sync-interval'),
        api<{ tokens: Token[] }>('/tokens'),
        api<MailConfig>('/settings/mail'),
        api<AutoReplenish>('/settings/auto-replenish'),
      ])
      this.syncInterval = i.interval_minutes
      this.tokens = tk.tokens
      this.mail = m
      this.autoReplenish = ar
    } catch (e: unknown) { toast((e as Error).message || t('common.loadFailed'), 'error') }
  }

  async saveSyncInterval(e: Event) {
    const v = parseInt((e.target as HTMLSelectElement).value)
    try { await api('/settings/sync-interval', { method: 'PUT', body: JSON.stringify({ interval_minutes: v }) }); this.syncInterval = v; toast(t('settings.intervalUpdated'), 'success') } catch (e: unknown) { toast((e as Error).message, 'error') }
  }

  async saveMail() {
    const url = (this.querySelector('#mail-url') as HTMLInputElement)?.value.trim()
    const domain = (this.querySelector('#mail-domain') as HTMLInputElement)?.value.trim()
    const password = (this.querySelector('#mail-pw') as HTMLInputElement)?.value.trim()
    try {
      const r = await api<{ enabled: boolean }>('/settings/mail', { method: 'PUT', body: JSON.stringify({ url, domain, password }) })
      this.mail = { enabled: r.enabled, url, domain, password }
      this.mailEditing = false
      toast(r.enabled ? t('settings.autoRegisterEnabled') : t('settings.savedIncomplete'), r.enabled ? 'success' : 'info')
    } catch (e: unknown) { toast((e as Error).message, 'error') }
  }

  async saveAutoReplenish() {
    const enabled = (this.querySelector('#ar-enabled') as HTMLInputElement)?.checked ?? false
    const minKeys = parseInt((this.querySelector('#ar-min-keys') as HTMLInputElement)?.value, 10) || 3
    const threshold = parseInt((this.querySelector('#ar-threshold') as HTMLInputElement)?.value, 10) || 100
    try {
      const r = await api<AutoReplenish>('/settings/auto-replenish', { method: 'PUT', body: JSON.stringify({ enabled, min_healthy_keys: minKeys, remaining_threshold: threshold }) })
      this.autoReplenish = r
      this.arEditing = false
      toast(t('common.saved'), 'success')
    } catch (e: unknown) { toast((e as Error).message, 'error') }
  }

  async createToken() {
    const name = (this.querySelector('#tn') as HTMLInputElement)?.value.trim()
    if (!name) return toast(t('settings.enterName'), 'error')
    try { await api('/tokens', { method: 'POST', body: JSON.stringify({ name }) }); toast(t('common.created'), 'success'); this.showNewToken = false; this.load() } catch (e: unknown) { toast((e as Error).message, 'error') }
  }

  async deleteToken(id: number) {
    if (!confirm(t('settings.deleteConfirm'))) return
    try { await api(`/tokens/${id}`, { method: 'DELETE' }); toast(t('common.deleted'), 'success'); this.load() } catch (e: unknown) { toast((e as Error).message, 'error') }
  }

  render() {
    return html`
      <div class="space-y-5">
        <h2 class="text-base font-semibold text-t1">${t('settings.title')}</h2>

        <div class="card p-4">
          <div class="text-sm font-medium text-t1 mb-1">${t('settings.syncInterval')}</div>
          <p class="text-xs text-t3 mb-3">${t('settings.syncIntervalDesc')}</p>
          <select class="select" @change=${this.saveSyncInterval}>
            ${INTERVAL_OPTIONS.map(v => html`
              <option value=${v} ?selected=${this.syncInterval === v}>${t(INTERVAL_I18N[v])}</option>
            `)}
          </select>
        </div>

        <div class="card p-4">
          <div class="flex items-center justify-between mb-1">
            <div class="text-sm font-medium text-t1">${t('settings.autoRegister')}</div>
            <span class="badge ${this.mail.enabled ? 'badge-success' : 'badge-muted'}">${this.mail.enabled ? t('common.enabled') : t('common.notConfigured')}</span>
          </div>
          <p class="text-xs text-t3 mb-3">${t('settings.autoRegisterDesc')}</p>
          ${this.mailEditing ? html`
            <div class="space-y-2 mb-3">
              <input id="mail-url" class="input w-full" placeholder=${t('settings.mailApiUrl')} .value=${this.mail.url} />
              <input id="mail-domain" class="input w-full" placeholder=${t('settings.mailDomain')} .value=${this.mail.domain} />
              <input id="mail-pw" type="password" class="input w-full" placeholder=${t('settings.adminPassword')} .value=${this.mail.password} />
            </div>
            <div class="flex gap-2">
              <button class="btn btn-primary btn-sm" @click=${() => this.saveMail()}>${t('common.save')}</button>
              <button class="btn btn-ghost btn-sm" @click=${() => this.mailEditing = false}>${t('common.cancel')}</button>
            </div>
          ` : html`
            <button class="btn btn-ghost btn-sm" @click=${() => this.mailEditing = true}>${t('common.configure')}</button>
          `}
        </div>

        <div class="card p-4">
          <div class="flex items-center justify-between mb-1">
            <div class="text-sm font-medium text-t1">${t('settings.autoReplenish')}</div>
            <span class="badge ${this.autoReplenish.enabled ? 'badge-success' : 'badge-muted'}">${this.autoReplenish.enabled ? t('common.enabled') : t('common.notEnabled')}</span>
          </div>
          <p class="text-xs text-t3 mb-3">${t('settings.autoReplenishDesc')}</p>
          ${this.arEditing ? html`
            <div class="space-y-2 mb-3">
              <label class="flex items-center gap-2 text-xs text-t2">
                <input id="ar-enabled" type="checkbox" .checked=${this.autoReplenish.enabled} /> ${t('settings.enableAutoReplenish')}
              </label>
              <div>
                <label class="block text-xs text-t3 mb-1">${t('settings.minHealthyKeys')}</label>
                <input id="ar-min-keys" type="number" class="input w-full" min="1" max="50" .value=${String(this.autoReplenish.min_healthy_keys)} />
              </div>
              <div>
                <label class="block text-xs text-t3 mb-1">${t('settings.remainingThreshold')}</label>
                <input id="ar-threshold" type="number" class="input w-full" min="1" max="500" .value=${String(this.autoReplenish.remaining_threshold)} />
              </div>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-primary btn-sm" @click=${() => this.saveAutoReplenish()}>${t('common.save')}</button>
              <button class="btn btn-ghost btn-sm" @click=${() => this.arEditing = false}>${t('common.cancel')}</button>
            </div>
          ` : html`
            <button class="btn btn-ghost btn-sm" @click=${() => this.arEditing = true}>${t('common.configure')}</button>
          `}
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium text-t1">${t('settings.apiToken')}</div>
              <p class="text-xs text-t3 mt-0.5">${t('settings.apiTokenDesc')}</p>
            </div>
            <button class="btn btn-primary btn-sm" @click=${() => this.showNewToken = true}>${t('settings.newToken')}</button>
          </div>
          <div class="card overflow-hidden">
            <table>
              <thead><tr><th>${t('settings.thName')}</th><th>${t('settings.thToken')}</th><th>${t('settings.thCreatedAt')}</th><th>${t('settings.thAction')}</th></tr></thead>
              <tbody>
                ${!this.tokens.length ? html`<tr><td colspan="4" class="text-center text-t3 py-8">${t('settings.noTokens')}</td></tr>` : this.tokens.map(tk => html`
                  <tr>
                    <td class="text-sm text-t1">${tk.name}</td>
                    <td><code class="font-mono text-xs text-ac cursor-pointer" title=${tk.token} @click=${async () => { try { await navigator.clipboard.writeText(tk.token); toast(t('common.copied'), 'success') } catch { toast(t('common.copyFailed'), 'error') } }}>${tk.token.slice(0, 16)}...</code></td>
                    <td class="text-xs">${tk.created_at}</td>
                    <td><button class="btn btn-danger btn-sm" @click=${() => this.deleteToken(tk.id)}>${t('common.delete')}</button></td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </div>
        <div class="text-xs text-t3 text-center font-mono pt-2">${__BUILD_VERSION__}</div>
      </div>

      ${this.showNewToken ? html`
        <div class="modal-backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget) this.showNewToken = false }}>
          <div class="modal-box">
            <h3 class="text-base font-semibold text-t1 mb-4">${t('settings.newTokenTitle')}</h3>
            <label class="block text-xs text-t3 mb-1">${t('settings.tokenNameLabel')}</label>
            <input id="tn" class="input w-full mb-4" placeholder=${t('settings.tokenNamePlaceholder')} />
            <div class="flex justify-end gap-2">
              <button class="btn btn-ghost" @click=${() => this.showNewToken = false}>${t('common.cancel')}</button>
              <button class="btn btn-primary" @click=${() => this.createToken()}>${t('settings.create')}</button>
            </div>
          </div>
        </div>
      ` : nothing}
    `
  }
}
