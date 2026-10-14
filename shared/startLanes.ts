/**
 * What a brand-new account is shown before it has said anything.
 *
 * Somebody arriving on the Overview with no rows used to see a checklist and an
 * empty deck, and a matcher that waited to be told goals and a province before
 * it showed anything at all. The most useful thing a first screen can hold is
 * evidence that the product knows something, so this picks the broad things
 * that are true for nearly every Canadian artist and says why each is there:
 *
 *  - **Grants open to artists anywhere in Canada.** National programmes, which
 *    need no province and no genre to be worth a look. Rolling intakes count,
 *    since they have no closing date to miss.
 *  - **Festivals and showcases in their province.** The one lane that needs an
 *    answer, and says so rather than guessing: with no province on file it asks
 *    for one instead of showing somebody else's.
 *  - **Sync companies that take submissions and ask for no exclusivity.** Only
 *    where their own site says both, with the sentences. A company whose site is
 *    silent about exclusivity is counted and listed apart, since silence is not
 *    a clause that is missing.
 *
 * Three rules, and they are `catalogMatch.ts`'s own:
 *
 *  - **Facts remove, with a reason, and weights order.** The gig lanes are cut
 *    from what `matchCatalog` already kept, so a call that has closed, one that
 *    is already on the list and one for residents of another province are
 *    removed there, once, for the same reasons everywhere. Nothing here removes
 *    an item for being a weak fit.
 *  - **A missing input is never a guess.** A grant with no place is not
 *    "national", a showcase with no province is not "in yours", and a company
 *    that was never read is not "non-exclusive". Each says what it does not know.
 *  - **Nothing is added by being shown.** This only chooses what to preview.
 *
 * Pure, no clock and no database: `today` is an argument and the route reads
 * the rows.
 */

import { whereLabel, type Where } from './artistFocus'
import { isDeliverable, type CatalogEntry, type Match } from './catalogMatch'
import { REGIONS, type GoalId } from './onboarding'
import { PROVINCES, regionOf } from './regions'

export type LaneId = 'grants' | 'province' | 'sync'

/** How many rows a lane shows. Enough to look like something, few enough to read. */
export const LANE_SIZE = 4
/** How many "they say nothing about exclusivity" companies are listed beside the ones that do. */
export const UNCLEAR_SIZE = 6

/**
 * How many rows an account has before it is past a first visit.
 *
 * The lanes are an on-ramp for an account with nothing on it, and an on-ramp
 * that stays above the deck for good pushes the artist's actual work below the
 * fold. Twelve is the size the starter set was, so an account that has pulled
 * a full set in, by this card or by hand, has a list to work from. "Not now"
 * ends it sooner.
 */
export const START_UNTIL_ROWS = 12

/** Whether an account has a list of its own and no longer needs the first-visit lanes. */
export function pastFirstVisit(rows: number): boolean {
  return rows >= START_UNTIL_ROWS
}

/** One festival, showcase or grant, as a lane shows it. */
export interface LaneRow {
  id: number
  name: string
  kind: string | null
  organizer: string | null
  location: string | null
  deadline: string | null
  deadlineNote: string | null
  /** No closing date and the page says it takes applications all year. */
  rolling: boolean
  url: string | null
  reasons: string[]
  /** What the listing does not say. */
  unknowns: string[]
}

/** One sync company, with the sentences its own site said. */
export interface SyncRow {
  id: number
  name: string
  kind: string | null
  site: string | null
  /** The sentence that invites submissions, and the page it was on. */
  policyQuote: string
  policyUrl: string | null
  /** The sentence about exclusivity, or null where the site says nothing. */
  exclusivityQuote: string | null
  exclusivityUrl: string | null
  /** Whether anybody has looked at the site for exclusivity yet. */
  exclusivityRead: boolean
  checkedAt: string | null
}

