/**
 * The registry of pages Scout reads for calls, and what becomes of what it
 * reads there.
 *
 * Three decisions live here, each of which is a way this could quietly lie.
 *
 * **A candidate is not an opportunity.** Reading a source yields items, and an
 * item gets a verdict and a status; nothing in this file publishes anything.
 * The announcing page is usually not the programme's own page — SaskMusic's
 * "Read More" goes to SaskMusic — and a catalog keyed on the announcement would
 * duplicate itself the day the real address is found.
 *
 * **A source that answers is not a source that works.** The first real reads
 * found three kinds of dead source that a status code calls fine: Music BC's
 * "feed" is a republished newsletter whose newest item is nineteen months old;
 * Music PEI's calendar answers 200 with an empty body; MusicNL's "member
 * opportunities" page is a login wall. `sourceState` reads what came *back*
 * rather than how it was answered, so each of those says so on the screen
 * instead of reading as healthy.
 *
 * **First sight sets a baseline.** A feed read for the first time hands over
 * its last ten items at once, some of them months old. The ones older than
 * `STALE_DAYS` are filed as stale rather than as new, the way `scanProfiles`
 * says nothing about what it found on the first read of a profile.
 *
 * Pure: no clock, no database, no network. `today` and `now` are arguments.
 */

import { ASSOCIATIONS } from './musicAssociations'
import { classifyCall, type CallVerdict } from './callClassifier'
import { splitDeadline } from './reviewParse'
import type { CatalogCategory } from './opportunityCatalog'
import type { FeedItem } from './feedParse'
import type { ListingItem } from './listingParse'

export type SourceKind = 'feed' | 'calendar' | 'page'

