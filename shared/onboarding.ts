/**
 * The first-run checklist: what a new account still needs, derived from what
 * is already on file.
 *
 * It is a **condition**, not a record of progress. Every step is read off
 * state that exists for its own reasons — a name on the tenant, rows in the
 * library, a Google grant — so a step that was done elsewhere (connecting
 * Google from Settings, importing a profile from the Artist page) is ticked
 * without anybody visiting the checklist, and a step that is undone again
 * (the last grant disconnected) comes back. A "completed step 3" row would be
 * a second place for that truth to drift from.
 *
 * The one thing stored is what the artist *told* Scout: their goals. Nothing
 * else could answer that.
 *
 * No clock and no database, like `nudgeRouting.ts`; the route reads the facts
 * and hands them in.
 */

/** What somebody might want out of Scout. The order is the order shown. */
export const GOALS = [
  { id: 'gigs', label: 'Find gigs, festivals and showcases' },
  { id: 'grants', label: 'Find grants, awards and funding' },
  { id: 'sync', label: 'Pitch my music for film, TV and ads' },
  { id: 'applications', label: 'Spend less time on applications' },
  { id: 'tracking', label: 'Stay on top of deadlines and replies' },
  { id: 'promo', label: 'Plan promotion around a release' },
] as const

export type GoalId = (typeof GOALS)[number]['id']

/** How far from home somebody is willing to go. Several can be true at once. */
export const REACH = [
  { id: 'home', label: 'My province or territory' },
  { id: 'canada', label: 'Across Canada' },
  { id: 'us', label: 'The United States' },
  { id: 'international', label: 'Overseas' },
] as const

export type ReachId = (typeof REACH)[number]['id']

/** Where the answers are stored, in `tenant_settings`. Shared so a reader and the writer cannot drift. */
export const ONBOARDING_KEYS = {
  goals: 'onboarding.goals',
  profile: 'onboarding.profile',
  hiddenAt: 'onboarding.hiddenAt',
} as const

export const GOAL_NOTE_MAX = 500

/**
 * Where an artist is based, for the one question that has to be answered in
 * Canada's terms: which province or territory. Scout is built for Canadian
 * artists, and a province is what "my province" means, what an association is
 * called after, and the unit funding is decided in. `abroad` is a real answer
 * rather than an error, since the product is for Canadians and not only for
 * people who currently live here.
 */
export const REGIONS = [
  { id: 'AB', label: 'Alberta' },
  { id: 'BC', label: 'British Columbia' },
  { id: 'MB', label: 'Manitoba' },
  { id: 'NB', label: 'New Brunswick' },
  { id: 'NL', label: 'Newfoundland and Labrador' },
  { id: 'NS', label: 'Nova Scotia' },
  { id: 'NT', label: 'Northwest Territories' },
  { id: 'NU', label: 'Nunavut' },
  { id: 'ON', label: 'Ontario' },
  { id: 'PE', label: 'Prince Edward Island' },
  { id: 'QC', label: 'Quebec' },
  { id: 'SK', label: 'Saskatchewan' },
  { id: 'YT', label: 'Yukon' },
  { id: 'abroad', label: 'Outside Canada' },
] as const

export type RegionId = (typeof REGIONS)[number]['id']

/**
 * What an artist plays, from a closed list: a genre is only useful to match on
 * if two artists who mean the same thing pick the same word. Up to three,
 * because an artist who ticks eleven has told Scout nothing.
 */
export const GENRES = [
  { id: 'folk', label: 'Folk' },
  { id: 'roots', label: 'Roots and Americana' },
  { id: 'country', label: 'Country' },
  { id: 'singer_songwriter', label: 'Singer-songwriter' },
  { id: 'rock', label: 'Rock' },
  { id: 'pop', label: 'Pop' },
  { id: 'indie', label: 'Indie' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'blues', label: 'Blues' },
  { id: 'classical', label: 'Classical' },
  { id: 'hip_hop', label: 'Hip-hop' },
  { id: 'rnb_soul', label: 'R&B and soul' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'punk_metal', label: 'Punk and metal' },
  { id: 'world', label: 'World and traditional' },
] as const