export interface StartLanes {
  /** The lanes in the order to show them: what the artist asked for first. */
  order: LaneId[]
  grants: { heading: string; rows: LaneRow[]; total: number }
  province: {
    heading: string
    /** Their province, or null until they have said. */
    region: { code: string; name: string } | null
    rows: LaneRow[]
    total: number
  }
  sync: {
    heading: string
    rows: SyncRow[]
    total: number
    /** Take submissions, and say nothing about exclusivity. Never shown as a good bet. */
    unclear: SyncRow[]
    unclearTotal: number
    /** Take submissions and ask for exclusivity. Counted, not listed. */
    exclusive: number
    /** Say they do not take submissions from people they do not know. Counted, not listed. */
    closed: number
  }
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

const LANE_GOAL: Record<LaneId, GoalId> = { grants: 'grants', province: 'gigs', sync: 'sync' }

/** Words a page uses for "apply any time". */
const ROLLING = /\b(?:rolling|ongoing|on-?going|continuous(?:ly)?|year[- ]round|all year|any ?time|open intake|no deadline)\b/i

export function isRolling(entry: Pick<CatalogEntry, 'deadline' | 'deadlineNote'>): boolean {
  return !entry.deadline && ROLLING.test(entry.deadlineNote ?? '')
}

const NATIONAL =
  /\b(?:national|nationwide|canada[- ]wide|country[- ]wide|across canada|pan[- ]canadian|all of canada|anywhere in canada)\b/i

/**
 * The province a listing is in, from the column when it has one and from the
 * place otherwise. Null when neither names a Canadian province: a US state is
 * a region, and "your province" is not one.
 */
export function provinceOf(entry: Pick<CatalogEntry, 'region' | 'location'>): string | null {
  const stated = entry.region?.toUpperCase() ?? null
  if (stated && stated in PROVINCES) return stated
  const read = regionOf(entry.location)
  return read && read.country === 'CA' ? read.code : null
}

/**
 * Whether a funding call is for artists anywhere in Canada.
 *
 * Read from what the listing says and nothing else: a place that says
 * national or Canada, no province anywhere in it or in the column, and nobody
 * restricted to residents. A grant with no place at all is not called national,
 * since an agent that could not tell where a programme is has not said it is
 * everywhere, and a Winnipeg-only grant shown to a Vancouver artist is the
 * mistake a first screen cannot afford.
 */
export function isNationalGrant(entry: CatalogEntry): boolean {
  if (entry.category !== 'funding') return false
  const place = (entry.location ?? '').trim()
  if (!place) return false
  if (provinceOf(entry) !== null) return false
  if ((entry.eligibility?.residentOf ?? []).length > 0) return false

  const country = (entry.country ?? '').toLowerCase().replace(/[.\s]+/g, '')
  if (country && !['ca', 'can', 'canada'].includes(country)) return false

  const bare = place.replace(/[.,()]/g, ' ').replace(/\s+/g, ' ').trim()
  return NATIONAL.test(place) || /^(?:canada|canadian|ca)$/i.test(bare)
}

/**
 * An address a link may point at, or null. Catalog addresses are strings an
 * agent wrote from a page a stranger wrote, and `z.string().url()` accepts
 * `javascript:` and `data:`, so nothing is rendered as a link until it is http
 * or https.
 */
export function httpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

function closing(entry: CatalogEntry, today: string): { text: string; unknown: string | null } {
  if (entry.deadline) {
    const [y, m, d] = entry.deadline.slice(0, 10).split('-').map(Number)
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] ?? '?'
    const year = String(y) !== today.slice(0, 4) ? `, ${y}` : ''
    return { text: `Closes ${month} ${d}${year}.`, unknown: null }
  }
  if (isRolling(entry)) return { text: 'Takes applications all year, so there is no closing date to miss.', unknown: null }
  return {
    text: '',
    unknown: entry.deadlineNote ? `No closing date. The page says: ${entry.deadlineNote}.` : 'No closing date stated.',
  }
}

/**
 * The matcher's labels for where a place is, which are said relative to a home
 * it may not know. With no goals chosen it has none, and a province lane that
 * said "In Manitoba. Elsewhere in Canada." contradicted itself. The lane states
 * the place in its own lead, so these are not repeated.
 */
const PLACE_LABELS = (['home', 'canada', 'us', 'abroad', 'no_travel'] as Where[]).map(whereLabel)

function rowOf(match: Match, lead: string, today: string): LaneRow {
  const e = match.entry
  const when = closing(e, today)
  // The matcher's own reasons about genre and reach are kept; the lane adds
  // what put the row in it, and the closing date goes last.
  const kept = match.reasons.filter(
    (r) =>
      !r.startsWith('Closes ') &&
      !r.startsWith('Something you asked for') &&
      !PLACE_LABELS.some((label) => r.startsWith(label)),
  )
  return {
    id: e.id,
    name: e.name,
    kind: e.kind,
    organizer: e.organizer,
    location: e.location,
    deadline: e.deadline,
    deadlineNote: e.deadlineNote,
    rolling: isRolling(e),
    url: httpUrl(e.url),
    reasons: [lead, ...kept, ...(when.text ? [when.text] : [])],
    unknowns: [...match.unknowns.map((u) => u.text).filter((t) => !t.startsWith('No closing date')), ...(when.unknown ? [when.unknown] : [])],
  }
}

function syncRowOf(entry: CatalogEntry): SyncRow | null {
  const org = entry.org
  if (!org || org.submissionPolicy !== 'open' || !org.policyEvidence) return null
  return {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    site: httpUrl(org.site),
    policyQuote: org.policyEvidence,
    policyUrl: httpUrl(org.policyUrl),
    exclusivityQuote: org.exclusivity === 'non_exclusive' ? org.exclusivityEvidence : null,
    exclusivityUrl: org.exclusivity === 'non_exclusive' ? httpUrl(org.exclusivityUrl) : null,
    exclusivityRead: org.termsReadAt !== null,
    checkedAt: org.policyCheckedAt,
  }
}

