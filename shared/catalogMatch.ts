/**
 * Matching the shared catalog to one artist.
 *
 * Research is collected once, for everybody, into the catalog. What is per
 * artist is this: which of it is theirs to look at, in what order, and why. It
 * is deterministic and runs in the Worker, so a new account costs nothing but
 * a few reads, and it says its reasons.
 *
 * Two kinds of criterion, kept apart, because they are different promises:
 *
 *  - **Facts remove, with a reason.** A call that has closed, one already on
 *    the artist's list, one not yet cleared for delivery, one for residents of
 *    another province, one Scout cannot tell the kind of. Each is reported in
 *    `skipped` beside its reason, like every other skipped list in this app:
 *    "we found nine for you" without "and fourteen we could not place" is a
 *    worse answer than not finding them.
 *  - **Weights order, and remove nothing.** What the artist asked for, how far
 *    it is from where they live, whether it suits their music. These only move
 *    an entry up or down, because a ranker that hides what it scores low never
 *    learns it was wrong. Reach in particular is never a reason to drop an
 *    opportunity: Scout is for Canadian artists, many of whom play abroad.
 *
 * **A missing input is never a guess.** A listing with no genre tagged is not
 * "open to any genre", a place with no region is not "your province", and a
 * listing with no stated eligibility is not "open to anyone". Each is named in
 * `unknowns` on the match, and the screen says to check the listing.
 *
 * Pure, no clock and no database, like `nudgeRouting.ts`: `today` is an
 * argument and the route reads the rows.
 */

import { focusOfItem, whereIs, whereLabel, type Focus, type ItemFocus } from './artistFocus'
import { GENRES, type GenreId, type Profile } from './onboarding'

/** An entry that is public or not, and has been looked at or not, as the matcher needs it. */
export interface Eligibility {
  /** Province or state codes whose residents may apply. */
  residentOf?: string[]
  /** Organisations whose members may apply. */
  membership?: string[]
  minAge?: number
  maxAge?: number
  /** Anything else the listing says about who may apply. */
  notes?: string
}

export interface CatalogEntry {
  id: number
  category: string
  name: string
  organizer: string | null
  kind: string | null
  url: string | null
  deadline: string | null
  deadlineNote: string | null
  location: string | null
  country: string | null
  region: string | null
  genres: string[] | null
  eligibility: Eligibility | null
  opensAt: string | null
  feeAmount: number | null
  feeCurrency: string | null
  firstSeenAt: string
  /** null = after the holding period, 'approved' = now, 'blocked' = never. */
  delivery: string | null
  /**
   * What a sync organisation's own site says about being pitched. Read by the
   * first-run lanes (`shared/startLanes.ts`) and by nothing in `matchCatalog`,
   * which skips organisations. Absent on every other category.
   */
  org?: OrgTerms | null
}

/** A sync organisation's own words about submissions and exclusivity. Null is "no claim". */
export interface OrgTerms {
  site: string | null
  submissionPolicy: 'open' | 'closed' | null
  policyEvidence: string | null
  policyUrl: string | null
  policyCheckedAt: string | null
  exclusivity: 'non_exclusive' | 'exclusive' | null
  exclusivityEvidence: string | null
  exclusivityUrl: string | null
  /** When exclusivity was last looked for. Null is "never", which is not "found nothing". */
  termsReadAt: string | null
}

/**
 * How long a new entry waits before it can go into anybody's list on its own.
 *
 * Research reads pages written by strangers, and an entry that went straight
 * from a page to every artist's queue would let one poisoned page reach all of
 * them at once. Three days is the owner's window to look at what arrived and
 * block it; approving an entry skips the wait. Longer would hold back real
 * calls that close in a week, and shorter would be a window nobody could use.
 */
export const DELIVERY_HOLD_DAYS = 3

const DAY = 86_400_000

/** Whole days from `from` to `to`, both YYYY-MM-DD or ISO timestamps. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.round((b - a) / DAY)
}

export function isDeliverable(entry: Pick<CatalogEntry, 'delivery' | 'firstSeenAt'>, today: string): boolean {
  if (entry.delivery === 'blocked') return false
  if (entry.delivery === 'approved') return true
  const waited = daysBetween(entry.firstSeenAt, today)
  return !Number.isNaN(waited) && waited >= DELIVERY_HOLD_DAYS
}

export type SkipReason = 'closed' | 'yours' | 'unclear_kind' | 'sync_organisation' | 'residents'

export interface Skipped {
  entry: CatalogEntry
  reason: SkipReason
  /** In the artist's words, with the specific fact. */
  text: string
}

