import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { syncTargets } from '../db/schema'
import { scoped, type TenantId } from '../db/scope'
import {
  NO_SITE,
  UNREACHABLE,
  foldFinding,
  readSubmissionPolicy,
  termsDue,
  termsState,
  type PolicyReading,
  type TermsColumns,
} from '../../shared/syncTerms'
import { decodeEntities } from './formParser'
import { recordEvent } from './notificationEvents'
import type { Env } from '../types'

/**
 * Reading a target's own site for its rules about pitches.
 *
 * This is the half of the feature that does not depend on anybody having been
 * diligent. The research agent is told to read a target's submission terms, and
 * an agent that did not is exactly how a "no unsolicited material" page came to
 * be filed as ready to pitch. So the Worker reads the same pages itself: when a
 * target is filed, when its address changes, when the artist presses the
 * button, and once a night for anything nobody has looked at.
 *
 * **The home page is not enough, and the first real target proved it.**
 * `imaginaryfriends.com/` now redirects, on every spelling of its address, to a
 * rebuilt site that says nothing about submissions, while `/about.html` on the
 * old domain, the old site, is still served and says "NO unsolicited material
 * please." Nothing links to it any more. So the read follows the links worth
 * following and also asks for the handful of pages where a policy lives by
 * convention, once per host, whatever the root did. A page that says no is the
 * answer wherever it is. A first version of this skipped hosts whose root
 * redirected away, ran against the real site, and found nothing.
 *
 * **Silence is reported as silence.** Finding nothing writes "no policy found"
 * and a count of pages read, never "OK". A site that could not be opened is a
 * different fact again, and is retried in days rather than recorded as read.
 *
 * It never touches `updated_at`: filling a column from a page is not an edit
 * to the row, and moving the stamp would wake every snooze in the table.
 */

const UA = 'Mozilla/5.0 (compatible; SunDogsMusicScout/1.0; +https://scout.sundogsmusic.ca)'
const TIMEOUT_MS = 6_000
/**
 * What one read may ask a small company's web server for, beyond the starting
 * pages: about what a person would open going through the site once. A page
 * count would not bound this, since a guess that 404s is a request too.
 */
const MAX_FOLLOW_REQUESTS = 22
/** A navigation bar with forty "artist" links is not forty pages worth reading. */
const MAX_LINKS_PER_PAGE = 4
const MAX_BYTES = 1_500_000
const CONCURRENCY = 4

/** Where a policy tends to live on a small company's site, tried once per host. */
export const POLICY_PATHS = [
  '/about',
  '/about.html',
  '/about-us',
  '/contact',
  '/contact.html',
  '/contact-us',
  '/submissions',
  '/submit',
  '/faq',
  // The front page of a site that predates the redirect now sitting on its root.
  '/index.html',
]

/** An address at one of these says nothing about the sender's own website. */
const WEBMAIL =
  /^(?:gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|pm|gmx|mail|zoho|shaw|telus|rogers|bell|sympatico|videotron|mts|hey|fastmail|comcast|verizon|att|sbcglobal)\./i

/** A page's address worth asking for: a plain public web address on the default port. */
export function isFetchable(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  if (url.port) return false
  const host = url.hostname.toLowerCase()
  if (!host.includes('.')) return false
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return false
  return !/(?:^|\.)(?:localhost|local|internal|lan|home|corp)$/.test(host)
}

function emailDomain(email: string | null | undefined): string | null {
  const at = email?.trim().toLowerCase().split('@')
  const domain = at && at.length === 2 ? at[1].replace(/[^a-z0-9.-]/g, '') : ''
  return domain.includes('.') && !WEBMAIL.test(domain) ? domain : null
}