export interface SyncCandidates {
  /** Takes submissions, and its own site says it asks for no exclusivity. */
  stated: SyncRow[]
  /** Takes submissions, and its site says nothing about exclusivity. */
  unclear: SyncRow[]
  exclusive: number
  closed: number
}

/**
 * Which sync organisations may be shown, and under what heading.
 *
 * Deliverable only (the holding period applies to an organisation as it does to
 * a listing), and never one already on the artist's list. A refusal is counted
 * and never listed: it is the one thing here that would be a mistake to send.
 */
export function syncCandidates(entries: readonly CatalogEntry[], have: ReadonlySet<number>, today: string): SyncCandidates {
  const out: SyncCandidates = { stated: [], unclear: [], exclusive: 0, closed: 0 }
  for (const entry of entries) {
    if (entry.category !== 'sync' || have.has(entry.id) || !isDeliverable(entry, today)) continue
    const org = entry.org
    if (!org) continue
    if (org.submissionPolicy === 'closed') {
      out.closed++
      continue
    }
    const row = syncRowOf(entry)
    if (!row) continue
    if (org.exclusivity === 'exclusive') out.exclusive++
    else if (org.exclusivity === 'non_exclusive' && org.exclusivityEvidence) out.stated.push(row)
    else out.unclear.push(row)
  }
  const byName = (a: SyncRow, b: SyncRow) => a.name.localeCompare(b.name)
  out.stated.sort(byName)
  // The ones somebody has looked at and found silent come before the ones
  // nobody has read, since the first is a fact and the second is a gap.
  out.unclear.sort((a, b) => Number(b.exclusivityRead) - Number(a.exclusivityRead) || byName(a, b))
  return out
}

function grantsHeading(n: number): string {
  return n === 0
    ? 'Scout has no grant to show you right now that is open to artists anywhere in Canada.'
    : `${n} ${plural(n, 'grant is', 'grants are')} open to artists anywhere in Canada.`
}

function provinceHeading(n: number, name: string | null): string {
  if (name === null) return 'Tell Scout which province you are in and it will show you the festivals and showcases there.'
  return n === 0
    ? `Scout has no open festival or showcase in ${name} to show you right now.`
    : `${n} ${plural(n, 'festival or showcase in', 'festivals and showcases in')} ${name} ${plural(n, 'is', 'are')} open for applications.`
}

function syncHeading(n: number): string {
  return n === 0
    ? 'Scout has no sync company to show you whose own site says it takes submissions and asks for no exclusivity.'
    : `${n} sync ${plural(n, 'company takes submissions and says it asks', 'companies take submissions and say they ask')} for no exclusivity.`
}

export function buildStartLanes(input: {
  /** From `matchCatalog`: already deliverable, open, not on the list, and not for another province's residents. */
  matches: readonly Match[]
  /** Every catalog entry, so the sync organisations can be found. */
  entries: readonly CatalogEntry[]
  /** Catalog ids of sync targets the artist already has. */
  haveSync: ReadonlySet<number>
  /** Their province code, or null until they have said. */
  home: string | null
  /** The goals they chose, to put those lanes first. */
  goals: readonly GoalId[]
  today: string
}): StartLanes {
  const { matches, entries, haveSync, home, goals, today } = input
  const regionName = home ? (REGIONS.find((r) => r.id === home)?.label ?? null) : null

  const grantMatches = matches.filter((m) => isNationalGrant(m.entry))
  const provinceMatches =
    home === null
      ? []
      : matches.filter(
          (m) => (m.entry.category === 'showcase' || m.entry.category === 'festival') && provinceOf(m.entry) === home,
        )

  const sync = syncCandidates(entries, haveSync, today)

  const lanes: LaneId[] = ['grants', 'province', 'sync']
  const asked = (lane: LaneId) => goals.includes(LANE_GOAL[lane])
  // Stable: what they asked for first, the rest in the order above.
  const order = goals.length === 0 ? lanes : [...lanes.filter(asked), ...lanes.filter((l) => !asked(l))]

  return {
    order,
    grants: {
      heading: grantsHeading(grantMatches.length),
      rows: grantMatches.slice(0, LANE_SIZE).map((m) => rowOf(m, 'Open to artists anywhere in Canada.', today)),
      total: grantMatches.length,
    },
    province: {
      heading: provinceHeading(provinceMatches.length, regionName),
      region: home && regionName ? { code: home, name: regionName } : null,
      rows: provinceMatches.slice(0, LANE_SIZE).map((m) => rowOf(m, `In ${regionName}.`, today)),
      total: provinceMatches.length,
    },
    sync: {
      heading: syncHeading(sync.stated.length),
      rows: sync.stated.slice(0, LANE_SIZE),
      total: sync.stated.length,
      unclear: sync.unclear.slice(0, UNCLEAR_SIZE),
      unclearTotal: sync.unclear.length,
      exclusive: sync.exclusive,
      closed: sync.closed,
    },
  }
}