/** What the listing does not say, by what kind of thing it is, so a list can count them. */
export type UnknownCode = 'genre' | 'region' | 'eligibility' | 'deadline'

export interface Unknown {
  code: UnknownCode
  text: string
}

export interface Match {
  entry: CatalogEntry
  focus: ItemFocus | null
  /** The order this is in, from what they asked for. 0 is first. */
  penalty: number
  /** Why it is here, in a few short sentences. */
  reasons: string[]
  unknowns: Unknown[]
}

export interface MatchResult {
  /** In the order to show them. Nothing is dropped from this by reach or genre. */
  matches: Match[]
  skipped: Skipped[]
  /** Entries not yet cleared for delivery. Counted, never listed: they are not for anybody yet. */
  held: number
}

const GENRE_LABEL = new Map<string, string>(GENRES.map((g) => [g.id, g.label]))

const GOAL_LABEL = {
  gigs: 'gigs',
  grants: 'grants',
  sync: 'sync',
  promo: 'promotion',
  applications: 'applications',
  tracking: 'tracking',
} as const

const listOf = (items: string[]) => items.join(', ')

/** "Nov 20", from an ISO date. The year only when it is not this one. */
function dateText(iso: string, today: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] ?? '?'
  return `${month} ${d}${String(y) !== today.slice(0, 4) ? `, ${y}` : ''}`
}

/** The catalog category as a goal: festivals and showcases are gigs, funding is grants. */
function categoryGoal(category: string): 'gigs' | 'grants' | null {
  if (category === 'festival' || category === 'showcase') return 'gigs'
  if (category === 'funding') return 'grants'
  return null
}

function sameRegion(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a.toUpperCase() === b.toUpperCase()
}

