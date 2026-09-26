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

import { automationVerdict, type AutomationVerdict } from '../../shared/bulkMail'
import type { Binding, MatchableGig, ReplyMessage } from '../../shared/replyMatch'
import { significantWords, initialisms, isMatchableGig } from '../../shared/replyMatch'
import { decodeBase64, extractPlainText, type GmailEnv } from './gmail'

/** Gmail rejects very long queries; several short ones cost one request each. */
const MAX_QUERY_CHARS = 1400

/** Never look further back than this, whatever the pipeline says. */
export const MAX_WINDOW_DAYS = 1095
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

/**
 * The terms that would find mail about this gig, as Gmail search syntax.
 *
 * This used to add the single longest word of the name as a bare term, so
 * *Sofar Sounds Winnipeg* asked Gmail for every message containing "winnipeg"
 * — which, for somebody who lives in Winnipeg, is most of their mail. The same
 * word then scored a match on its own. See `docs/reply-matching-precision.md`.
 *
 * A **conjunction** replaces it: two significant words that must both appear.
 * "winnipeg sounds" is a vanishingly different question from "winnipeg", and
 * it still finds a reply that says *"thanks for applying to Sofar Sounds"*
 * without ever naming the gig exactly, which is why the quoted full name
 * cannot be the only term.
 *
 * One bare word survives, and only where it is the whole name: "JIMWEEK" is
 * findable by nothing else, and a name that reduces to one common word is
 * better served by its domain and by a confirmed binding than by searching for
 * it.
 */
export function gigTerms(gig: { name: string }): string[] {
  const sig = significantWords(gig.name)
  const terms: string[] = []

  if (sig.length >= 2) terms.push(`"${gig.name.replace(/"/g, '')}"`)

  // Longest first, because until rarity is measured length is the only proxy
  // available — but two of them, so neither has to carry the query alone.
  const ranked = [...sig].sort((a, b) => b.length - a.length)
  const pair = ranked.filter((w) => w.length >= 4).slice(0, 2)
  if (pair.length === 2) terms.push(`(${pair.join(' ')})`)

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

  /**
   * Two kinds of term, searched over two different parts of the mailbox.
   *
   * **Precise** terms — the full name in quotes, an abbreviation, an address
   * already known to write about a gig — identify a message nearly on their
   * own. Those are searched with `in:anywhere`, because a rejection auto-filed
   * as spam is exactly the silence this phase exists to end, and a message
   * carrying the festival's whole name is worth digging out of the spam folder.
   *
   * **Loose** terms — a conjunction of two words from the name — are a good
   * net and a bad filter. Searching spam with those is what filled the queue
   * with everything a person in Winnipeg receives, so they are asked only of
   * `category:primary`, where Gmail's own classifier has already set aside
   * promotions, social and updates.
   *
   * That split keeps the property the old query had, and drops the one nobody
   * wanted. See `docs/reply-matching-precision.md`.
   */
  const precise = new Set<string>()
  const loose = new Set<string>()

  for (const g of gigs) {
    for (const t of gigTerms(g)) {
      // A conjunction is the only loose shape this produces; a quoted name and
      // an abbreviation are both precise.
      if (t.startsWith('(')) loose.add(t)
      else precise.add(t)
    }
  }
  for (const b of input.bindings ?? []) {
    if (b.kind === 'address') precise.add(`from:${b.value}`)
  }

  const window = `newer_than:${windowDays}d`
  const PRECISE_PREFIX = `in:anywhere -in:sent -in:draft ${window} `
  const LOOSE_PREFIX = `category:primary -in:spam -in:trash -in:sent -in:draft ${window} `

  const queries: string[] = []

  const batchInto = (prefix: string, terms: Set<string>) => {
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
  }

  batchInto(PRECISE_PREFIX, precise)
  batchInto(LOOSE_PREFIX, loose)

  return { queries, windowDays, oldestSubmission, gigCount: gigs.length }
}

// ── Fetching ──────────────────────────────────────────────────────────────────

interface GmailListed {
  id: string
  threadId: string
}

export async function accessToken(env: GmailEnv, fetchImpl: typeof fetch = fetch): Promise<string> {
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
  /**
   * What the headers say about whether a person wrote this. See
   * `shared/bulkMail.ts` — `automated` is excluded before scoring, `bulk` is
   * kept and weighed, because a festival that mails through a platform is
   * still a festival.
   */
  /** The full verdict, reasons included — the tier alone is what scoring reads. */
  automationVerdict: AutomationVerdict
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
      const verdict = automationVerdict(
        Object.fromEntries(headers.map((h) => [h.name.toLowerCase(), h.value])),
      )
      return {
        messageId: d.id,
        threadId: d.threadId,
        from: address,
        fromName: name,
        subject: header('subject'),
        body: extractPlainText(d.payload),
        receivedAt: new Date(Number(d.internalDate)).toISOString(),
        inSpam: (d.labelIds ?? []).includes('SPAM'),
        automationVerdict: verdict,
        automation: verdict.tier,
        snippet: d.snippet ?? '',
      }
    })
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
}

export { decodeBase64 }

/**
 * The threads the artist has written in, inside the scan's window.
 *
 * The strongest signal available for "is this a reply to something I actually
 * sent" is `In-Reply-To` matched against your own `Message-ID`s (RFC 5322
 * §3.6.4) — and Gmail answers the same question more cheaply, because it has
 * already done the threading. One search of Sent mail gives the thread ids;
 * an inbound message in one of them is part of a conversation you took part in.
 *
 * What it is worth is limited and worth being precise about. **It says nothing
 * about which application a message concerns**, so it corroborates rather than
 * identifies, and `scoreGig` only counts it where something else already
 * pointed at a gig. It is also silent for the common case: most applications
 * begin at a web form, so the receipt arrives in a thread of its own and this
 * returns nothing. That makes it a large positive where it fires and never a
 * filter — a message not in one of these threads is not thereby suspicious.
 */
export async function sentThreadIds(
  env: GmailEnv,
  windowDays: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Set<string>> {
  const out = new Set<string>()
  try {
    const token = await accessToken(env, fetchImpl)
    const params = new URLSearchParams({
      q: `in:sent newer_than:${windowDays}d`,
      maxResults: '200',
    })
    const res = await fetchImpl(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return out
    const { messages = [] } = await res.json<{ messages?: Array<{ threadId: string }> }>()
    for (const m of messages) out.add(m.threadId)
  } catch (err) {
    // Precision, not correctness: without this the matcher scores as it did
    // before the signal existed.
    console.error('sent thread lookup failed:', err)
  }
  return out
}
