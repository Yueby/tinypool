CREATE TABLE IF NOT EXISTS tinypng_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  email TEXT,
  monthly_usage INTEGER DEFAULT 0,
  monthly_limit INTEGER DEFAULT 500,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'exhausted', 'disabled', 'invalid')),
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT,
  last_checked_at TEXT
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tinypng_key_id INTEGER NOT NULL,
  api_token_id INTEGER,
  timestamp TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tinypng_key_id) REFERENCES tinypng_keys(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_keys_status ON tinypng_keys(status, monthly_usage);
CREATE INDEX IF NOT EXISTS idx_logs_key ON usage_logs(tinypng_key_id);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON usage_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_token ON usage_logs(api_token_id);
