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

async function getAccessToken(env: GmailEnv): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
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
