// Gmail API helper for Cloudflare Workers.
// Uses a refresh token (Worker secret) with gmail.readonly scope.
// Reuses the same Google OAuth client as Calendar.
//
// Required secrets:
//   GOOGLE_CLIENT_ID        (same as Calendar)
//   GOOGLE_CLIENT_SECRET    (same as Calendar)
//   GMAIL_REFRESH_TOKEN     (separate token — needs gmail.readonly scope)

export interface GmailEnv {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GMAIL_REFRESH_TOKEN: string
}

export interface GmailSendEnv {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  // Either a dedicated send-scoped token, or one token granted both scopes.
  GMAIL_SEND_REFRESH_TOKEN?: string
  GMAIL_REFRESH_TOKEN?: string
  NOTIFY_EMAIL?: string
}

async function getAccessToken(env: GmailEnv, refreshToken?: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken ?? env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Gmail token refresh failed: ${await res.text()}`)
  const json = await res.json<{ access_token: string }>()
  return json.access_token
}

interface GmailMessage {
  id: string
  threadId: string
}

interface GmailMessageDetail {
  id: string
  threadId: string
  payload: {
    headers: Array<{ name: string; value: string }>
    body?: { data?: string }
    parts?: Array<{
      mimeType: string
      body?: { data?: string }
      parts?: Array<{ mimeType: string; body?: { data?: string } }>
    }>
  }
  internalDate: string
}

export function decodeBase64(str: string): string {
  // Gmail uses URL-safe base64
  const standard = str.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeURIComponent(
      atob(standard)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
  } catch {
    return atob(standard)
  }
}

export function extractPlainText(payload: GmailMessageDetail['payload']): string {
  // Simple single-part message
  if (payload.body?.data) return decodeBase64(payload.body.data)

  // Multipart — find text/plain recursively
  function findPart(parts: typeof payload.parts): string {
    if (!parts) return ''
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data)
      }
      if (part.parts) {
        const nested = findPart(part.parts)
        if (nested) return nested
      }
    }
    return ''
  }

  return findPart(payload.parts)
}

function getHeader(detail: GmailMessageDetail, name: string): string {
  return (
    detail.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  )
}

export interface SentEmail {
  messageId: string
  date: string
  subject: string
  to: string
  body: string
}

export async function getSentEmailsForAddresses(
  env: GmailEnv,
  emailAddresses: string[],
): Promise<Map<string, SentEmail>> {
  const token = await getAccessToken(env)

  // Search sent folder for any of the target emails
  const query = `in:sent to:(${emailAddresses.join(' OR ')})`
  const searchRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?` +
      new URLSearchParams({ q: query, maxResults: '100' }),
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!searchRes.ok) throw new Error(`Gmail search failed: ${await searchRes.text()}`)

  const { messages = [] } = await searchRes.json<{ messages?: GmailMessage[] }>()
  if (messages.length === 0) return new Map()

  // Fetch each message in full (body needed for diff)
  const details = await Promise.all(
    messages.map(async (m) => {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      return r.json<GmailMessageDetail>()
    }),
  )

  // Group by To address — keep most recent per address
  const byAddress = new Map<string, SentEmail>()

  for (const detail of details) {
    const to = getHeader(detail, 'to').toLowerCase().trim()
    const subject = getHeader(detail, 'subject')
    const date = new Date(parseInt(detail.internalDate)).toISOString()
    const body = extractPlainText(detail.payload)

    // Match against our target list (To header may have display name + angle brackets)
    for (const addr of emailAddresses) {
      if (to.includes(addr.toLowerCase())) {
        const existing = byAddress.get(addr)
        if (!existing || date > existing.date) {
          byAddress.set(addr, { messageId: detail.id, date, subject, to: addr, body })
        }
        break
      }
    }
  }

  return byAddress
}

export function gmailConfigured(env: Partial<GmailEnv>): env is GmailEnv {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN)
}

// ── Sending ───────────────────────────────────────────────────────────────────

/** URL-safe base64 of a UTF-8 string, as the Gmail send endpoint expects. */
function encodeMessage(raw: string): string {
  const bytes = new TextEncoder().encode(raw)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function encodeHeader(value: string): string {
  // RFC 2047 for non-ASCII subjects (em dashes show up in these a lot).
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${encodeMessage(value).replace(/-/g, '+').replace(/_/g, '/')}?=`
}

export interface OutgoingEmail {
  to: string
  subject: string
  body: string
}

export async function sendEmail(env: GmailSendEnv, email: OutgoingEmail): Promise<string> {
  const refreshToken = env.GMAIL_SEND_REFRESH_TOKEN ?? env.GMAIL_REFRESH_TOKEN
  if (!refreshToken) throw new Error('Gmail send not configured')

  const token = await getAccessToken(env as GmailEnv, refreshToken)

  const raw = [
    `To: ${email.to}`,
    `Subject: ${encodeHeader(email.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    email.body,
  ].join('\r\n')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodeMessage(raw) }),
  })

  if (!res.ok) throw new Error(`Gmail send failed: ${await res.text()}`)
  const json = await res.json<{ id: string }>()
  return json.id
}

export function gmailSendConfigured(env: Partial<GmailSendEnv>): env is GmailSendEnv {
  return !!(
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    (env.GMAIL_SEND_REFRESH_TOKEN || env.GMAIL_REFRESH_TOKEN) &&
    env.NOTIFY_EMAIL
  )
}
