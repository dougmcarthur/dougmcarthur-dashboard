/**
 * What an artist said they want, read against what is in front of them.
 *
 * Scout asks two questions in the welcome flow, what it should help with and how
 * far the artist would go for the right opportunity, and for a long time stored
 * the answers and read them nowhere. This is where they are read.
 *
 * Two rules, and they are the repo's own:
 *
 * - **Weights order, facts remove, and this removes nothing.** A call beyond
 *   the reach somebody chose is not a mistake to hide, it is an opportunity to
 *   look at after the ones within reach, with the reason on it. A ranker that
 *   hides what it scores low never learns it was wrong
 *   (`docs/gig-pipeline-plan.md` §8). Scout is built for Canadian artists, many
 *   of whom play abroad, so "overseas" is never an error.
 * - **What was asked for outranks how far it is.** A grant when the artist said
 *   they want gigs sorts below a festival a flight away. Goals are the stronger
 *   statement, since reach is "I would", and goals are "I want".
 *
 * Only what is **undecided** is ordered by this. A gig the artist already said
 * yes to, or is waiting on, is where it is for other reasons.
 *
 * A missing input is never a guess. No home province set means "my province"
 * cannot be told apart from the rest of Canada, and an item is then neither
 * within reach nor beyond it. No goals or no reach chosen is no claim at all.
 *
 * Pure, no clock and no database, like `nudgeRouting.ts`: the route reads the
 * two settings and hands them in.
 */

import type { GoalId, Goals, ReachId } from './onboarding'
import { gigCategory } from './opportunityCatalog'
import { PROVINCES, homeRegionOf, regionOf } from './regions'

export { homeRegionOf, regionOf }

/** What the artist told Scout, with their province resolved from their home base. */
export interface Focus {
  goals: GoalId[]
  reach: ReachId[]
  /** Two-letter code, from the home base. Null until one is set. */
  homeRegion: string | null
}

/**
 * Null when there is nothing to read: no goals chosen and no reach chosen. A
 * caller then orders nothing, which is the honest answer to "they have not said".
 */
export function focusFrom(
  goals: Goals | null,
  homePlace: string | null | undefined,
  /** The province they said they live in, for an account with no home base yet. */
  profileRegion?: string | null,
): Focus | null {
  if (!goals || (goals.goals.length === 0 && goals.reach.length === 0)) return null
  // The home base is the more exact answer, so it wins; the province they said
  // in the welcome questions is what "my province" means until there is one.
  const said = profileRegion && profileRegion in PROVINCES ? profileRegion : null
  return { goals: goals.goals, reach: goals.reach, homeRegion: homeRegionOf(homePlace) ?? said }
}

/** How far an opportunity is from the artist, in the words of the reach question. */
export type Where = 'home' | 'canada' | 'us' | 'abroad' | 'no_travel'

const NO_TRAVEL = /\b(online|virtual|remote|national|nationwide|canada-wide|country-wide)\b/i

/**
 * Where an opportunity is, relative to home. Null when it cannot be told.
 *
 * The country column wins; a place that carries its own region ("Austin, TX")
 * stands in for a country nobody filled in. Online and nationwide programmes
 * are `no_travel`, because there is no trip for reach to be about.
 */
export function whereIs(
  row: { location?: string | null; country?: string | null },
  homeRegion: string | null,
): Where | null {
  if (NO_TRAVEL.test(row.location ?? '')) return 'no_travel'

  const region = regionOf(row.location)
  const stated = (row.country ?? '').toLowerCase().replace(/[.\s]+/g, ' ').trim()
  const country: 'CA' | 'US' | 'other' | null =
    ['ca', 'can', 'canada'].includes(stated)
      ? 'CA'
      : ['us', 'usa', 'u s', 'u s a', 'united states', 'united states of america', 'america'].includes(stated)
        ? 'US'
        : stated
          ? 'other'
          : (region?.country ?? null)

  if (country === null) return null
  if (country === 'US') return 'us'
  if (country === 'other') return 'abroad'
  // Canada. In the home province only when both are known and agree: an
  // unknown home is not the same as a different one, and Canada is the answer
  // that does not claim more than is known.
  return region && homeRegion && region.code === homeRegion ? 'home' : 'canada'
}