export function matchCatalog(input: {
  entries: CatalogEntry[]
  focus: Focus | null
  profile: Profile | null
  /** Catalog ids already on the artist's list, whatever they did with them. */
  have: ReadonlySet<number>
  today: string
}): MatchResult {
  const { entries, focus, profile, have, today } = input
  const matches: Match[] = []
  const skipped: Skipped[] = []
  let held = 0

  for (const entry of entries) {
    if (!isDeliverable(entry, today)) {
      held++
      continue
    }
    if (have.has(entry.id)) {
      skipped.push({ entry, reason: 'yours', text: 'Already on your list.' })
      continue
    }
    if (entry.deadline && entry.deadline < today) {
      skipped.push({ entry, reason: 'closed', text: `Closed on ${dateText(entry.deadline, today)}.` })
      continue
    }
    if (entry.category === 'other') {
      skipped.push({ entry, reason: 'unclear_kind', text: 'Scout could not tell what kind of opportunity this is.' })
      continue
    }
    if (entry.category === 'sync') {
      // An organisation to pitch, which is a Sync target and means nothing
      // without a pitch. Listed so the artist knows it exists.
      skipped.push({ entry, reason: 'sync_organisation', text: 'A sync organisation. Add it on the Sync page to pitch it.' })
      continue
    }

    const residents = entry.eligibility?.residentOf ?? []
    const home = focus?.homeRegion ?? null
    if (residents.length > 0 && home && !residents.some((r) => sameRegion(r, home))) {
      skipped.push({ entry, reason: 'residents', text: `For residents of ${listOf(residents)}. You are in ${home}.` })
      continue
    }

    const reasons: string[] = []
    const unknowns: Unknown[] = []
    let penalty = 0

    // What they asked for.
    const goal = categoryGoal(entry.category)
    if (focus && focus.goals.length > 0 && goal) {
      if (focus.goals.includes(goal)) reasons.push(`Something you asked for: ${GOAL_LABEL[goal]}.`)
      else {
        reasons.push('Not one of the things you asked for, so it comes later.')
        penalty += 2
      }
    }

    // Where it is.
    const where = whereIs({ location: entry.location, country: entry.country }, home)
    const item = focusOfItem(
      { kind: 'gig', type: entry.category === 'funding' ? 'grant' : entry.category, location: entry.location, country: entry.country },
      focus,
    )
    if (where && where !== 'no_travel') {
      if (item?.reach === 'beyond') {
        reasons.push(`${whereLabel(where)}, beyond the reach you chose, so it comes later.`)
        penalty += 1
      } else {
        reasons.push(`${whereLabel(where)}.`)
      }
    } else if (where === null) {
      unknowns.push({ code: 'region', text: 'Scout could not tell where this is.' })
    }

    // Whether it suits their music. A weight, and only when both sides said.
    const wanted = profile?.genres ?? []
    if (entry.genres && entry.genres.length > 0) {
      if (wanted.length > 0) {
        const shared = entry.genres.filter((g): g is GenreId => wanted.includes(g as GenreId))
        if (shared.length > 0) reasons.push(`Suits your music: ${listOf(shared.map((g) => GENRE_LABEL.get(g) ?? g))}.`)
        else {
          reasons.push(`Listed for ${listOf(entry.genres.map((g) => GENRE_LABEL.get(g) ?? g))}, and you play something else, so it comes later.`)
          penalty += 1
        }
      }
    } else if (wanted.length > 0) {
      unknowns.push({ code: 'genre', text: 'The listing does not say what music it is for.' })
    }

    // Who may apply: never a reason to drop, always a reason to check.
    const e = entry.eligibility
    if (e) {
      if (residents.length > 0 && !home) {
        unknowns.push({ code: 'eligibility', text: `For residents of ${listOf(residents)}. Scout does not know your province yet.` })
      }
      if (e.membership && e.membership.length > 0) {
        unknowns.push({ code: 'eligibility', text: `Members of ${listOf(e.membership)} only. Check you qualify.` })
      }
      if (e.minAge !== undefined || e.maxAge !== undefined) {
        unknowns.push({ code: 'eligibility', text: 'There is an age limit. Check you qualify.' })
      }
      if (e.notes) unknowns.push({ code: 'eligibility', text: e.notes })
    } else {
      unknowns.push({ code: 'eligibility', text: 'The listing does not say who may apply. Check before you apply.' })
    }

    // When.
    if (entry.deadline) reasons.push(`Closes ${dateText(entry.deadline, today)}.`)
    else {
      unknowns.push({
        code: 'deadline',
        text: entry.deadlineNote ? `No closing date. The page says: ${entry.deadlineNote}.` : 'No closing date stated.',
      })
    }
    if (entry.opensAt && entry.opensAt > today) reasons.push(`Opens ${dateText(entry.opensAt, today)}.`)

    matches.push({ entry, focus: item, penalty, reasons, unknowns })
  }

  matches.sort(
    (a, b) =>
      a.penalty - b.penalty ||
      // Soonest to close first, and an undated call after every dated one: a
      // date that bites is the first thing worth looking at.
      (a.entry.deadline ?? '9999-12-31').localeCompare(b.entry.deadline ?? '9999-12-31') ||
      b.entry.firstSeenAt.localeCompare(a.entry.firstSeenAt) ||
      a.entry.name.localeCompare(b.entry.name),
  )

  return { matches, skipped, held }
}

/**
 * The paragraph that goes on the row as the reason it is there.
 *
 * Deterministic text, not a model's: it states what matched and names what the
 * listing did not say, so the artist reads a claim they can check. It ends by
 * saying to open the listing, because the catalog holds what a page said and
 * not what an organiser decided.
 */
export function explainMatch(match: Match): string {
  const parts = [...match.reasons]
  if (match.unknowns.length > 0) parts.push(`Not stated: ${match.unknowns.map((u) => u.text.replace(/\.$/, '')).join('; ')}.`)
  parts.push('Scout found this in its shared list. Read the listing before you apply.')
  return parts.join(' ')
}

/** How many matches have each kind of gap, for a summary line above the list. */
export function countUnknowns(matches: Match[]): Partial<Record<UnknownCode, number>> {
  const out: Partial<Record<UnknownCode, number>> = {}
  for (const m of matches) {
    for (const code of new Set(m.unknowns.map((u) => u.code))) out[code] = (out[code] ?? 0) + 1
  }
  return out
}

/** The skipped list grouped by reason, so "closed" is one line and not forty. */
export function groupSkipped(skipped: Skipped[]): Array<{ reason: SkipReason; count: number; example: string }> {
  const order: SkipReason[] = ['yours', 'closed', 'residents', 'sync_organisation', 'unclear_kind']
  return order
    .map((reason) => {
      const rows = skipped.filter((s) => s.reason === reason)
      return { reason, count: rows.length, example: rows[0]?.text ?? '' }
    })
    .filter((g) => g.count > 0)
}
