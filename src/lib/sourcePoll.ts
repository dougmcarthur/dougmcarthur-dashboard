/**
 * Scout reading the pages that list calls, without a model.
 *
 * A research agent's weekly sweep spends most of its effort on one thing:
 * opening known pages — an association's deadlines list, a feed — and reading
 * what is on them. That is mechanical, and a Worker doing it costs a request.
 * What an agent is for is *finding* a page nobody knew about; once found, it
 * belongs in `catalog_sources` and is read from here on by this. See
 * `shared/catalogSources.ts` for why a read yields candidates and not catalog
 * entries.
 *
 * The properties that keep it cheap and keep it polite:
 *
 *  - **An unchanged source costs one request and no parsing.** It sends the
 *    validators it was given last time (`ETag`, `Last-Modified`) and compares a
 *    hash of the body when the server ignores them.
 *  - **A broken source gets quieter, not louder.** Failures and empty reads
 *    push the next look out — a day, two, four, up to a week — so a source that
 *    has gone for good costs one request a week without anything deciding it is
 *    dead.
 *  - **A few a tick, one at a time.** The cron is hourly and takes at most
 *    `PER_TICK` due sources, in order of how long they have waited. These are
 *    small associations' websites; there is no reason to arrive in a burst.
 *  - **It says who it is.** The same honest user agent every other fetch in
 *    this Worker uses. A site that turns it away is turned away from, and shows
 *    as `refused` on the owner's screen; nothing here tries to look like a
 *    browser.
 *  - **Nothing is trusted.** What comes back is a stranger's markup. It is read
 *    by two regex readers that return strings and dates, capped in size, and
 *    never executed, followed or passed to a model.
 *
 * Errors do not leave this file: a poll that throws would take the cron's other
 * jobs with it, so every source's failure is recorded on that source.
 */

import { and, asc, eq, inArray, isNull, lt, lte, or } from 'drizzle-orm'
import { getDb } from '../db'
import { catalogCandidates, catalogSources, type CatalogSourceRow } from '../db/schema'
import { sha256Hex } from './auth'
import { readSetting, writeSetting } from './settings'
import { feedFormat, parseFeed } from '../../shared/feedParse'
import { parseListing } from '../../shared/listingParse'
import {
  draftFromFeedItem,
  draftFromListingItem,
  isCallsPage,
  nextDueAt,
  refreshCandidate,
  seedSources,
  type CandidateDraft,
} from '../../shared/catalogSources'
import type { Env } from '../types'

export const SCOUT_USER_AGENT = 'SunDogsMusicScout/1.0 (+https://scout.sundogsmusic.ca)'

/** Sources read per cron tick. */
export const PER_TICK = 3

/** A body past this is cut. Music BC's feed is 1.6 MB for ten items. */
export const MAX_BODY_BYTES = 3_000_000

/** New candidates written for one source in one read. A listing is not an archive. */
export const MAX_NEW_PER_READ = 120

const TIMEOUT_MS = 15_000

export const POLL_KEY = 'catalog.lastPoll'

const ACCEPT: Record<string, string> = {
  feed: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
  calendar: 'text/calendar, */*;q=0.5',
  page: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.5',
}

/* ----------------------------------------------------------------------- */
/* The registry                                                            */
/* ----------------------------------------------------------------------- */

/**
 * Bring the registry into line with `shared/musicAssociations.ts`.
 *
 * A seed that is missing is inserted; one whose address, label or kind changed
 * in the code is updated and its validators cleared, since a new address has
 * no history. Sources an agent or the owner added are never touched, and a seed
 * the owner switched off stays off.
 */
