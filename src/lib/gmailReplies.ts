/**
 * Finding the organiser's answer in the mailbox.
 *
 * The scan is built from the pipeline rather than from the calendar: it asks
 * Gmail for the names of the applications still in play, plus the addresses
 * already known to write about them. That matters twice over — it keeps the
 * work proportional to the number of open applications instead of the size of
 * the mailbox, and it means **how far back it looks is derived, not fixed**:
 * back to just before the oldest application still waiting, and no further.
 *
 * Gmail itself imposes no limit. A `gmail.readonly` token can search the whole
 * account, and this one's archive begins in June 2021. Reading all of it every
 * time would be waste, not diligence, so the window is the honest minimum.
 *
 * Spam and trash are included on purpose. A rejection auto-filed as spam is
 * exactly the silence phase 4 exists to break — and the row records that it
 * was found there, so nothing pretends it arrived normally.
 */

import type { Binding, MatchableGig, ReplyMessage } from '../../shared/replyMatch'
import { significantWords, initialisms, isMatchableGig } from '../../shared/replyMatch'
import { decodeBase64, extractPlainText, type GmailEnv } from './gmail'

/** Gmail rejects very long queries; several short ones cost one request each. */
const MAX_QUERY_CHARS = 1400

/** Never look further back than this, whatever the pipeline says. */
const MAX_WINDOW_DAYS = 1095
/** Nor less far — an application submitted this morning still wants a window. */
const MIN_WINDOW_DAYS = 30
/** Slack either side of the oldest submission, for a clock that disagrees. */
const WINDOW_SLACK_DAYS = 14

/** Bounded so one scan cannot spend a minute of Worker time. */
const MAX_MESSAGES = 60

export interface ReplyScanPlan {
  /** One Gmail query per chunk; the union of their results is the scan. */
  queries: string[]
  /** How many days back the scan reaches, and why. */
  windowDays: number
  /** The oldest submission the window was derived from, if there was one. */
  oldestSubmission: string | null
  /** Gigs the scan covers. */
  gigCount: number
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso)
  const b = Date.parse(toIso)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.ceil((b - a) / 86_400_000)
}

/** The terms that would find mail about this gig, as Gmail search syntax. */
export function gigTerms(gig: { name: string }): string[] {
  const sig = significantWords(gig.name)
  const terms: string[] = []
  if (sig.length >= 2) terms.push(`"${gig.name.replace(/"/g, '')}"`)
  const distinctive = sig.filter((w) => w.length >= 5).sort((a, b) => b.length - a.length)[0]
  if (distinctive) terms.push(distinctive)
  for (const a of initialisms(gig.name)) terms.push(a)
  // A one-word name with no long word left — "JIMWEEK" survives this, "Folk"
  // would not, and searching for "folk" alone is searching for nothing.
  if (terms.length === 0 && sig.length === 1 && sig[0].length >= 4) terms.push(sig[0])
  return terms
}

/**
 * What to ask Gmail, and how far back.
 *
 * Pure and exported so the window can be asserted rather than described: the
 * question "how far back does this look?" has an answer that changes with the
 * data, and a comment would go stale the first time an application aged.
 */
export function planReplyScan(input: {
  gigs: MatchableGig[]
  bindings?: Binding[]
  today: string
  /** Overrides the derived window, in days. */
  windowDays?: number
}): ReplyScanPlan {
  const gigs = input.gigs.filter(isMatchableGig)
  const submissions = gigs
    .map((g) => g.submittedAt)
    .filter((d): d is string => !!d)
    .sort()
  const oldestSubmission = submissions[0] ?? null

  const derived = oldestSubmission
    ? daysBetween(oldestSubmission, input.today) + WINDOW_SLACK_DAYS
    : MIN_WINDOW_DAYS
  const windowDays = Math.min(
    MAX_WINDOW_DAYS,
    Math.max(MIN_WINDOW_DAYS, input.windowDays ?? derived),
  )

  const terms = new Set<string>()
  for (const g of gigs) for (const t of gigTerms(g)) terms.add(t)
  for (const b of input.bindings ?? []) {
    if (b.kind === 'address') terms.add(`from:${b.value}`)
  }

  // `in:anywhere` reaches spam and trash; `-in:sent -in:draft` keeps your own
  // outbound mail out, which the sync reconciler already reads separately.
  const prefix = `in:anywhere -in:sent -in:draft newer_than:${windowDays}d `
  const queries: string[] = []
  let batch: string[] = []

  const flush = () => {
    if (batch.length) queries.push(`${prefix}{${batch.join(' ')}}`)
    batch = []
  }
  for (const term of terms) {
    const next = [...batch, term].join(' ')
    if (prefix.length + next.length + 2 > MAX_QUERY_CHARS) flush()
    batch.push(term)
  }
  flush()

  return { queries, windowDays, oldestSubmission, gigCount: gigs.length }
}

// ── Fetching ──────────────────────────────────────────────────────────────────

interface GmailListed {
  id: string
  threadId: string
}

async function accessToken(env: GmailEnv, fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
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
  return (await res.json<{ access_token: string }>()).access_token
}

/** `Jane Ireland <jane@example.com>` → both halves, address lower-cased. */
export function parseFrom(header: string): { address: string; name: string | null } {
  const angled = header.match(/<([^>]+)>/)
  if (angled) {
    const name = header.slice(0, angled.index).trim().replace(/^"|"$/g, '')
    return { address: angled[1].trim().toLowerCase(), name: name || null }
  }
  return { address: header.trim().toLowerCase(), name: null }
}

export interface FetchedReply extends ReplyMessage {
  /** Gmail had filed it as spam. Said rather than hidden. */
  inSpam: boolean
  snippet: string
}

export async function fetchReplies(
  env: GmailEnv,
  plan: ReplyScanPlan,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchedReply[]> {
  if (plan.queries.length === 0) return []
  const token = await accessToken(env, fetchImpl)
  const auth = { Authorization: `Bearer ${token}` }

  const seen = new Map<string, GmailListed>()
  for (const q of plan.queries) {
    if (seen.size >= MAX_MESSAGES) break
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({ q, maxResults: '50' })
      if (pageToken) params.set('pageToken', pageToken)
      const res = await fetchImpl(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
        { headers: auth },
      )
      if (!res.ok) throw new Error(`Gmail search failed: ${await res.text()}`)
      const page = await res.json<{ messages?: GmailListed[]; nextPageToken?: string }>()
      for (const m of page.messages ?? []) if (!seen.has(m.id)) seen.set(m.id, m)
      pageToken = page.nextPageToken
    } while (pageToken && seen.size < MAX_MESSAGES)
  }

  const ids = [...seen.keys()].slice(0, MAX_MESSAGES)
  const details = await Promise.all(
    ids.map(async (id) => {
      const r = await fetchImpl(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: auth },
      )
      if (!r.ok) return null
      return r.json<{
        id: string
        threadId: string
        internalDate: string
        snippet?: string
        labelIds?: string[]
        payload: Parameters<typeof extractPlainText>[0]
      }>()
    }),
  )

  return details
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .map((d) => {
      const headers = d.payload.headers ?? []
      const header = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
      const { address, name } = parseFrom(header('from'))
      return {
        messageId: d.id,
        threadId: d.threadId,
        from: address,
        fromName: name,
        subject: header('subject'),
        body: extractPlainText(d.payload),
        receivedAt: new Date(Number(d.internalDate)).toISOString(),
        inSpam: (d.labelIds ?? []).includes('SPAM'),
        snippet: d.snippet ?? '',
      }
    })
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
}

export { decodeBase64 }
