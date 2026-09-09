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
  // Public origin. Used to build links in the digest email, and — since
  // passkey login replaced Cloudflare Access — to derive the WebAuthn relying
  // party. That second use makes it load-bearing rather than cosmetic: the
  // hostname is baked into every credential at registration, so changing it
  // invalidates every passkey already enrolled.
  DASHBOARD_URL?: string
  /**
   * Where a passkey setup code is emailed. The `send_email` allowlist in
   * wrangler.toml is the real boundary; this only chooses among it.
   */
  AUTH_EMAIL?: string
  AUTH_EMAIL_SENDER?: string
  /**
   * The research agents' credential — set with `wrangler secret put`.
   *
   * They POST and PATCH from outside a browser and outside this repo, so they
   * cannot do a passkey ceremony. Until Cloudflare Access was removed they
   * did not need one; now this is the only way in for them, and leaving it
   * unset is the way this change breaks something quietly.
   */
  API_TOKEN?: string
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
