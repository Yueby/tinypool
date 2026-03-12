import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api, store } from '../lib/api'
import { toast } from '../lib/toast'

@customElement('tp-login')
export class TpLogin extends LitElement {
  protected createRenderRoot(): HTMLElement { return this }

  @state() loading = false

  async handleSubmit(e: Event) {
    e.preventDefault()
    const pw = (this.querySelector('#pw') as HTMLInputElement).value
    if (!pw) return
    this.loading = true
    try {
      const data = await api<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password: pw }),
      })
      store.login(data.token)
      toast('登录成功', 'success')
    } catch (err: any) {
      toast(err.message || '登录失败', 'error')
    } finally {
      this.loading = false
    }
  }

  render() {
    return html`
      <div class="flex items-center justify-center min-h-screen px-4">
        <div class="w-full max-w-xs">
          <div class="text-center mb-6">
            <h1 class="text-xl font-bold text-t1 tracking-tight">🐼 <span class="text-ac">Tiny</span>Pool</h1>
            <p class="text-t3 text-xs mt-1">API Key 池管理</p>
          </div>
          <form class="card p-6" @submit=${this.handleSubmit}>
            <label class="block text-xs text-t3 font-medium mb-1.5">管理密码</label>
            <input type="password" id="pw" class="input w-full mb-4" placeholder="输入密码" ?disabled=${this.loading} required />
            <button type="submit" class="btn btn-primary w-full" ?disabled=${this.loading}>
              ${this.loading ? '验证中...' : '登录'}
            </button>
          </form>
        </div>
      </div>
    `
  }
}
