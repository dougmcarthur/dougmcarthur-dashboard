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
  { id: 'home', label: 'My province' },
  { id: 'canada', label: 'Across Canada' },
  { id: 'us', label: 'The United States' },
  { id: 'international', label: 'Overseas' },
] as const

export type ReachId = (typeof REACH)[number]['id']

export const GOAL_NOTE_MAX = 500

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

export type StepId = 'name' | 'goals' | 'profile' | 'google' | 'shows' | 'backup'

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
export function onboardingSteps(facts: OnboardingFacts, goals: Goals | null): OnboardingState {
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
