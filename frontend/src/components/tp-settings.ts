import { LitElement, html, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../lib/api'
import { toast } from '../lib/toast'

interface Token { id: number; name: string; token: string; created_at: string }
interface MailConfig { enabled: boolean; url: string; domain: string; password: string }
interface AutoReplenish { enabled: boolean; min_healthy_keys: number; remaining_threshold: number }

const INTERVAL_OPTIONS = [5, 15, 30, 60, 360, 720, 1440] as const
const INTERVAL_LABELS: Record<number, string> = { 5: '每 5 分钟', 15: '每 15 分钟', 30: '每 30 分钟', 60: '每小时', 360: '每 6 小时', 720: '每 12 小时', 1440: '每天' }

@customElement('tp-settings')
export class TpSettings extends LitElement {
  protected createRenderRoot(): HTMLElement { return this }
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
      const [i, t, m, ar] = await Promise.all([
        api<{ interval_minutes: number }>('/settings/sync-interval'),
        api<{ tokens: Token[] }>('/tokens'),
        api<MailConfig>('/settings/mail'),
        api<AutoReplenish>('/settings/auto-replenish'),
      ])
      this.syncInterval = i.interval_minutes
      this.tokens = t.tokens
      this.mail = m
      this.autoReplenish = ar
    } catch (e: unknown) { toast((e as Error).message || '加载失败', 'error') }
  }

  async saveSyncInterval(e: Event) {
    const v = parseInt((e.target as HTMLSelectElement).value)
    try { await api('/settings/sync-interval', { method: 'PUT', body: JSON.stringify({ interval_minutes: v }) }); this.syncInterval = v; toast('间隔已更新', 'success') } catch (e: unknown) { toast((e as Error).message, 'error') }
  }

  async saveMail() {
    const url = (this.querySelector('#mail-url') as HTMLInputElement)?.value.trim()
    const domain = (this.querySelector('#mail-domain') as HTMLInputElement)?.value.trim()
    const password = (this.querySelector('#mail-pw') as HTMLInputElement)?.value.trim()
    try {
      const r = await api<{ enabled: boolean }>('/settings/mail', { method: 'PUT', body: JSON.stringify({ url, domain, password }) })
      this.mail = { enabled: r.enabled, url, domain, password }
      this.mailEditing = false
      toast(r.enabled ? '已启用自动注册' : '已保存（未完整配置）', r.enabled ? 'success' : 'info')
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
      toast('已保存', 'success')
    } catch (e: unknown) { toast((e as Error).message, 'error') }
  }

  async createToken() {
    const name = (this.querySelector('#tn') as HTMLInputElement)?.value.trim()
    if (!name) return toast('请输入名称', 'error')
    try { await api('/tokens', { method: 'POST', body: JSON.stringify({ name }) }); toast('已创建', 'success'); this.showNewToken = false; this.load() } catch (e: unknown) { toast((e as Error).message, 'error') }
  }

  async deleteToken(id: number) {
    if (!confirm('删除后 Token 立即失效，确定？')) return
    try { await api(`/tokens/${id}`, { method: 'DELETE' }); toast('已删除', 'success'); this.load() } catch (e: unknown) { toast((e as Error).message, 'error') }
  }

  render() {
    return html`
      <div class="space-y-5">
        <h2 class="text-base font-semibold text-t1">设置</h2>

        <div class="card p-4">
          <div class="text-sm font-medium text-t1 mb-1">同步间隔</div>
          <p class="text-xs text-t3 mb-3">Cron 每分钟检查，达到间隔后自动同步 Key 额度</p>
          <select class="select" @change=${this.saveSyncInterval}>
            ${INTERVAL_OPTIONS.map(v => html`
              <option value=${v} ?selected=${this.syncInterval === v}>${INTERVAL_LABELS[v]}</option>
            `)}
          </select>
        </div>

        <div class="card p-4">
          <div class="flex items-center justify-between mb-1">
            <div class="text-sm font-medium text-t1">自动注册</div>
            <span class="badge ${this.mail.enabled ? 'badge-success' : 'badge-muted'}">${this.mail.enabled ? '已启用' : '未配置'}</span>
          </div>
          <p class="text-xs text-t3 mb-3">配置临时邮箱服务后可自动注册 TinyPNG 账号获取 Key</p>
          ${this.mailEditing ? html`
            <div class="space-y-2 mb-3">
              <input id="mail-url" class="input w-full" placeholder="临时邮箱 API 地址" .value=${this.mail.url} />
              <input id="mail-domain" class="input w-full" placeholder="邮箱域名" .value=${this.mail.domain} />
              <input id="mail-pw" type="password" class="input w-full" placeholder="Admin 密码" .value=${this.mail.password} />
            </div>
            <div class="flex gap-2">
              <button class="btn btn-primary btn-sm" @click=${() => this.saveMail()}>保存</button>
              <button class="btn btn-ghost btn-sm" @click=${() => this.mailEditing = false}>取消</button>
            </div>
          ` : html`
            <button class="btn btn-ghost btn-sm" @click=${() => this.mailEditing = true}>配置</button>
          `}
        </div>

        <div class="card p-4">
          <div class="flex items-center justify-between mb-1">
            <div class="text-sm font-medium text-t1">自动补充</div>
            <span class="badge ${this.autoReplenish.enabled ? 'badge-success' : 'badge-muted'}">${this.autoReplenish.enabled ? '已启用' : '未启用'}</span>
          </div>
          <p class="text-xs text-t3 mb-3">当健康 Key 不足时，Cron 自动注册新 Key（每次 1 个）</p>
          ${this.arEditing ? html`
            <div class="space-y-2 mb-3">
              <label class="flex items-center gap-2 text-xs text-t2">
                <input id="ar-enabled" type="checkbox" .checked=${this.autoReplenish.enabled} /> 启用自动补充
              </label>
              <div>
                <label class="block text-xs text-t3 mb-1">最少健康 Key 数量</label>
                <input id="ar-min-keys" type="number" class="input w-full" min="1" max="50" .value=${String(this.autoReplenish.min_healthy_keys)} />
              </div>
              <div>
                <label class="block text-xs text-t3 mb-1">剩余额度阈值（低于此值视为不健康）</label>
                <input id="ar-threshold" type="number" class="input w-full" min="1" max="500" .value=${String(this.autoReplenish.remaining_threshold)} />
              </div>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-primary btn-sm" @click=${() => this.saveAutoReplenish()}>保存</button>
              <button class="btn btn-ghost btn-sm" @click=${() => this.arEditing = false}>取消</button>
            </div>
          ` : html`
            <button class="btn btn-ghost btn-sm" @click=${() => this.arEditing = true}>配置</button>
          `}
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium text-t1">API Token</div>
              <p class="text-xs text-t3 mt-0.5">用于 GET /pick</p>
            </div>
            <button class="btn btn-primary btn-sm" @click=${() => this.showNewToken = true}>+ 新建</button>
          </div>
          <div class="card overflow-hidden">
            <table>
              <thead><tr><th>名称</th><th>Token</th><th>创建时间</th><th>操作</th></tr></thead>
              <tbody>
                ${!this.tokens.length ? html`<tr><td colspan="4" class="text-center text-t3 py-8">暂无 Token</td></tr>` : this.tokens.map(t => html`
                  <tr>
                    <td class="text-sm text-t1">${t.name}</td>
                    <td><code class="font-mono text-xs text-ac cursor-pointer" title=${t.token} @click=${async () => { try { await navigator.clipboard.writeText(t.token); toast('已复制', 'success') } catch { toast('复制失败', 'error') } }}>${t.token.slice(0, 16)}...</code></td>
                    <td class="text-xs">${t.created_at}</td>
                    <td><button class="btn btn-danger btn-sm" @click=${() => this.deleteToken(t.id)}>删除</button></td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      ${this.showNewToken ? html`
        <div class="modal-backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget) this.showNewToken = false }}>
          <div class="modal-box">
            <h3 class="text-base font-semibold text-t1 mb-4">新建 API Token</h3>
            <label class="block text-xs text-t3 mb-1">名称</label>
            <input id="tn" class="input w-full mb-4" placeholder="例如：博客、脚本" />
            <div class="flex justify-end gap-2">
              <button class="btn btn-ghost" @click=${() => this.showNewToken = false}>取消</button>
              <button class="btn btn-primary" @click=${() => this.createToken()}>创建</button>
            </div>
          </div>
        </div>
      ` : nothing}
    `
  }
}