export async function ensureSeedSources(env: Env, now: Date): Promise<number> {
  const db = getDb(env.DB)
  const existing = new Map((await db.select().from(catalogSources)).map((s) => [s.sourceKey, s]))
  let changed = 0

  for (const seed of seedSources()) {
    const row = existing.get(seed.key)
    if (!row) {
      await db.insert(catalogSources).values({
        sourceKey: seed.key,
        association: seed.association,
        region: seed.region,
        label: seed.label,
        url: seed.url,
        kind: seed.kind,
        createdAt: now.toISOString(),
      })
      changed++
      continue
    }
    if (row.addedBy !== 'seed') continue
    if (row.url !== seed.url || row.label !== seed.label || row.kind !== seed.kind || row.region !== seed.region) {
      await db
        .update(catalogSources)
        .set({
          url: seed.url,
          label: seed.label,
          kind: seed.kind,
          region: seed.region,
          association: seed.association,
          etag: null,
          lastModified: null,
          contentHash: null,
          failures: 0,
          nextDueAt: null,
        })
        .where(eq(catalogSources.id, row.id))
      changed++
    }
  }
  return changed
}

/* ----------------------------------------------------------------------- */
/* One source                                                              */
/* ----------------------------------------------------------------------- */

/** The body as text, cut at the cap. `truncated` says it was. */
export async function readCapped(res: Response, max = MAX_BODY_BYTES): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: await res.text(), truncated: false }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let bytes = 0
  let truncated = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > max) {
      text += decoder.decode(value.subarray(0, Math.max(0, value.byteLength - (bytes - max))), { stream: false })
      truncated = true
      await reader.cancel().catch(() => {})
      break
    }
    text += decoder.decode(value, { stream: true })
  }
  return { text, truncated }
}

export interface SourceResult {
  source: string
  ok: boolean
  /** Items understood. */
  items: number
  /** Candidates written for the first time. */
  added: number
  note: string
}

type Fetcher = typeof fetch

function firstSentence(s: string, max = 200): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, max)
}