export type GenreId = (typeof GENRES)[number]['id']

export const MAX_GENRES = 3
export const CITY_MAX = 60

/** What the artist said about themselves. Every part is optional. */
export interface Profile {
  region: RegionId | null
  city: string | null
  genres: GenreId[]
}

const REGION_IDS = new Set<string>(REGIONS.map((r) => r.id))
const GENRE_IDS = new Set<string>(GENRES.map((g) => g.id))

/**
 * Read a stored profile back, dropping anything this build does not know.
 *
 * Null when nothing usable is stored, for the reason `parseGoals` gives:
 * "they have not told us" is the honest reading of an answer nobody can read.
 */
export function parseProfile(raw: string | null | undefined): Profile | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const region = typeof v.region === 'string' && REGION_IDS.has(v.region) ? (v.region as RegionId) : null
  const city = typeof v.city === 'string' && v.city.trim() ? v.city.trim().slice(0, CITY_MAX) : null
  const genres = Array.isArray(v.genres)
    ? ([...new Set(v.genres.filter((g): g is string => typeof g === 'string' && GENRE_IDS.has(g)))].slice(0, MAX_GENRES) as GenreId[])
    : []
  if (!region && !city && genres.length === 0) return null
  return { region, city, genres }
}

/**
 * Where they travel from, as far as a guess needs it, from what they said.
 *
 * Only a Canadian province counts: "outside Canada" is a real answer that
 * names no province to measure from. The place is built only when there is a
 * city, so a guess never claims a town nobody gave.
 */
export function profileHome(profile: Profile | null): { region: string; place: string | null } | null {
  if (!profile?.region || profile.region === 'abroad') return null
  return { region: profile.region, place: profile.city ? `${profile.city}, ${profile.region}` : null }
}

export interface Goals {
  goals: GoalId[]
  reach: ReachId[]
  /** Anything else, in their words. Null when nothing was said. */
  note: string | null
}

const GOAL_IDS = new Set<string>(GOALS.map((g) => g.id))
const REACH_IDS = new Set<string>(REACH.map((r) => r.id))

/**
 * Read a stored value back, dropping anything this build does not know.
 *
 * Null when nothing usable is stored — including a row whose JSON cannot be
 * parsed. "They have not told us" is the honest reading of an unreadable
 * answer; an empty selection would be a claim that they want nothing.
 */
export function parseGoals(raw: string | null | undefined): Goals | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const list = (x: unknown, known: Set<string>) =>
    Array.isArray(x) ? [...new Set(x.filter((i): i is string => typeof i === 'string' && known.has(i)))] : []
  const note = typeof v.note === 'string' && v.note.trim() ? v.note.trim().slice(0, GOAL_NOTE_MAX) : null
  return {
    goals: list(v.goals, GOAL_IDS) as GoalId[],
    reach: list(v.reach, REACH_IDS) as ReachId[],
    note,
  }
}

/** What the route can find out about an account without anybody telling it. */
export interface OnboardingFacts {
  displayName: string | null
  /** Rows in the artist library. */
  libraryEntries: number
  /** Reference documents — a bio, a press kit, a style guide. */
  documents: number
  /** Any association or Manitoba Music profile connected. */
  profileConnected: boolean
  /** Any Google service connected, on any account. */
  googleConnected: boolean
  /** Whether Google can be connected on this deployment at all. */
  googleAvailable: boolean
  bandsintownConnected: boolean
  /** This person's own passkeys. */
  passkeys: number
}

export type StepId = 'name' | 'about' | 'goals' | 'profile' | 'google' | 'shows' | 'backup'

export interface OnboardingStep {
  id: StepId
  title: string
  /** Why it matters, in one sentence. Never how the app works inside. */
  why: string
  done: boolean
  /** Optional steps never hold back "you're set up". */
  optional: boolean
  /** Where the work is done, or null when it is done on the checklist itself. */
  href: string | null
  action: string
}

export interface OnboardingState {
  steps: OnboardingStep[]
  /** Required steps done, over required steps. */
  done: number
  total: number
  complete: boolean
}

