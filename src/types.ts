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
  // Optional separate token with gmail.send scope. Falls back to GMAIL_REFRESH_TOKEN
  // when that token was granted both scopes.
  GMAIL_SEND_REFRESH_TOKEN?: string
  // Where reminder emails go (defaults to the authenticated Gmail account)
  NOTIFY_EMAIL?: string
  // Anthropic API key — used to draft application answers. Without it the
  // prep step falls back to profile-matching heuristics.
  ANTHROPIC_API_KEY?: string
}