export async function pollOne(
  env: Env,
  source: CatalogSourceRow,
  now: Date,
  fetchImpl: Fetcher = fetch,
): Promise<SourceResult> {
  const db = getDb(env.DB)
  const nowIso = now.toISOString()
  const today = nowIso.slice(0, 10)
  const result = (over: Partial<SourceResult>): SourceResult => ({
    source: source.label,
    ok: false,
    items: 0,
    added: 0,
    note: '',
    ...over,
  })

  const fail = async (status: number | null, error: string): Promise<SourceResult> => {
    const failures = source.failures + 1
    await db
      .update(catalogSources)
      .set({
        lastFetchedAt: nowIso,
        lastStatus: status,
        lastError: firstSentence(error),
        failures,
        nextDueAt: nextDueAt(now, source.cadenceHours, failures),
      })
      .where(eq(catalogSources.id, source.id))
    return result({ note: error })
  }

  const headers: Record<string, string> = {
    'User-Agent': SCOUT_USER_AGENT,
    Accept: ACCEPT[source.kind] ?? ACCEPT.page,
  }
  if (source.etag) headers['If-None-Match'] = source.etag
  if (source.lastModified) headers['If-Modified-Since'] = source.lastModified

  let res: Response
  try {
    res = await fetchImpl(source.url, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    return fail(null, err instanceof Error ? err.message : 'No answer.')
  }

  if (res.status === 304) {
    await db
      .update(catalogSources)
      .set({
        lastFetchedAt: nowIso,
        lastOkAt: nowIso,
        lastStatus: 304,
        lastError: null,
        failures: 0,
        nextDueAt: nextDueAt(now, source.cadenceHours, 0),
      })
      .where(eq(catalogSources.id, source.id))
    return result({ ok: true, items: source.lastItemCount ?? 0, note: 'Unchanged.' })
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {})
    return fail(res.status, `The site answered ${res.status}.`)
  }

  const { text } = await readCapped(res)
  const hash = await sha256Hex(text)

  // The server ignored the validators but nothing has changed: the same hash
  // is the same page, and there is nothing to read again.
  if (source.contentHash === hash && (source.lastItemCount ?? 0) > 0) {
    await db
      .update(catalogSources)
      .set({
        lastFetchedAt: nowIso,
        lastOkAt: nowIso,
        lastStatus: res.status,
        lastError: null,
        failures: 0,
        nextDueAt: nextDueAt(now, source.cadenceHours, 0),
      })
      .where(eq(catalogSources.id, source.id))
    return result({ ok: true, items: source.lastItemCount ?? 0, note: 'Unchanged.' })
  }

  // Written down before the body is read, as though the read had failed. A
  // parse that dies partway cannot record anything, and the next tick would
  // try the same source first, because it has waited longest. With this a
  // source that kills its own parse is read less and less like any other
  // failing one, and the success below overwrites it.
  await db
    .update(catalogSources)
    .set({
      lastFetchedAt: nowIso,
      lastError: 'The last read did not finish.',
      failures: source.failures + 1,
      nextDueAt: nextDueAt(now, source.cadenceHours, source.failures + 1),
    })
    .where(eq(catalogSources.id, source.id))

  const callsPage = isCallsPage(source.label)
  let drafts: CandidateDraft[] = []
  let newest: string | null = null
  let emptyReason: string | null = null

  if (source.kind === 'page') {
    const items = parseListing(text, source.url)
    drafts = items.map((i) => draftFromListingItem(i, { today, callsPage }))
    if (!items.length) emptyReason = 'No entries could be read from the page.'
  } else {
    const items = parseFeed(text)
    if (items === null) {
      emptyReason = feedFormat(text) === null && text.trim().length === 0
        ? 'The address answered with nothing.'
        : 'The address answered with something that is not a feed.'
    } else {
      drafts = items.map((i) => draftFromFeedItem(i, { today, callsPage }))
      newest = items.map((i) => i.publishedAt ?? i.eventAt).filter((d): d is string => Boolean(d)).sort().at(-1) ?? null
      if (!items.length) emptyReason = 'The feed has no items.'
    }
  }

  const added = await upsertCandidates(env, source.id, drafts, now, today)

  // It answered and was understood, even if what it held was nothing. `failures`
  // still counts an empty read, so a source that has gone quiet is read less
  // and less — but `lastOkAt` moves, which is what lets the screen say "empty"
  // and not "unreachable".
  const failures = emptyReason ? source.failures + 1 : 0
  await db
    .update(catalogSources)
    .set({
      lastFetchedAt: nowIso,
      lastOkAt: nowIso,
      lastStatus: res.status,
      lastError: emptyReason,
      etag: emptyReason ? null : res.headers.get('etag'),
      lastModified: emptyReason ? null : res.headers.get('last-modified'),
      contentHash: emptyReason ? null : hash,
      failures,
      lastItemCount: drafts.length,
      newestItemAt: newest,
      nextDueAt: nextDueAt(now, source.cadenceHours, failures),
    })
    .where(eq(catalogSources.id, source.id))

  return result({ ok: !emptyReason, items: drafts.length, added, note: emptyReason ?? `Read ${drafts.length} items.` })
}

/**
 * Write what a read found. Read-by-key then insert, never `ON CONFLICT`: the
 * unique index exists to turn a race into an error this catches and moves past,
 * not to be named as a target — the rule `src/lib/catalog.ts` holds for the
 * same reason.
 */
async function upsertCandidates(
  env: Env,
  sourceId: number,
  drafts: CandidateDraft[],
  now: Date,
  today: string,
): Promise<number> {
  const db = getDb(env.DB)
  const nowIso = now.toISOString()
  const stored = new Map(
    (await db.select().from(catalogCandidates).where(eq(catalogCandidates.sourceId, sourceId))).map((c) => [c.itemKey, c]),
  )

  let added = 0
  const seenUnchanged: number[] = []
  const handled = new Set<string>()

  for (const draft of drafts) {
    if (handled.has(draft.itemKey)) continue
    handled.add(draft.itemKey)

    const row = stored.get(draft.itemKey)
    if (!row) {
      if (added >= MAX_NEW_PER_READ) continue
      try {
        await db.insert(catalogCandidates).values({
          sourceId,
          itemKey: draft.itemKey,
          title: draft.title,
          url: draft.url,
          publishedAt: draft.publishedAt,
          eventAt: draft.eventAt,
          deadline: draft.deadline,
          deadlineNote: draft.deadlineNote,
          placeText: draft.placeText,
          verdict: draft.verdict,
          category: draft.category,
          kind: draft.kind,
          reason: draft.reason,
          status: draft.status,
          firstSeenAt: nowIso,
          lastSeenAt: nowIso,
        })
        added++
      } catch (err) {
        // Another read of the same source won the insert. It is there now.
        console.error('candidate insert skipped:', err)
      }
      continue
    }

    const patch = refreshCandidate(row, draft, today)
    if (patch) {
      await db.update(catalogCandidates).set({ ...patch, lastSeenAt: nowIso }).where(eq(catalogCandidates.id, row.id))
    } else {
      seenUnchanged.push(row.id)
    }
  }

  // One statement per fifty rather than one per row: the bulk of a re-read is
  // items that have not changed, and all that needs recording is that they are
  // still there.
  for (let i = 0; i < seenUnchanged.length; i += 50) {
    await db
      .update(catalogCandidates)
      .set({ lastSeenAt: nowIso })
      .where(inArray(catalogCandidates.id, seenUnchanged.slice(i, i + 50)))
  }
  return added
}

