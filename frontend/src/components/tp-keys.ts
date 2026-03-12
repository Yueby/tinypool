import { LitElement, html, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../lib/api'
import { toast } from '../lib/toast'

interface Key { id: number; key: string; email: string | null; monthly_usage: number; monthly_limit: number; status: string; last_checked_at: string | null }

@customElement('tp-keys')
export class TpKeys extends LitElement {
  protected createRenderRoot(): HTMLElement { return this }

  @state() keys: Key[] = []
  @state() showAdd = false
  @state() showRegister = false
  @state() registering = false
  @state() registerEnabled = false
  @state() registerResults: { success: boolean; email?: string; error?: string; status?: string }[] = []
  @state() registerProgress = ''
  @state() addMode: 'single' | 'batch' | 'import' = 'single'

  connectedCallback() { super.connectedCallback(); this.load() }

  async load() {
    try {
      const [k, m] = await Promise.all([
        api<{ keys: Key[] }>('/keys'),
        api<{ enabled: boolean }>('/settings/mail'),
      ])
      this.keys = k.keys
      this.registerEnabled = m.enabled
    } catch (e: unknown) { toast((e as Error).message || '加载失败', 'error') }
  }

  async toggle(id: number) {
    try { const r = await api<{ status: string }>(`/keys/${id}/toggle`, { method: 'PATCH' }); toast(`已${r.status === 'disabled' ? '禁用' : '启用'}`, 'success'); this.load() } catch (e: unknown) { toast((e as Error).message, 'error') }
  }

  private async copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast('已复制', 'success') } catch { toast('复制失败', 'error') }
  }

  async doAdd() {
    try {
      if (this.addMode === 'single') {
        const key = (this.querySelector('#sk') as HTMLInputElement)?.value.trim()
        if (!key) return toast('请输入 Key', 'error')
        const email = (this.querySelector('#se') as HTMLInputElement)?.value.trim()
        await api('/keys', { method: 'POST', body: JSON.stringify({ key, email: email || undefined }) })
        toast('已添加', 'success')
      } else if (this.addMode === 'batch') {
        const txt = (this.querySelector('#bi') as HTMLTextAreaElement)?.value.trim()
        if (!txt) return toast('请输入', 'error')
        const keys = txt.split('\n').filter(Boolean).map(l => { const [k, e] = l.split(',').map(s => s.trim()); return { key: k, ...(e ? { email: e } : {}) } })
        const r = await api<{ added: number; skipped: number }>('/keys/batch', { method: 'POST', body: JSON.stringify({ keys }) })
        toast(`添加 ${r.added}，跳过 ${r.skipped}`, 'success')
      } else {
        const file = (this.querySelector('#fi') as HTMLInputElement)?.files?.[0]
        if (!file) return toast('请选择文件', 'error')
        const text = await file.text()
        const parsed = JSON.parse(text) as { keys?: { key: string; email?: string }[] }
        const keys = parsed.keys || []
        if (!keys.length) return toast('文件中没有 Key', 'error')
        const r = await api<{ added: number; skipped: number }>('/keys/batch', { method: 'POST', body: JSON.stringify({ keys }) })
        toast(`导入 ${r.added}，跳过 ${r.skipped}`, 'success')
      }
      this.showAdd = false
      this.load()
    } catch (e: unknown) { toast((e as Error).message || '操作失败', 'error') }
  }

  async doExport() {
    try {
      const data = await api<{ keys: { key: string; email: string | null; status: string }[] }>('/keys/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `tinypool-keys-${new Date().toISOString().slice(0, 10)}.json`
      a.click(); URL.revokeObjectURL(url)
      toast(`已导出 ${data.keys.length} 个 Key`, 'success')
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
      this.registerResults = [...this.registerResults, { success: false, status: '注册中...' }]
      try {
        const r = await api<{ results: { success: boolean; email?: string; error?: string }[]; added: number; failed: number }>('/keys/register', { method: 'POST', body: JSON.stringify({ count: 1 }) })
        const result = r.results[0] || { success: false, error: '未返回结果' }
        this.registerResults = [...this.registerResults.slice(0, -1), result]
        totalAdded += r.added
        if (result.error?.includes('429') || result.error?.includes('频率限制')) {
          for (let j = i + 1; j < count; j++) {
            this.registerResults = [...this.registerResults, { success: false, error: '已跳过（频率限制）' }]
          }
          break
        }
      } catch (e: unknown) {
        this.registerResults = [...this.registerResults.slice(0, -1), { success: false, error: (e as Error).message }]
      }
    }
    this.registerProgress = ''
    toast(`完成：成功 ${totalAdded}，失败 ${count - totalAdded}`, totalAdded > 0 ? 'success' : 'error')
    if (totalAdded > 0) this.load()
    this.registering = false
  }

  async syncAll() {
    toast('同步中...', 'info')
    try { const r = await api<{ checked: number; updated: number; invalid: number }>('/stats/sync', { method: 'POST' }); toast(`检查 ${r.checked} · 更新 ${r.updated} · 无效 ${r.invalid}`, 'success'); this.load() } catch (e: unknown) { toast((e as Error).message, 'error') }
  }

  private badge(status: string) {
    const m: Record<string, string> = { active: 'badge-success', exhausted: 'badge-warning', invalid: 'badge-danger', disabled: 'badge-muted' }
    return html`<span class="badge ${m[status] || 'badge-muted'}">${status}</span>`
  }

  render() {
    return html`
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-t1">号池管理</h2>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" @click=${() => this.syncAll()}>刷新额度</button>
            <button class="btn btn-ghost btn-sm" @click=${() => this.doExport()}>导出</button>
            <button class="btn btn-ghost btn-sm" @click=${() => this.showAdd = true}>+ 添加</button>
            ${this.registerEnabled ? html`<button class="btn btn-primary btn-sm" @click=${() => this.showRegister = true}>自动注册</button>` : nothing}
          </div>
        </div>
        <div class="card overflow-hidden">
          <div class="overflow-x-auto">
            <table>
              <thead><tr><th>ID</th><th>Key</th><th>邮箱</th><th>用量</th><th>状态</th><th>最后检查</th><th>操作</th></tr></thead>
              <tbody>
                ${!this.keys.length ? html`<tr><td colspan="7" class="text-center text-t3 py-8">暂无 Key</td></tr>` : this.keys.map(k => html`
                  <tr>
                    <td class="font-mono text-xs">${k.id}</td>
                    <td><code class="font-mono text-xs text-ac cursor-pointer" title=${k.key} @click=${() => this.copy(k.key)}>${k.key.slice(0, 12)}...</code></td>
                    <td class="text-xs">${k.email || '-'}</td>
                    <td class="font-mono text-xs">${k.monthly_usage}/${k.monthly_limit}</td>
                    <td>${this.badge(k.status)}</td>
                    <td class="text-xs">${k.last_checked_at || '-'}</td>
                    <td><button class="btn btn-ghost btn-sm" @click=${() => this.toggle(k.id)}>${k.status === 'disabled' ? '启用' : '禁用'}</button></td>
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
            <h3 class="text-base font-semibold text-t1 mb-3">添加 Key</h3>
            <div class="flex gap-2 mb-4">
              ${(['single', 'batch', 'import'] as const).map(m => html`
                <button class="btn ${this.addMode === m ? 'btn-primary' : 'btn-ghost'} btn-sm" @click=${() => this.addMode = m}>
                  ${{ single: '单个', batch: '批量', import: '导入' }[m]}
                </button>
              `)}
            </div>
            ${this.addMode === 'single' ? html`
              <input id="sk" class="input w-full mb-2" placeholder="API Key" />
              <input id="se" class="input w-full mb-4" placeholder="邮箱（可选）" />
            ` : this.addMode === 'batch' ? html`
              <textarea id="bi" class="input w-full mb-4" rows="5" placeholder="每行: key 或 key,email"></textarea>
            ` : html`
              <input id="fi" type="file" accept=".json" class="input w-full mb-2 text-sm" />
              <p class="text-xs text-t3 mb-4">JSON 格式：{ "keys": [{ "key": "...", "email": "..." }] }</p>
            `}
            <div class="flex justify-end gap-2">
              <button class="btn btn-ghost" @click=${() => this.showAdd = false}>取消</button>
              <button class="btn btn-primary" @click=${() => this.doAdd()}>${this.addMode === 'import' ? '导入' : '添加'}</button>
            </div>
          </div>
        </div>
      ` : nothing}

      ${this.showRegister ? html`
        <div class="modal-backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget && !this.registering) { this.showRegister = false; this.registerResults = [] } }}>
          <div class="modal-box">
            <h3 class="text-base font-semibold text-t1 mb-2">自动注册</h3>
            <p class="text-xs text-t3 mb-4">通过临时邮箱自动注册 TinyPNG 账号</p>
            <label class="block text-xs text-t3 mb-1">数量 (1-5)</label>
            <input id="rc" type="number" class="input w-full mb-4" value="1" min="1" max="5" ?disabled=${this.registering} />
            ${this.registering ? html`<div class="text-ac text-sm mb-4">注册中 ${this.registerProgress ? `(${this.registerProgress})` : ''}，请稍候...</div>` : nothing}
            ${this.registerResults.length ? html`
              <div class="space-y-2 mb-4 max-h-48 overflow-y-auto">
                ${this.registerResults.map((r: any, i: number) => html`
                  <div class="text-xs p-2 rounded ${r.status === '注册中...' ? 'bg-blue-500/10 text-blue-400' : r.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}">
                    <div class="font-medium">#${i + 1} ${r.status === '注册中...' ? '注册中...' : r.success ? '成功' : '失败'} ${r.email ? `(${r.email})` : ''}</div>
                    ${r.error ? html`<div class="mt-1 opacity-80">${r.error}</div>` : nothing}
                  </div>
                `)}
              </div>
            ` : nothing}
            <div class="flex justify-end gap-2">
              <button class="btn btn-ghost" @click=${() => { this.showRegister = false; this.registerResults = [] }} ?disabled=${this.registering}>
                ${this.registerResults.length ? '关闭' : '取消'}
              </button>
              ${!this.registerResults.length || this.registerResults.some(r => !r.success) ? html`
                <button class="btn btn-primary" @click=${() => this.doRegister()} ?disabled=${this.registering}>
                  ${this.registerResults.length ? '重试' : '开始'}
                </button>
              ` : ''}
              ${this.registerResults.length && this.registerResults.every(r => r.success) ? html`
                <button class="btn btn-primary" @click=${() => { this.showRegister = false; this.registerResults = [] }}>完成</button>
              ` : ''}
            </div>
          </div>
        </div>
      ` : nothing}
    `
  }
}
