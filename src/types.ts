export type Bindings = {
  DB: D1Database
  ADMIN_PASSWORD: string
  JWT_SECRET: string
}

export type Variables = {
  adminAuth: boolean
  apiTokenId: number
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}

export interface TinyPngKeyRow {
  id: number
  key: string
  email: string | null
  monthly_usage: number
  monthly_limit: number
  status: string
  created_at: string
  last_used_at: string | null
  last_checked_at: string | null
}
