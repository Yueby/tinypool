import { Chart, registerables } from 'chart.js'
import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../lib/api'

Chart.register(...registerables)

interface Stats {
  total_keys: number; active_keys: number; exhausted_keys: number
  disabled_keys: number; invalid_keys: number
  total_usage_this_month: number; total_capacity: number; remaining: number
  total_picks: number; picks_today: number
}
interface DayData { date: string; count: number }
interface TokenItem { id: number; name: string }

function ma(arr: number[], w: number) {
  return arr.map((_, i) => {
    const s = arr.slice(Math.max(0, i - w + 1), i + 1)
    return +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1)
  })
}

@customElement('tp-dashboard')
export class TpDashboard extends LitElement {
  protected createRenderRoot(): HTMLElement { return this }

  @state() stats: Stats | null = null
  @state() daily: DayData[] = []
  @state() days = 30
  @state() tokens: TokenItem[] = []
  @state() selectedTokenId: number | null = null
  private chart: Chart | null = null
  private refreshTimer: ReturnType<typeof setInterval> | null = null

  connectedCallback() { super.connectedCallback(); this.load(); this.refreshTimer = setInterval(() => this.load(), 30000) }
  disconnectedCallback() { super.disconnectedCallback(); this.chart?.destroy(); this.chart = null; if (this.refreshTimer) clearInterval(this.refreshTimer) }

  async load() {
    try {
      const tokenParam = this.selectedTokenId != null ? `&token_id=${this.selectedTokenId}` : ''
      const [s, u, t] = await Promise.all([
        api<Stats>(`/stats?_=${Date.now()}${tokenParam}`),
        api<{ daily: DayData[] }>(`/stats/usage/daily?days=${this.days}${tokenParam}`),
        api<{ tokens: TokenItem[] }>('/tokens'),
      ])
      this.stats = s
      this.daily = u.daily
      this.tokens = t.tokens
      await this.updateComplete
      this.renderChart()
    } catch (e: unknown) { console.error('[Dashboard]', e) }
  }

  private renderChart() {
    const canvas = this.querySelector('#chart') as HTMLCanvasElement | null
    if (!canvas || !this.daily.length) return
    const counts = this.daily.map(r => r.count)
    const labels = this.daily.map(r => r.date.slice(5))
    const isDark = document.documentElement.classList.contains('dark')
    const grid = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
    const tick = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)'
    const bar = isDark ? 'rgba(52,211,153,0.4)' : 'rgba(16,185,129,0.35)'
    const barBd = isDark ? 'rgba(52,211,153,0.6)' : 'rgba(16,185,129,0.6)'
    const line = isDark ? 'rgba(251,191,36,0.7)' : 'rgba(245,158,11,0.7)'

    if (this.chart) this.chart.destroy()
    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { type: 'bar', label: '每日', data: counts, backgroundColor: bar, borderColor: barBd, borderWidth: 1, borderRadius: 2, order: 2 },
          { type: 'line', label: '7日均线', data: ma(counts, 7), borderColor: line, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, borderDash: [4, 3], tension: 0.4, order: 1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: tick, usePointStyle: true, pointStyle: 'line', font: { size: 10 }, padding: 12 } },
          tooltip: { callbacks: { title: ctx => this.daily[ctx[0].dataIndex]?.date || '' } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: tick, maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { size: 10 } } },
          y: { beginAtZero: true, grid: { color: grid }, ticks: { color: tick, precision: 0, font: { size: 10 } } },
        },
      },
    })
  }

  render() {
    if (!this.stats) return html`<div class="text-t3 text-sm">加载中...</div>`
    const s = this.stats
    const pct = s.total_capacity > 0 ? Math.round(s.total_usage_this_month / s.total_capacity * 100) : 0
    const barC = pct > 80 ? 'bg-err' : pct > 50 ? 'bg-warn' : 'bg-ok'
    const total = this.daily.reduce((a, r) => a + r.count, 0)
    const avg = this.daily.length ? (total / this.daily.length).toFixed(1) : '0'

    return html`
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-t1">概览</h2>
          <div class="flex items-center gap-2">
            ${this.tokens.length ? html`
              <select class="select text-xs" @change=${(e: Event) => { const v = (e.target as HTMLSelectElement).value; this.selectedTokenId = v === '' ? null : parseInt(v); this.load() }}>
                <option value="">全部 Token</option>
                ${this.tokens.map(t => html`<option value=${t.id} ?selected=${this.selectedTokenId === t.id}>${t.name}</option>`)}
              </select>
            ` : ''}
            <button class="btn btn-ghost btn-sm" @click=${() => this.load()}>刷新</button>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="card p-3.5">
            <div class="text-xs text-t3 mb-1">可用 Key</div>
            <div class="font-mono text-xl font-semibold tabular-nums"><span class="text-ok">${s.active_keys}</span><span class="text-t3 text-sm font-normal"> / ${s.total_keys}</span></div>
          </div>
          <div class="card p-3.5">
            <div class="text-xs text-t3 mb-1">剩余额度</div>
            <div class="font-mono text-xl font-semibold text-ac tabular-nums">${s.remaining}</div>
          </div>
          <div class="card p-3.5">
            <div class="text-xs text-t3 mb-1">今日用量</div>
            <div class="font-mono text-xl font-semibold text-t1 tabular-nums">${s.picks_today}</div>
          </div>
          <div class="card p-3.5">
            <div class="text-xs text-t3 mb-1">耗尽 / 无效</div>
            <div class="font-mono text-xl tabular-nums"><span class="text-warn font-semibold">${s.exhausted_keys}</span><span class="text-t3 text-sm"> / </span><span class="text-err font-semibold">${s.invalid_keys}</span></div>
          </div>
        </div>

        <div class="card p-3.5">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-t3">本月用量</span>
            <span class="font-mono text-xs text-t2 tabular-nums">${s.total_usage_this_month} / ${s.total_capacity} · ${pct}%</span>
          </div>
          <div class="w-full h-1.5 rounded-full bg-sf2 overflow-hidden">
            <div class="${barC} h-full rounded-full transition-all duration-500" style="width:${Math.min(pct, 100)}%"></div>
          </div>
        </div>

        <div class="card p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-t1">用量趋势</span>
              <span class="text-xs text-t3 font-mono tabular-nums">共${total}次 · 日均${avg}</span>
            </div>
            <select class="select text-xs" @change=${(e: Event) => { this.days = parseInt((e.target as HTMLSelectElement).value); this.load() }}>
              <option value="7" ?selected=${this.days === 7}>7天</option>
              <option value="14" ?selected=${this.days === 14}>14天</option>
              <option value="30" ?selected=${this.days === 30}>30天</option>
              <option value="90" ?selected=${this.days === 90}>90天</option>
            </select>
          </div>
          <div style="position:relative;height:180px"><canvas id="chart"></canvas></div>
        </div>
      </div>
    `
  }
}
