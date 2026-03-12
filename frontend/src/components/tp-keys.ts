import { LitElement, html, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { t, I18nController } from '../lib/i18n'

interface Key { id: number; key: string; email: string | null; monthly_usage: number; monthly_limit: number; status: string; last_checked_at: string | null }

const STATUS_I18N: Record<string, string> = { active: 'keys.statusActive', exhausted: 'keys.statusExhausted', invalid: 'keys.statusInvalid', disabled: 'keys.statusDisabled' }

@customElement('tp-keys')
export class TpKeys extends LitElement {
  protected createRenderRoot(): HTMLElement { return this }

  private i18n = new I18nController(this)
  @state() keys: Key[] = []
  @state() showAdd = false
  @state() showRegister = false
  @state() registering = false
  @state() registerEnabled = false
  @state() registerResults: { success: boolean; email?: string; error?: string; status?: string }[] = []
  @state() registerProgress = ''
  @state() addMode: 'single' | 'batch' | 'import' = 'single'
  @state() selectedFileName = ''

  connectedCallback() { super.connectedCallback(); this.load() }

  async load() {
    try {
      const [k, m] = await Promise.all([
        api<{ keys: Key[] }>('/keys'),
        api<{ enabled: boolean }>('/settings/mail'),
      ])
      this.keys = k.keys
      this.registerEnabled = m.enabled
    } catch (e: unknown) { toast((e as Error).message || t('common.loadFailed'), 'error') }
  }

  async toggle(id: number) {
    try { const r = await api<{ status: string }>(`/keys/${id}/toggle`, { method: 'PATCH' }); toast(r.status === 'disabled' ? t('common.disabled') : t('common.enabled'), 'success'); this.load() } catch (e: unknown) { toast((e as Error).message, 'error') }
  }

  private async copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast(t('common.copied'), 'success') } catch { toast(t('common.copyFailed'), 'error') }
  }

  async doAdd() {
    try {
      if (this.addMode === 'single') {
        const key = (this.querySelector('#sk') as HTMLInputElement)?.value.trim()
        if (!key) return toast(t('keys.enterKey'), 'error')
        const email = (this.querySelector('#se') as HTMLInputElement)?.value.trim()
        await api('/keys', { method: 'POST', body: JSON.stringify({ key, email: email || undefined }) })
        toast(t('common.added'), 'success')
      } else if (this.addMode === 'batch') {
        const txt = (this.querySelector('#bi') as HTMLTextAreaElement)?.value.trim()
        if (!txt) return toast(t('keys.enterContent'), 'error')
        const keys = txt.split('\n').filter(Boolean).map(l => { const [k, e] = l.split(',').map(s => s.trim()); return { key: k, ...(e ? { email: e } : {}) } })
        const r = await api<{ added: number; skipped: number }>('/keys/batch', { method: 'POST', body: JSON.stringify({ keys }) })
        toast(t('keys.batchResult', r.added, r.skipped), 'success')
      } else {
        const file = (this.querySelector('#fi') as HTMLInputElement)?.files?.[0]
        if (!file) return toast(t('keys.selectFile'), 'error')
        const text = await file.text()
        const parsed = JSON.parse(text) as { keys?: { key: string; email?: string }[] }
        const keys = parsed.keys || []
        if (!keys.length) return toast(t('keys.noKeysInFile'), 'error')
        const r = await api<{ added: number; skipped: number }>('/keys/batch', { method: 'POST', body: JSON.stringify({ keys }) })
        toast(t('keys.importResult', r.added, r.skipped), 'success')
      }
      this.showAdd = false
      this.selectedFileName = ''
      this.load()
    } catch (e: unknown) { toast((e as Error).message || t('common.operationFailed'), 'error') }
  }

  async doExport() {
    try {
      const data = await api<{ keys: { key: string; email: string | null; status: string }[] }>('/keys/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `tinypool-keys-${new Date().toISOString().slice(0, 10)}.json`
      a.click(); URL.revokeObjectURL(url)
      toast(t('keys.exportResult', data.keys.length), 'success')
    } catch (e: unknown) { toast((e as Error).message, 'error') }
  }

  async doRegister() {
    const count = parseInt((this.querySelector('#rc') as HTMLInputElement)?.value, 10) || 1
    this.registering = true
    this.registerResults = []
    this.registerProgress = ''
    let totalAdded = 0
    for (let i = 0; i < count; i++) {
      this.registerProgress = `${i + 1}/${count}`
      this.registerResults = [...this.registerResults, { success: false, status: t('keys.registering') }]
      try {
        const r = await api<{ results: { success: boolean; email?: string; error?: string }[]; added: number; failed: number }>('/keys/register', { method: 'POST', body: JSON.stringify({ count: 1 }) })
        const result = r.results[0] || { success: false, error: t('keys.noResult') }
        this.registerResults = [...this.registerResults.slice(0, -1), result]
        totalAdded += r.added
        if (result.error?.includes('429') || result.error?.includes('频率限制') || result.error?.includes('rate limit')) {
          for (let j = i + 1; j < count; j++) {
            this.registerResults = [...this.registerResults, { success: false, error: t('keys.skippedRateLimit') }]
          }
          break
        }
      } catch (e: unknown) {
        this.registerResults = [...this.registerResults.slice(0, -1), { success: false, error: (e as Error).message }]
      }
    }
    this.registerProgress = ''
    toast(t('keys.registerComplete', totalAdded, count - totalAdded), totalAdded > 0 ? 'success' : 'error')
    if (totalAdded > 0) this.load()
    this.registering = false
  }

  async syncAll() {
    toast(t('keys.syncing'), 'info')
    try { const r = await api<{ checked: number; updated: number; invalid: number }>('/stats/sync', { method: 'POST' }); toast(t('keys.syncResult', r.checked, r.updated, r.invalid), 'success'); this.load() } catch (e: unknown) { toast((e as Error).message, 'error') }
  }

  private badge(status: string) {
    const m: Record<string, string> = { active: 'badge-success', exhausted: 'badge-warning', invalid: 'badge-danger', disabled: 'badge-muted' }
    return html`<span class="badge ${m[status] || 'badge-muted'}">${t(STATUS_I18N[status] || status)}</span>`
  }

  render() {
    return html`
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-t1">${t('keys.title')}</h2>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" @click=${() => this.syncAll()}>${t('keys.syncQuota')}</button>
            <button class="btn btn-ghost btn-sm" @click=${() => this.doExport()}>${t('keys.export')}</button>
            <button class="btn btn-ghost btn-sm" @click=${() => this.showAdd = true}>${t('keys.add')}</button>
            ${this.registerEnabled ? html`<button class="btn btn-primary btn-sm" @click=${() => this.showRegister = true}>${t('keys.autoRegister')}</button>` : nothing}
          </div>
        </div>
        <div class="card overflow-hidden">
          <div class="overflow-x-auto">
            <table>
              <thead><tr><th>${t('keys.thId')}</th><th>${t('keys.thKey')}</th><th>${t('keys.thEmail')}</th><th>${t('keys.thUsage')}</th><th>${t('keys.thStatus')}</th><th>${t('keys.thLastCheck')}</th><th>${t('keys.thAction')}</th></tr></thead>
              <tbody>
                ${!this.keys.length ? html`<tr><td colspan="7" class="text-center text-t3 py-8">${t('keys.noKeys')}</td></tr>` : this.keys.map(k => html`
                  <tr>
                    <td class="font-mono text-xs">${k.id}</td>
                    <td><code class="font-mono text-xs text-ac cursor-pointer" title=${k.key} @click=${() => this.copy(k.key)}>${k.key.slice(0, 12)}...</code></td>
                    <td class="text-xs">${k.email || '-'}</td>
                    <td class="font-mono text-xs">${k.monthly_usage}/${k.monthly_limit}</td>
                    <td>${this.badge(k.status)}</td>
                    <td class="text-xs">${k.last_checked_at || '-'}</td>
                    <td><button class="btn btn-ghost btn-sm" @click=${() => this.toggle(k.id)}>${k.status === 'disabled' ? t('keys.enable') : t('keys.disable')}</button></td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      ${this.showAdd ? html`
        <div class="modal-backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget) this.showAdd = false }}>
          <div class="modal-box">
            <h3 class="text-base font-semibold text-t1 mb-3">${t('keys.addKeyTitle')}</h3>
            <div class="flex gap-2 mb-4">
              ${(['single', 'batch', 'import'] as const).map(m => html`
                <button class="btn ${this.addMode === m ? 'btn-primary' : 'btn-ghost'} btn-sm" @click=${() => this.addMode = m}>
                  ${{ single: t('keys.single'), batch: t('keys.batch'), import: t('keys.import') }[m]}
                </button>
              `)}
            </div>
            ${this.addMode === 'single' ? html`
              <input id="sk" class="input w-full mb-2" placeholder="API Key" />
              <input id="se" class="input w-full mb-4" placeholder=${t('keys.emailOptional')} />
            ` : this.addMode === 'batch' ? html`
              <textarea id="bi" class="input w-full mb-4" rows="5" placeholder=${t('keys.batchPlaceholder')}></textarea>
            ` : html`
              <div class="input flex items-center gap-2 mb-2 w-full cursor-pointer" @click=${() => (this.querySelector('#fi') as HTMLInputElement)?.click()}>
                <span class="btn btn-ghost btn-sm shrink-0 !px-2 !py-0.5">${t('keys.chooseFile')}</span>
                <span class="text-xs text-t3 truncate">${this.selectedFileName || t('keys.noFileSelected')}</span>
                <input id="fi" type="file" accept=".json" class="hidden" @change=${(e: Event) => { this.selectedFileName = (e.target as HTMLInputElement).files?.[0]?.name || '' }} />
              </div>
              <p class="text-xs text-t3 mb-4">${t('keys.jsonFormat')}</p>
            `}
            <div class="flex justify-end gap-2">
              <button class="btn btn-ghost" @click=${() => this.showAdd = false}>${t('common.cancel')}</button>
              <button class="btn btn-primary" @click=${() => this.doAdd()}>${this.addMode === 'import' ? t('keys.import') : t('keys.addBtn')}</button>
            </div>
          </div>
        </div>
      ` : nothing}

      ${this.showRegister ? html`
        <div class="modal-backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget && !this.registering) { this.showRegister = false; this.registerResults = [] } }}>
          <div class="modal-box">
            <h3 class="text-base font-semibold text-t1 mb-2">${t('keys.registerTitle')}</h3>
            <p class="text-xs text-t3 mb-4">${t('keys.registerDesc')}</p>
            <label class="block text-xs text-t3 mb-1">${t('keys.registerCount')}</label>
            <input id="rc" type="number" class="input w-full mb-4" value="1" min="1" max="5" ?disabled=${this.registering} />
            ${this.registering ? html`<div class="text-ac text-sm mb-4">${t('keys.registeringProgress', this.registerProgress)}</div>` : nothing}
            ${this.registerResults.length ? html`
              <div class="space-y-2 mb-4 max-h-48 overflow-y-auto">
                ${this.registerResults.map((r: any, i: number) => html`
                  <div class="text-xs p-2 rounded ${r.status === t('keys.registering') ? 'bg-blue-500/10 text-blue-400' : r.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}">
                    <div class="font-medium">#${i + 1} ${r.status === t('keys.registering') ? t('keys.registering') : r.success ? t('keys.registerSuccess') : t('keys.registerFailed')} ${r.email ? `(${r.email})` : ''}</div>
                    ${r.error ? html`<div class="mt-1 opacity-80">${r.error}</div>` : nothing}
                  </div>
                `)}
              </div>
            ` : nothing}
            <div class="flex justify-end gap-2">
              <button class="btn btn-ghost" @click=${() => { this.showRegister = false; this.registerResults = [] }} ?disabled=${this.registering}>
                ${this.registerResults.length ? t('common.close') : t('common.cancel')}
              </button>
              ${!this.registerResults.length || this.registerResults.some(r => !r.success) ? html`
                <button class="btn btn-primary" @click=${() => this.doRegister()} ?disabled=${this.registering}>
                  ${this.registerResults.length ? t('keys.retry') : t('keys.start')}
                </button>
              ` : ''}
              ${this.registerResults.length && this.registerResults.every(r => r.success) ? html`
                <button class="btn btn-primary" @click=${() => { this.showRegister = false; this.registerResults = [] }}>${t('keys.done')}</button>
              ` : ''}
            </div>
          </div>
        </div>
      ` : nothing}
    `
  }
}