/**
 * The steps, in the order that makes the next one useful.
 *
 * The profile comes before Google because it is what everything else reads —
 * an application panel with an empty library says "nothing on file" on every
 * field. Goals come second because they decide which optional steps are worth
 * offering: somebody who only pitches to music supervisors has no use for a
 * tour-date connection.
 */
export function onboardingSteps(
  facts: OnboardingFacts,
  goals: Goals | null,
  profile: Profile | null = null,
): OnboardingState {
  const wants = (id: GoalId) => goals?.goals.includes(id) ?? false
  const hasProfile = facts.libraryEntries > 0 || facts.profileConnected || facts.documents > 0

  const steps: OnboardingStep[] = [
    {
      id: 'name',
      title: 'Add your artist name',
      why: 'The name you perform or release music under.',
      done: Boolean(facts.displayName),
      optional: false,
      // Asked in the welcome questions, like goals, rather than on Settings.
      href: null,
      action: 'Add your name',
    },
    {
      id: 'about',
      title: 'Say where you’re based and what you play',
      why: 'So Scout can tell which opportunities are close and which are a trip, and what suits your music.',
      done: profile !== null && (profile.region !== null || profile.genres.length > 0),
      // Never holds back "you are set up": it sharpens what Scout shows, and an
      // account without it still works.
      optional: true,
      href: null,
      action: 'Answer',
    },
    {
      id: 'goals',
      title: 'Tell Scout what you’re looking for',
      why: 'Four quick questions. Your answers decide what Scout suggests first.',
      done: goals !== null && goals.goals.length > 0,
      optional: false,
      href: null,
      action: 'Start',
    },
    {
      id: 'profile',
      title: 'Build your artist profile',
      why:
        'Your bio, links, photos and key facts. Scout fills in applications and pitches from ' +
        'your profile, so until it has something, every answer comes up blank.',
      done: hasProfile,
      optional: false,
      href: '#artist',
      action: 'Open your profile',
    },
  ]

  if (facts.googleAvailable) {
    steps.push({
      id: 'google',
      title: 'Connect your Google account',
      why:
        'Confirmed shows go on a calendar, deadlines become tasks, and drafts can wait in ' +
        'your Gmail drafts folder. Scout never sends email for you.',
      done: facts.googleConnected,
      optional: false,
      href: '#settings/connections',
      action: 'Connect Google',
    })
  }

  // Tour dates only matter to somebody looking for shows. Offered to everybody
  // who has not said, because not having said is not the same as not wanting.
  if (goals === null || wants('gigs') || wants('tracking')) {
    steps.push({
      id: 'shows',
      title: 'Connect Bandsintown',
      why: 'Your upcoming shows appear on your profile and share page automatically.',
      done: facts.bandsintownConnected,
      optional: true,
      href: '#settings/connections',
      action: 'Connect',
    })
  }

  steps.push({
    id: 'backup',
    title: 'Add a backup passkey',
    why:
      'On a second device or in a password manager, so losing your phone doesn’t lock you ' +
      'out.',
    done: facts.passkeys >= 2,
    optional: true,
    href: '#settings/account',
    action: 'Add a passkey',
  })

  const required = steps.filter((s) => !s.optional)
  const done = required.filter((s) => s.done).length
  return { steps, done, total: required.length, complete: done === required.length }
}

/**
 * What a new account can expect next, by goal.
 *
 * Deliberately modest. Nothing here claims research runs by itself for an
 * account nobody has set it up for — the first version of a welcome screen
 * that promises "opportunities will appear" to an account where none will is
 * the screen that loses the tester's trust on day three.
 */
export function nextSteps(goals: Goals | null): Array<{ label: string; href: string }> {
  const wants = (id: GoalId) => goals?.goals.includes(id) ?? false
  const out: Array<{ label: string; href: string }> = []
  if (!goals || wants('gigs') || wants('grants') || wants('applications')) {
    out.push({ label: 'Add a gig or grant you already know about', href: '#gigs' })
  }
  if (wants('sync')) out.push({ label: 'Add music supervisors to pitch', href: '#sync' })
  if (!goals || wants('tracking')) {
    out.push({ label: 'Choose where reminders go', href: '#settings/reminders' })
  }
  return out
}