export interface SeedSource {
  key: string
  association: string
  region: string
  /** Said on screens: "Music BC — News". Never the key. */
  label: string
  url: string
  kind: SourceKind
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Every source `musicAssociations.ts` names, as a registry row. That file stays
 * the truth for these: the poller re-reads this list and brings a seed's
 * address and label back into line, so correcting a URL is a code change and
 * not a database one.
 */
export function seedSources(): SeedSource[] {
  return ASSOCIATIONS.flatMap((a) =>
    a.sources.map((s) => ({
      key: `${a.id}:${slug(s.label)}`,
      association: a.id,
      region: a.region,
      label: `${a.name} — ${s.label}`,
      url: s.url,
      kind: s.kind,
    })),
  )
}

/** A page whose whole job is to list calls: an entry with no clear signal is still listed there. */
export function isCallsPage(label: string): boolean {
  return /opportunit|deadline|call|submission/i.test(label)
}

/* ----------------------------------------------------------------------- */
/* Candidates                                                              */
/* ----------------------------------------------------------------------- */

export type CandidateStatus = 'new' | 'ignored' | 'stale' | 'closed'

export interface CandidateDraft {
  itemKey: string
  title: string
  url: string | null
  publishedAt: string | null
  eventAt: string | null
  /** ISO, only when the listing's words carried a year. */
  deadline: string | null
  /** The words, when they did not. Never turned into a date. */
  deadlineNote: string | null
  placeText: string | null
  verdict: CallVerdict
  category: CatalogCategory | null
  kind: string | null
  reason: string
  status: CandidateStatus
}

/** An item first seen after it has been up this long is history, not news. */
export const STALE_DAYS = 90

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function initialStatus(draft: {
  verdict: CallVerdict
  deadline: string | null
  publishedAt: string | null
  eventAt: string | null
}, today: string): CandidateStatus {
  if (draft.verdict === 'not_opportunity') return 'ignored'
  if (draft.deadline && draft.deadline < today) return 'closed'
  if (draft.eventAt && draft.eventAt < today) return 'closed'
  if (draft.publishedAt && daysBetween(draft.publishedAt.slice(0, 10), today) > STALE_DAYS) return 'stale'
  return 'new'
}

export function draftFromFeedItem(item: FeedItem, ctx: { today: string; callsPage: boolean }): CandidateDraft {
  const call = classifyCall({ title: item.title, summary: item.summary, categories: item.categories, callsPage: ctx.callsPage })
  const draft = {
    itemKey: item.key,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    eventAt: item.eventAt,
    // A feed item's deadline, if it names one, is in the article. That is the
    // next step's page, not a sentence read out of a summary here.
    deadline: null,
    deadlineNote: null,
    placeText: item.place,
    verdict: call.verdict,
    category: call.category,
    kind: call.kind,
    reason: call.reason,
  }
  return { ...draft, status: initialStatus(draft, ctx.today) }
}

/** "August 19, 2026" → an ISO datetime at the start of that day, or null. */
function postedAt(text: string | null): string | null {
  const date = text ? splitDeadline(text).date : null
  return date ? `${date}T00:00:00.000Z` : null
}

export function draftFromListingItem(item: ListingItem, ctx: { today: string; callsPage: boolean }): CandidateDraft {
  const call = classifyCall({
    title: item.title,
    summary: item.blurb,
    hasDeadline: item.deadlineText !== null,
    callsPage: ctx.callsPage,
  })
  const split = splitDeadline(item.deadlineText)
  const draft = {
    itemKey: item.url,
    title: item.title,
    url: item.url,
    // A dated list says when each row was posted. A page of calls does not,
    // and its rows have a deadline instead.
    publishedAt: postedAt(item.postedText),
    eventAt: null,
    deadline: split.date,
    // The listing's own words when no year came with them, kept as written so
    // "November 20" is never a date nobody stated.
    deadlineNote: split.date ? split.note : item.deadlineText,
    placeText: item.place,
    verdict: call.verdict,
    category: call.category,
    kind: call.kind,
    reason: call.reason,
  }
  return { ...draft, status: initialStatus(draft, ctx.today) }
}

/** What differs between a stored candidate and what the source says now, or null. */
export interface StoredCandidate {
  title: string
  url: string | null
  deadline: string | null
  deadlineNote: string | null
  placeText: string | null
  verdict: string
  category: string | null
  kind: string | null
  reason: string
  status: string
}

/**
 * The fields to change on a candidate seen again.
 *
 * Two things move after first sight: a deadline that was extended (or came to
 * pass), and a verdict, because the rules improve and a re-read should not
 * leave an item filed under the old ones. A status moves only along the line
 * that is true — a call whose deadline has gone becomes `closed`, one whose
 * deadline moved out again reopens — and `ignored` and `stale` stay where
 * first sight put them: nobody is waiting on those.
 */
export function refreshCandidate(
  stored: StoredCandidate,
  draft: CandidateDraft,
  today: string,
): Partial<StoredCandidate> | null {
  const patch: Partial<StoredCandidate> = {}
  for (const key of ['title', 'url', 'deadline', 'deadlineNote', 'placeText', 'verdict', 'category', 'kind', 'reason'] as const) {
    if (stored[key] !== draft[key]) (patch as Record<string, unknown>)[key] = draft[key]
  }

  let status = stored.status
  if (draft.verdict === 'not_opportunity') status = 'ignored'
  else if (stored.status === 'ignored') status = draft.status === 'closed' ? 'closed' : 'new'
  else if (stored.status === 'new' && draft.status === 'closed') status = 'closed'
  else if (stored.status === 'closed' && draft.deadline && draft.deadline >= today) status = 'new'
  if (status !== stored.status) patch.status = status

  return Object.keys(patch).length ? patch : null
}

/* ----------------------------------------------------------------------- */
/* Cadence and health                                                      */
/* ----------------------------------------------------------------------- */

/** The longest a failing source waits, as a multiple of its own cadence. */
export const MAX_BACKOFF = 7

/**
 * When to look again.
 *
 * One failure is retried at the usual time — most are a bad minute. After that
 * it doubles up to a week, so a source that has gone for good costs one request
 * a week and not one a day, without anything having to decide it is dead.
 */
export function nextDueAt(now: Date, cadenceHours: number, failures: number): string {
  const multiple = failures <= 1 ? 1 : Math.min(2 ** (failures - 1), MAX_BACKOFF)
  return new Date(now.getTime() + cadenceHours * multiple * 3_600_000).toISOString()
}

/** A feed whose newest item is older than this is answering, and dead. */
export const DEAD_FEED_DAYS = 180

export type SourceState = 'off' | 'never' | 'working' | 'overdue' | 'stale' | 'empty' | 'refused' | 'unreachable'

export interface SourceHealthInput {
  enabled: boolean
  kind: string
  cadenceHours: number
  lastFetchedAt: string | null
  lastOkAt: string | null
  lastStatus: number | null
  lastError: string | null
  lastItemCount: number | null
  newestItemAt: string | null
}

/**
 * What the last read says about the source, in a state and a sentence.
 *
 * A refusal (401, 403, 429) is a verdict about our access, which is the
 * owner's to act on; a timeout or a 500 is a fact about the network and not a
 * verdict at all — the same split `shared/credentialHealth.ts` makes, and for
 * the same reason: recording the second as the first is how a screen starts
 * crying wolf.
 */
export function sourceState(s: SourceHealthInput, now: Date): { state: SourceState; note: string } {
  if (!s.enabled) return { state: 'off', note: 'Switched off.' }
  if (!s.lastFetchedAt) return { state: 'never', note: 'Not read yet.' }

  const failed = !s.lastOkAt || s.lastOkAt < s.lastFetchedAt
  if (failed) {
    if (s.lastStatus === 401 || s.lastStatus === 403 || s.lastStatus === 429) {
      return { state: 'refused', note: `The site turned the request away (${s.lastStatus}).` }
    }
    return { state: 'unreachable', note: s.lastError ?? 'No answer.' }
  }

  if (s.lastItemCount === 0) {
    return {
      state: 'empty',
      note:
        s.kind === 'page'
          ? 'Answered, but no entries could be read from it.'
          : 'Answered, but it is not a feed with anything in it.',
    }
  }

  if (s.kind !== 'page' && s.newestItemAt) {
    const age = daysBetween(s.newestItemAt.slice(0, 10), now.toISOString().slice(0, 10))
    if (age > DEAD_FEED_DAYS) {
      // Rounded down: a note about how long something has been dead should not
      // round the age up.
      return { state: 'stale', note: `Answers, but its newest item is ${Math.floor(age / 30)} months old.` }
    }
  }

  const since = (now.getTime() - Date.parse(s.lastOkAt!)) / 3_600_000
  if (since > s.cadenceHours * 3 + 24) {
    return { state: 'overdue', note: 'It has not been read when it should have been.' }
  }

  return { state: 'working', note: `Read ${s.lastItemCount ?? 0} items.` }
}
