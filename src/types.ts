export type Env = {
  DB: D1Database
  ASSETS: Fetcher
  // Google Calendar secrets — set via `wrangler secret put`
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_REFRESH_TOKEN?: string
  GOOGLE_CALENDAR_ID?: string
  // Gmail secrets — same client ID/secret, separate refresh token (gmail.readonly scope)
  GMAIL_REFRESH_TOKEN?: string
}