export type ReachVerdict = 'within' | 'beyond' | 'unknown'

/**
 * Whether a place is inside the reach the artist chose.
 *
 * "Across Canada" includes their own province; the others stand alone. Unknown
 * whenever it cannot be told, including a Canadian place when the artist chose
 * only "my province" and has not said which one that is.
 */
export function reachVerdict(where: Where | null, focus: Focus | null): ReachVerdict {
  if (!focus || focus.reach.length === 0 || where === null) return 'unknown'
  if (where === 'no_travel') return 'within'

  const chose = new Set(focus.reach)
  if (where === 'us') return chose.has('us') ? 'within' : 'beyond'
  if (where === 'abroad') return chose.has('international') ? 'within' : 'beyond'

  // Canada.
  if (chose.has('canada')) return 'within'
  if (where === 'home') return chose.has('home') ? 'within' : 'beyond'
  // Elsewhere in Canada, and they chose a narrower reach than that. Only
  // "beyond" when their own province is known; otherwise "elsewhere" might be
  // home.
  return focus.homeRegion ? 'beyond' : 'unknown'
}

export type GoalVerdict = 'match' | 'other' | 'unknown'

/** Which of the welcome flow's goals an opportunity serves, when it names one. */
export function goalOf(item: { kind: 'gig' | 'sync' | 'promo'; type?: string | null }): GoalId | null {
  if (item.kind === 'sync') return 'sync'
  if (item.kind === 'promo') return 'promo'
  const category = gigCategory(item.type)
  if (category === 'funding') return 'grants'
  if (category === 'festival' || category === 'showcase') return 'gigs'
  // A venue, a residency, a contest: the type column is free text, and none of
  // them is plainly one goal. No claim rather than a guess.
  return null
}

export function goalVerdict(goal: GoalId | null, focus: Focus | null): GoalVerdict {
  if (!focus || focus.goals.length === 0 || goal === null) return 'unknown'
  return focus.goals.includes(goal) ? 'match' : 'other'
}

/** What the queue carries on an item: both verdicts, the place, and the order. */
export interface ItemFocus {
  goal: GoalVerdict
  reach: ReachVerdict
  where: Where | null
  /**
   * 0 is first. What was asked for counts for two and distance for one, so a
   * grant nobody asked for sorts below a festival a flight away.
   */
  penalty: number
}

export function focusOfItem(
  item: { kind: 'gig' | 'sync' | 'promo'; type?: string | null; location?: string | null; country?: string | null },
  focus: Focus | null,
): ItemFocus | null {
  if (!focus) return null
  const where = item.kind === 'gig' ? whereIs(item, focus.homeRegion) : null
  const goal = goalVerdict(goalOf(item), focus)
  const reach = reachVerdict(where, focus)
  return { goal, reach, where, penalty: (goal === 'other' ? 2 : 0) + (reach === 'beyond' ? 1 : 0) }
}

const WHERE_LABEL: Record<Where, string> = {
  home: 'In your province',
  canada: 'Elsewhere in Canada',
  us: 'In the United States',
  abroad: 'Overseas',
  no_travel: 'No travel',
}

export function whereLabel(where: Where): string {
  return WHERE_LABEL[where]
}

/**
 * The chip on an item beyond the reach somebody chose. Said as a fact about
 * the place with the choice named, since "outside your reach" alone reads as a
 * verdict on the opportunity.
 */
export function beyondReachNote(focus: ItemFocus): string | null {
  if (focus.reach !== 'beyond' || focus.where === null) return null
  return `${whereLabel(focus.where)}, beyond the reach you chose`
}