function hostOfWebsite(website: string | null | undefined): string | null {
  const raw = website?.trim()
  if (!raw) return null
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * The places to start reading: each distinct host, on both schemes.
 *
 * Both, because a host can answer differently on them. The target that started
 * this redirects `https` to a new site and still serves its old one over
 * `http`, and the old one is where the refusal was.
 */
export function siteOrigins(row: { website?: string | null; contactEmail?: string | null }): string[] {
  const hosts = [hostOfWebsite(row.website), emailDomain(row.contactEmail)].filter(
    (host, i, all): host is string => host !== null && all.indexOf(host) === i,
  )
  return hosts
    .slice(0, 2)
    .flatMap((host) => [`https://${host}`, `http://${host}`])
    .filter(isFetchable)
}

/** The visible words of a page, one block per line, with markup, scripts and entities gone. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/?(?:p|br|li|ul|ol|div|tr|td|th|table|section|article|header|footer|nav|main|h[1-6]|blockquote|dd|dt)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
}

function registrable(host: string): string {
  return host.toLowerCase().replace(/^www\./, '')
}

function sameSite(a: string, b: string): boolean {
  const x = registrable(a)
  const y = registrable(b)
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`)
}

const SUBMISSION_LINK = /\b(?:submit|submission|submissions|demo|demos|pitch|guidelines|work with us|how to)\b/i
const OTHER_LINK = /\b(?:about|contact|faq|info|licens\w*|artists?)\b/i

/**
 * Links on a page worth following, submission pages before the rest.
 * Same site only: following a link off to a streaming service reads nothing
 * about the company.
 */
export function relevantLinks(html: string, base: string): { submission: string[]; other: string[] } {
  const submission: string[] = []
  const other: string[] = []
  let baseUrl: URL
  try {
    baseUrl = new URL(base)
  } catch {
    return { submission, other }
  }
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  for (const m of html.matchAll(anchor)) {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[1])
    const target = decodeEntities(href?.[1] ?? href?.[2] ?? href?.[3] ?? '').trim()
    if (!target || /^(?:#|mailto:|tel:|javascript:)/i.test(target)) continue
    let url: URL
    try {
      url = new URL(target, baseUrl)
    } catch {
      continue
    }
    if (!isFetchable(url.href) || !sameSite(url.hostname, baseUrl.hostname)) continue
    url.hash = ''
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const haystack = `${text} ${url.pathname}`
    if (SUBMISSION_LINK.test(haystack)) submission.push(url.href)
    else if (OTHER_LINK.test(haystack)) other.push(url.href)
  }
  return { submission, other }
}

function pageKey(raw: string): string {
  try {
    const u = new URL(raw)
    u.hash = ''
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`
  } catch {
    return raw
  }
}

interface Page {
  url: string
  html: string
}

async function getPage(url: string, fetchImpl: typeof fetch): Promise<Page | null> {
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (type && !/html|text/i.test(type)) return null
    const length = Number(res.headers.get('content-length') ?? 0)
    if (length > MAX_BYTES * 2) return null
    const html = (await res.text()).slice(0, MAX_BYTES)
    return { url: res.url || url, html }
  } catch {
    // A timeout, a refused connection and a DNS failure are one answer here:
    // no page. Which one it was changes nothing the artist can do.
    return null
  }
}

async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await work(items[i])
    }
  })
  await Promise.all(runners)
  return out
}

export interface SiteScan {
  closed: (PolicyReading & { url: string }) | null
  open: (PolicyReading & { url: string }) | null
  pagesRead: number
  /** Whether there was any address to read at all. */
  hadSite: boolean
  /** The page the answer came from, or the first one read. */
  url: string | null
  /** What was done, for a row with no verdict to show. */
  note: string
}

/** Read a target's site and report what its pages say about unsolicited pitches. */
export async function scanSite(
  row: { website?: string | null; contactEmail?: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<SiteScan> {
  const origins = siteOrigins(row)
  if (origins.length === 0) {
    return {
      closed: null,
      open: null,
      pagesRead: 0,
      hadSite: false,
      url: null,
      note:
        `${NO_SITE}: none is on file, and ${
          row.contactEmail?.trim() ? 'the contact address is a webmail one' : 'there is no contact address to take one from'
        }. Add their website address to check it.`,
    }
  }

  const seen = new Set<string>()
  const pages: Page[] = []
  const take = (page: Page | null) => {
    if (!page) return
    const key = pageKey(page.url)
    if (seen.has(key)) return
    seen.add(key)
    pages.push(page)
  }

  // The starting pages, together. Several origins are usually one site.
  const roots = await Promise.all(origins.map((origin) => getPage(`${origin}/`, fetchImpl)))
  roots.forEach(take)

  const submission: string[] = []
  const other: string[] = []
  for (const page of pages) {
    const found = relevantLinks(page.html, page.url)
    submission.push(...found.submission)
    other.push(...found.other.slice(0, MAX_LINKS_PER_PAGE))
  }

  // The conventional pages are asked for once per host the artist's own
  // details name, on the first spelling that answered at all.
  //
  // *Whatever the root did.* The target that started this redirects `/` to a
  // rebuilt site on every spelling of its address, and still serves its old
  // static pages, `/about.html` among them, on all of them. A rule that skipped
  // a host whose root redirected away would have skipped exactly that one. A
  // host that did not answer is skipped, since each guess would only cost a
  // timeout; and one scheme is enough, since the two serve the same files.
  const probed = new Set<string>()
  const probeOrigins = origins.filter((origin, i) => {
    const host = new URL(origin).hostname
    if (roots[i] === null || probed.has(host)) return false
    probed.add(host)
    return true
  })
  const conventional = probeOrigins.flatMap((origin) => POLICY_PATHS.map((path) => `${origin}${path}`))

  const queued = new Set<string>(pages.map((p) => pageKey(p.url)))
  const candidates: string[] = []
  // Submission pages first, then the conventional ones, then whatever else the
  // pages linked to: a guess at the page a policy lives on is worth more than
  // the ninth link in somebody's navigation.
  for (const url of [...submission, ...conventional, ...other]) {
    const key = pageKey(url)
    if (queued.has(key)) continue
    queued.add(key)
    candidates.push(url)
  }

  const more = await mapLimit(candidates.slice(0, MAX_FOLLOW_REQUESTS), CONCURRENCY, (url) => getPage(url, fetchImpl))
  more.forEach(take)

  const hosts = [...new Set(pages.map((p) => new URL(p.url).hostname.replace(/^www\./, '')))]
  if (pages.length === 0) {
    const tried = [...new Set(origins.map((o) => new URL(o).hostname))]
    return {
      closed: null,
      open: null,
      pagesRead: 0,
      hadSite: true,
      url: null,
      note: `${UNREACHABLE} ${tried.join(' or ')}. It will be tried again in a few days.`,
    }
  }

  let closed: SiteScan['closed'] = null
  let open: SiteScan['open'] = null
  for (const page of pages) {
    const reading = readSubmissionPolicy(htmlToText(page.html))
    if (reading?.policy === 'closed' && !closed) closed = { ...reading, url: page.url }
    if (reading?.policy === 'open' && !open) open = { ...reading, url: page.url }
  }

  return {
    closed,
    open,
    pagesRead: pages.length,
    hadSite: true,
    url: closed?.url ?? open?.url ?? pages[0].url,
    note:
      `Read ${pages.length} page${pages.length === 1 ? '' : 's'} on ${hosts.join(' and ')}. ` +
      'None says whether they take pitches from people they do not know.',
  }
}

/* --------------------------------------------------------------------- */
/* Checking a stored target                                               */
/* --------------------------------------------------------------------- */

type StoredTarget = typeof syncTargets.$inferSelect

const columnsOf = (row: StoredTarget): TermsColumns => ({
  submissionPolicy: row.submissionPolicy,
  policyEvidence: row.policyEvidence,
  policyUrl: row.policyUrl,
  policyCheckedAt: row.policyCheckedAt,
  policyOverriddenAt: row.policyOverriddenAt,
})

export interface CheckResult {
  row: StoredTarget
  /** It was not refused before and is now, and the artist has not overridden it. */
  newlyClosed: boolean
}

/**
 * Read one target's site, and its own notes, and write down what was found.
 *
 * A refusal in the notes counts and an invitation in the notes does not: a
 * note is somebody's claim about a page, and only a refusal is safe to take on
 * trust. The artist's override is never read or written here.
 */
export async function checkTarget(
  env: Env,
  tenant: TenantId,
  id: number,
  options: { now?: string; fetchImpl?: typeof fetch; announce?: boolean } = {},
): Promise<CheckResult | null> {
  const db = getDb(env.DB)
  const row = await db.select().from(syncTargets).where(scoped(syncTargets, tenant, eq(syncTargets.id, id))).get()
  if (!row) return null

  const now = options.now ?? new Date().toISOString()
  const scan = await scanSite(row, options.fetchImpl)
  const fromNotes = readSubmissionPolicy(row.notes, { only: 'closed' })

  const closed = scan.closed ?? (fromNotes ? { ...fromNotes, url: null } : null)
  const folded = foldFinding(
    columnsOf(row),
    closed
      ? { policy: 'closed', quote: closed.quote, url: closed.url, note: scan.note }
      : scan.open
        ? { policy: 'open', quote: scan.open.quote, url: scan.open.url, note: scan.note }
        : { policy: null, quote: null, url: scan.url, note: scan.note },
    now,
  )

  await db
    .update(syncTargets)
    .set({
      submissionPolicy: folded.submissionPolicy,
      policyEvidence: folded.policyEvidence,
      policyUrl: folded.policyUrl,
      policyCheckedAt: folded.policyCheckedAt,
    })
    .where(scoped(syncTargets, tenant, eq(syncTargets.id, id)))

  const updated = { ...row, ...folded }
  const newlyClosed = termsState(columnsOf(row)) !== 'closed' && termsState(folded) === 'closed'

  if (newlyClosed && options.announce) {
    await recordEvent(env, tenant, {
      kind: 'automation',
      tier: 'attention',
      title: `${row.name} takes no unsolicited pitches`,
      body: folded.policyEvidence,
      href: '#sync',
      action: 'Open',
      dedupeKey: `sync:terms:${id}:closed`,
    })
  }
  return { row: updated, newlyClosed }
}

export interface TermsRun {
  due: number
  checked: number
  closed: number
}

/** Per tenant per night. A backlog this size clears in a week, and the sites are small ones. */
export const TERMS_LIMIT = 6

/**
 * The nightly pass: read the sites nobody has read.
 *
 * One target after another, a few a night, for the reason `revisitForms` gives:
 * these are small companies' websites and a cron arriving in a burst is the
 * wrong way to read them. It is also how the targets that were already on file
 * before this existed get checked at all.
 */
export async function checkPendingTerms(
  env: Env,
  tenant: TenantId,
  today: string,
  options: { limit?: number; fetchImpl?: typeof fetch; now?: string } = {},
): Promise<TermsRun> {
  const db = getDb(env.DB)
  const rows = await db.select().from(syncTargets).where(scoped(syncTargets, tenant))

  const order = { never: 0, retry: 1, stale: 2 } as const
  const due = rows
    .map((row) => ({ row, why: termsDue({ ...row }, today) }))
    .filter((d): d is { row: StoredTarget; why: 'never' | 'retry' | 'stale' } => d.why !== null)
    .sort((a, b) => order[a.why] - order[b.why] || a.row.id - b.row.id)

  const run: TermsRun = { due: due.length, checked: 0, closed: 0 }
  for (const { row } of due.slice(0, options.limit ?? TERMS_LIMIT)) {
    try {
      const result = await checkTarget(env, tenant, row.id, {
        announce: true,
        fetchImpl: options.fetchImpl,
        now: options.now,
      })
      if (!result) continue
      run.checked++
      if (result.newlyClosed) run.closed++
    } catch (err) {
      // One company's website falling over must not cost the rest their look.
      console.error(`terms check failed for sync target ${row.id}:`, err)
    }
  }
  return run
}