/* ----------------------------------------------------------------------- */
/* The tick                                                                */
/* ----------------------------------------------------------------------- */

export interface PollReport {
  polled: number
  ok: number
  failed: number
  added: number
  results: SourceResult[]
}

export async function pollSources(
  env: Env,
  opts: { now?: Date; limit?: number; force?: boolean; fetchImpl?: Fetcher } = {},
): Promise<PollReport> {
  const now = opts.now ?? new Date()
  const db = getDb(env.DB)

  await ensureSeedSources(env, now)

  const due = await db
    .select()
    .from(catalogSources)
    .where(
      and(
        eq(catalogSources.enabled, 1),
        opts.force ? undefined : or(isNull(catalogSources.nextDueAt), lte(catalogSources.nextDueAt, now.toISOString())),
      ),
    )
    .orderBy(asc(catalogSources.nextDueAt), asc(catalogSources.id))
    .limit(opts.limit ?? PER_TICK)

  const results: SourceResult[] = []
  for (const source of due) {
    try {
      results.push(await pollOne(env, source, now, opts.fetchImpl))
    } catch (err) {
      console.error(`source read failed (${source.label}):`, err)
      results.push({ source: source.label, ok: false, items: 0, added: 0, note: 'The read failed before it could be recorded.' })
    }
  }

  const report: PollReport = {
    polled: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    added: results.reduce((n, r) => n + r.added, 0),
    results,
  }
  // The heartbeat. A poll that quietly stopped is the failure this repo has
  // learned to expect from anything nobody watches, so the last one is on the
  // owner's screen with its time.
  if (results.length) {
    await writeSetting(env, POLL_KEY, JSON.stringify({ at: now.toISOString(), polled: report.polled, ok: report.ok, failed: report.failed, added: report.added }))
  }
  return report
}

export interface LastPoll {
  at: string
  polled: number
  ok: number
  failed: number
  added: number
}

export async function readLastPoll(env: Env): Promise<LastPoll | null> {
  const raw = await readSetting(env, POLL_KEY)
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<LastPoll>
    return typeof v.at === 'string' ? ({ polled: 0, ok: 0, failed: 0, added: 0, ...v } as LastPoll) : null
  } catch {
    return null
  }
}

/* ----------------------------------------------------------------------- */
/* Retention                                                               */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000

/**
 * What is not worth keeping. Ignored items were only ever kept so the verdicts
 * can be audited for what they missed; a call that has closed or gone stale
 * has nothing left to say. Run on the daily tick.
 */
export async function pruneCandidates(env: Env, now: Date): Promise<number> {
  const db = getDb(env.DB)
  const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString()
  const a = await db
    .delete(catalogCandidates)
    .where(and(eq(catalogCandidates.status, 'ignored'), lt(catalogCandidates.lastSeenAt, ago(60))))
    .returning({ id: catalogCandidates.id })
  const b = await db
    .delete(catalogCandidates)
    .where(and(inArray(catalogCandidates.status, ['stale', 'closed', 'new']), lt(catalogCandidates.lastSeenAt, ago(180))))
    .returning({ id: catalogCandidates.id })
  return a.length + b.length
}
