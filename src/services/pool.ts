import type { TinyPngKeyRow } from '../types'

export class KeyPool {
  constructor(private db: D1Database) {}

  async pick(): Promise<TinyPngKeyRow | null> {
    const key = await this.db
      .prepare(
        `SELECT * FROM tinypng_keys
         WHERE status = 'active' AND monthly_usage < monthly_limit
         ORDER BY (monthly_limit - monthly_usage) DESC
         LIMIT 1`
      )
      .first<TinyPngKeyRow>()

    if (!key) return null

    await this.db.prepare("UPDATE tinypng_keys SET last_used_at = datetime('now') WHERE id = ?").bind(key.id).run()

    return key
  }

  async validateKey(apiKey: string): Promise<{ valid: boolean; compressionCount: number | null }> {
    try {
      const res = await fetch('https://api.tinify.com/shrink', {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`api:${apiKey}`)}` },
      })
      const count = res.headers.get('Compression-Count')
      const parsed = count ? parseInt(count, 10) : NaN
      return { valid: res.status !== 401, compressionCount: Number.isFinite(parsed) ? parsed : null }
    } catch {
      return { valid: false, compressionCount: null }
    }
  }

  async shouldSync(): Promise<boolean> {
    try {
      await this.ensureSettingsTable()

      const row = await this.db
        .prepare("SELECT value FROM settings WHERE key = 'sync_interval_minutes'")
        .first<{ value: string }>()
      const interval = row ? parseInt(row.value, 10) : 360

      const lastSync = await this.db
        .prepare("SELECT value FROM settings WHERE key = 'last_sync_at'")
        .first<{ value: string }>()

      if (!lastSync) return true

      const elapsed = (Date.now() - new Date(lastSync.value).getTime()) / 60000
      return elapsed >= interval
    } catch {
      return true
    }
  }

  async syncAllKeys(): Promise<{ checked: number; updated: number; invalid: number }> {
    const keys = await this.db
      .prepare("SELECT * FROM tinypng_keys WHERE status != 'disabled'")
      .all<TinyPngKeyRow>()

    let checked = 0, updated = 0, invalid = 0

    for (const key of keys.results) {
      checked++
      const result = await this.validateKey(key.key)

      if (!result.valid) {
        await this.db
          .prepare("UPDATE tinypng_keys SET status = 'invalid', last_checked_at = datetime('now') WHERE id = ?")
          .bind(key.id).run()
        invalid++
        continue
      }

      if (result.compressionCount !== null && result.compressionCount !== key.monthly_usage) {
        const newStatus = result.compressionCount >= key.monthly_limit ? 'exhausted' : 'active'
        await this.db
          .prepare("UPDATE tinypng_keys SET monthly_usage = ?, status = ?, last_checked_at = datetime('now') WHERE id = ? AND status != 'disabled'")
          .bind(result.compressionCount, newStatus, key.id).run()
        updated++
      } else {
        await this.db
          .prepare("UPDATE tinypng_keys SET last_checked_at = datetime('now') WHERE id = ?")
          .bind(key.id).run()
      }
    }

    try {
      await this.ensureSettingsTable()
      await this.db
        .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync_at', ?)")
        .bind(new Date().toISOString()).run()
    } catch (e) {
      console.error('[Pool] Failed to update last_sync_at:', e)
    }

    return { checked, updated, invalid }
  }

  async resetIfNewMonth(): Promise<void> {
    const now = new Date()
    const firstOfMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01T00:00:00`

    await this.db
      .prepare(
        `UPDATE tinypng_keys
         SET monthly_usage = 0,
             status = CASE WHEN status = 'exhausted' THEN 'active' ELSE status END
         WHERE last_checked_at < ? OR last_checked_at IS NULL`
      )
      .bind(firstOfMonth).run()
  }

  private async ensureSettingsTable(): Promise<void> {
    await this.db
      .prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
      .run()
  }
}
