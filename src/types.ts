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
  // Cloudflare Email Service binding — see [[send_email]] in wrangler.toml.
  // Optional so the Worker still boots (and every other route works) on a
  // deploy where the binding has not been added yet.
  EMAIL?: SendEmailBinding
  // Public origin, used to build links in the digest email.
  DASHBOARD_URL?: string
}

/**
 * The subset of Cloudflare's Email Sending binding this app uses.
 * Declared here rather than imported so the types do not depend on the
 * binding being present in every environment.
 */
export interface SendEmailBinding {
  send(message: {
    from: string
    to: string
    subject: string
    text?: string
    html?: string
  }): Promise<{ messageId?: string }>
}
