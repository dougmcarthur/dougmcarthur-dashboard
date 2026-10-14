/**
 * The database half of matching the shared catalog to an artist.
 *
 * The rules are in `shared/catalogMatch.ts` and read no database. This reads
 * the catalog (which belongs to nobody) and the artist's own rows, hands them
 * in, and writes what comes out as rows on the artist's side: New-stage gigs,
 * linked to the entry by `opportunity_id` and marked `origin = 'catalog'`.
 *
 * Writing them as gig rows rather than keeping a second list is the point: the
 * queue, the deadlines, the nudges, the application panel, the decision log
 * and the pass-or-apply cards all read `gig_opportunities`, so a match is
 * triaged by exactly the machinery everything else is.
 *
 * Three properties:
 *
 *  - **A catalog entry is added to an artist at most once, ever.** The ids
 *    already offered are remembered (`matching.added`), so a row the artist
 *    deletes is not added again tomorrow. Without it, "remove" would mean
 *    "show me again tonight".
 *  - **The automatic path adds only what they asked for.** The starter set is a
 *    preview the artist confirms, and may include a call beyond their reach,
 *    since they can see it. The daily trickle is nobody confirming anything, so
 *    it adds only entries with no penalty: what they asked for, within the
 *    reach they chose. The rest are in the preview when they ask.
 *  - **It says so.** The daily run rings the bell with an event, because "three
 *    new matches for you" is not recoverable from tomorrow's state.
 */

import { desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, opportunities, syncTargets } from '../db/schema'
import { scoped, withTenant, type TenantId } from '../db/scope'
import { gigStatusColumns } from '../db/gigRows'
import { focusFor } from './focus'
import { readHome } from './travelEnrich'
import { readTenantSetting, writeTenantSetting, clearTenantSetting } from './nudgeSettings'
import { recordEvent } from './notificationEvents'
import {
  explainMatch,
  matchCatalog,
  type CatalogEntry,
  type Eligibility,
  type Match,
  type MatchResult,
  type OrgTerms,
} from '../../shared/catalogMatch'
import { ONBOARDING_KEYS, parseGoals, parseProfile, type Profile } from '../../shared/onboarding'
import { homeRegionOf } from '../../shared/artistFocus'
import { PROVINCES } from '../../shared/regions'
import { buildStartLanes, syncCandidates, type StartLanes, type SyncRow } from '../../shared/startLanes'
import type { Focus } from '../../shared/artistFocus'
import type { Env } from '../types'

export const MATCHING_KEYS = {
  /** Present when the artist has switched suggestions off. */
  off: 'matching.off',
  /** When the starter set was answered, by adding it or declining it. */
  starterAt: 'matching.starterAt',
  /** JSON array of catalog ids already offered, newest last. */
  added: 'matching.added',
} as const

/** How many the starter set adds. Enough to look like something, few enough to read. */
export const STARTER_LIMIT = 12
/** How many the daily run adds. A trickle: nobody is asked to triage forty a morning. */
export const DAILY_LIMIT = 5
/** The daily run only looks at entries this new, so it is news and not the backlog. */
export const FRESH_DAYS = 30
/** Bounded, because it is a list in one setting row. */
const ADDED_MAX = 3000

const KIND_LABEL: Record<string, string> = { festival: 'Festival', showcase: 'Showcase', funding: 'Grant' }

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    // A value nobody can read is "no claim", never "anyone".
    return null
  }
}

type Row = typeof opportunities.$inferSelect

/** What an organisation's own site said, for an entry that is one. Null for every other kind. */
function orgOf(row: Row): OrgTerms | null {
  if (row.category !== 'sync') return null
  const policy = row.submissionPolicy === 'open' || row.submissionPolicy === 'closed' ? row.submissionPolicy : null
  const exclusivity =
    row.exclusivity === 'non_exclusive' || row.exclusivity === 'exclusive' ? row.exclusivity : null
  return {
    site: row.site,
    submissionPolicy: policy,
    policyEvidence: row.policyEvidence,
    policyUrl: row.policyUrl,
    policyCheckedAt: row.policyCheckedAt,
    exclusivity,
    exclusivityEvidence: row.exclusivityEvidence,
    exclusivityUrl: row.exclusivityUrl,
    termsReadAt: row.termsReadAt,
  }
}

export function toEntry(row: Row): CatalogEntry {
  const genres = parseJson<string[]>(row.genres)
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    organizer: row.organizer,
    kind: row.kind,
    url: row.url,
    deadline: row.deadline,
    deadlineNote: row.deadlineNote,
    location: row.location,
    country: row.country,
    region: row.region,
    genres: Array.isArray(genres) ? genres.filter((g) => typeof g === 'string') : null,
    eligibility: parseJson<Eligibility>(row.eligibility),
    opensAt: row.opensAt,
    feeAmount: row.feeAmount,
    feeCurrency: row.feeCurrency,
    firstSeenAt: row.firstSeenAt,
    delivery: row.delivery,
    reopenedAt: row.reopenedAt,
    org: orgOf(row),
  }
}

async function readAdded(env: Env, tenant: TenantId): Promise<number[]> {
  const ids = parseJson<unknown>(await readTenantSetting(env, tenant, MATCHING_KEYS.added))
  return Array.isArray(ids) ? ids.filter((n): n is number => Number.isInteger(n)) : []
}

async function writeAdded(env: Env, tenant: TenantId, ids: number[]): Promise<void> {
  await writeTenantSetting(env, tenant, MATCHING_KEYS.added, JSON.stringify(ids.slice(-ADDED_MAX)))
}

export interface Plan extends MatchResult {
  focus: Focus | null
  profile: Profile | null
  /** Whether the artist has told Scout anything to match on. */
  said: boolean
  /** Ids already offered, so a row they removed is not offered again. */
  added: Set<number>
  /** The whole catalog as the matcher saw it, for the lanes that read organisations. */
  entries: CatalogEntry[]
}

/**
 * What would be shown to this artist now, and why the rest is not.
 *
 * Reads the whole catalog, which is a few hundred rows, and filters in code:
 * the rules are pure, and a SQL version of them would be a second copy that
 * could disagree.
 */
export async function planMatches(env: Env, tenant: TenantId, today: string): Promise<Plan> {
  const db = getDb(env.DB)
  const [rows, linked, focus, profileRaw, offered] = await Promise.all([
    db.select().from(opportunities).limit(5000),
    db
      .select({ id: gigOpportunities.opportunityId })
      .from(gigOpportunities)
      .where(scoped(gigOpportunities, tenant, isNotNull(gigOpportunities.opportunityId))),
    focusFor(env, tenant),
    readTenantSetting(env, tenant, ONBOARDING_KEYS.profile),
    readAdded(env, tenant),
  ])
  const profile = parseProfile(profileRaw)
  const added = new Set(offered)
  const have = new Set([...linked.map((r) => r.id).filter((id): id is number => id !== null), ...added])
  const entries = rows.map(toEntry)

  return {
    ...matchCatalog({ entries, focus, profile, have, today }),
    focus,
    profile,
    said: focus !== null || (profile?.region ?? null) !== null || (profile?.genres.length ?? 0) > 0,
    added,
    entries,
  }
}

/**
 * Where the artist is, for "in your province", from the most exact thing said.
 *
 * The home base from Settings, then the province they chose in the welcome
 * questions. Read here and not from `focusFor`, which is null until goals are
 * chosen: the first screen has to be able to say a province before there are
 * any, and an account with neither has no province, which the lane then asks
 * for instead of guessing.
 */
export async function provinceFor(env: Env, tenant: TenantId, profile: Profile | null): Promise<string | null> {
  const home = await readHome(env, tenant)
  const fromHome = homeRegionOf(home?.place ?? null)
  if (fromHome) return fromHome
  const said = profile?.region ?? null
  return said && said in PROVINCES ? said : null
}

/** Catalog ids of the sync organisations already on this artist's Sync list. */
async function syncOnList(env: Env, tenant: TenantId): Promise<Set<number>> {
  const rows = await getDb(env.DB)
    .select({ id: syncTargets.opportunityId })
    .from(syncTargets)
    .where(scoped(syncTargets, tenant, isNotNull(syncTargets.opportunityId)))
  return new Set(rows.map((r) => r.id).filter((id): id is number => id !== null))
}

export interface StartPlan {
  lanes: StartLanes
  /** The whole plan, so the route that adds can check an id against what is offered. */
  plan: Plan
  /** Sync organisations that may be added, shown or not: the server's own list, never the browser's. */
  syncAddable: Map<number, SyncRow>
}

/**
 * What an account with nothing on it is shown, and what it may add.
 *
 * Reads no more than the starter preview does plus the artist's own Sync rows,
 * and writes nothing. `syncAddable` is every organisation the lane would offer
 * or list, so the add route checks the id it was given against this and never
 * against the screen that sent it.
 */
export async function planStart(env: Env, tenant: TenantId, today: string): Promise<StartPlan> {
  const [plan, haveSync, goalsRaw] = await Promise.all([
    planMatches(env, tenant, today),
    syncOnList(env, tenant),
    readTenantSetting(env, tenant, ONBOARDING_KEYS.goals),
  ])
  const home = await provinceFor(env, tenant, plan.profile)
  const goals = parseGoals(goalsRaw)?.goals ?? []

  const lanes = buildStartLanes({ matches: plan.matches, entries: plan.entries, haveSync, home, goals, today })
  const candidates = syncCandidates(plan.entries, haveSync, today)
  return {
    lanes,
    plan,
    syncAddable: new Map([...candidates.stated, ...candidates.unclear].map((row) => [row.id, row])),
  }
}

export interface AddedSync {
  id: number
  name: string
}

/** The artist's own Sync row for a catalog organisation, if they have one. */
export async function findSyncTarget(env: Env, tenant: TenantId, entryId: number): Promise<AddedSync | null> {
  const row = await getDb(env.DB)
    .select({ id: syncTargets.id, name: syncTargets.name })
    .from(syncTargets)
    .where(scoped(syncTargets, tenant, eq(syncTargets.opportunityId, entryId)))
    .get()
  return row ?? null
}

/**
 * Put one sync organisation on the artist's Sync list, as a target to research.
 *
 * Linked to the catalog entry, and carrying the policy its own site stated
 * with the sentence, so the Sync page's gate reads "takes submissions" with the
 * evidence beside it and not an unchecked row. It starts `draft_ready`, which
 * is where the Sync page's own form starts a target typed in by hand, and the
 * pitch gate and the deck both already read the terms on it.
 *
 * Idempotent: an organisation already linked is returned as it is, so two taps
 * on Add file one row.
 */
export async function addSyncTarget(
  env: Env,
  tenant: TenantId,
  entry: CatalogEntry,
  now: string,
): Promise<AddedSync | null> {
  const existing = await findSyncTarget(env, tenant, entry.id)
  if (existing) return existing

  const org = entry.org
  const [row] = await getDb(env.DB)
    .insert(syncTargets)
    .values(
      withTenant(tenant, {
        name: entry.name,
        agencyType: entry.kind,
        website: org?.site ?? null,
        status: 'draft_ready',
        notes: 'Added from Scout’s shared list. Read their terms yourself before you sign anything.',
        opportunityId: entry.id,
        submissionPolicy: org?.submissionPolicy ?? null,
        policyEvidence: org?.policyEvidence ?? null,
        policyUrl: org?.policyUrl ?? null,
        policyCheckedAt: org?.policyCheckedAt ?? null,
        discoveredAt: now,
        updatedAt: now,
      }),
    )
    .returning({ id: syncTargets.id, name: syncTargets.name })
  return row
}

/**
 * Write matches onto the artist's list, as New-stage rows.
 *
 * Checks again which are already there, because the plan may be minutes old:
 * two taps on Add, or the daily run landing beside a starter set, must not file
 * the same call twice.
 */
export async function addMatches(env: Env, tenant: TenantId, matches: Match[], now: string): Promise<Match[]> {
  if (matches.length === 0) return []
  const db = getDb(env.DB)
  const ids = matches.map((m) => m.entry.id)
  const present = new Set(
    (
      await db
        .select({ id: gigOpportunities.opportunityId })
        .from(gigOpportunities)
        .where(scoped(gigOpportunities, tenant, inArray(gigOpportunities.opportunityId, ids)))
    ).map((r) => r.id),
  )

  const added: Match[] = []
  for (const match of matches) {
    if (present.has(match.entry.id)) continue
    await insertCatalogGig(env, tenant, match, now)
    added.push(match)
  }

  if (added.length > 0) {
    const before = await readAdded(env, tenant)
    await writeAdded(env, tenant, [...before, ...added.map((m) => m.entry.id)])
  }
  return added
}

/**
 * One New-stage row on an artist's side, copied from a catalog entry.
 *
 * Its own function so that filing a match and re-offering a programme's next
 * intake cannot drift into two spellings of the same insert. `fitRationale`
 * defaults to the matcher's account of why; a re-offer puts its own sentence
 * ahead of it.
 */
export async function insertCatalogGig(
  env: Env,
  tenant: TenantId,
  match: Match,
  now: string,
  fitRationale: string = explainMatch(match),
): Promise<void> {
  const e = match.entry
  await getDb(env.DB)
    .insert(gigOpportunities)
    .values(
      withTenant(tenant, {
        name: e.name,
        type: e.kind ?? KIND_LABEL[e.category] ?? 'Opportunity',
        organizer: e.organizer,
        url: e.url,
        deadline: e.deadline,
        deadlineNote: e.deadlineNote,
        opensAt: e.opensAt,
        location: e.location,
        country: e.country,
        feeAmount: e.feeAmount,
        feeCurrency: e.feeAmount !== null ? (e.feeCurrency ?? 'USD') : 'USD',
        paid: e.feeAmount !== null && e.feeAmount > 0 ? 1 : 0,
        fitRationale,
        ...gigStatusColumns('discovered'),
        opportunityId: e.id,
        origin: 'catalog',
        discoveredAt: now,
        updatedAt: now,
      }),
    )
}

/** What the starter set would add: the best matches, none of them a penalty of two or more. */
export function starterSet(plan: Plan): Match[] {
  return plan.matches.filter((m) => m.penalty < 2).slice(0, STARTER_LIMIT)
}

export async function suggestionsOff(env: Env, tenant: TenantId): Promise<boolean> {
  return (await readTenantSetting(env, tenant, MATCHING_KEYS.off)) !== null
}

export async function setSuggestions(env: Env, tenant: TenantId, on: boolean): Promise<void> {
  if (on) await clearTenantSetting(env, tenant, MATCHING_KEYS.off)
  else await writeTenantSetting(env, tenant, MATCHING_KEYS.off, new Date().toISOString())
}

export async function markStarterAnswered(env: Env, tenant: TenantId, now: string): Promise<void> {
  await writeTenantSetting(env, tenant, MATCHING_KEYS.starterAt, now)
}

export async function starterAnswered(env: Env, tenant: TenantId): Promise<boolean> {
  return (await readTenantSetting(env, tenant, MATCHING_KEYS.starterAt)) !== null
}

export interface DailyResult {
  added: number
  skipped: 'off' | 'nothing_said' | null
}

/**
 * The daily run, for one artist: new matches, a few at a time, with a bell
 * event saying so.
 *
 * Only what is fresh, only what they asked for, and at most `DAILY_LIMIT`. An
 * artist who has switched suggestions off, or who has told Scout nothing to
 * match on, gets nothing and no event.
 */
export async function matchNewForTenant(env: Env, tenant: TenantId, today: string, now: string): Promise<DailyResult> {
  if (await suggestionsOff(env, tenant)) return { added: 0, skipped: 'off' }
  const plan = await planMatches(env, tenant, today)
  if (!plan.said) return { added: 0, skipped: 'nothing_said' }

  const since = new Date(Date.parse(`${today}T00:00:00Z`) - FRESH_DAYS * 86_400_000).toISOString().slice(0, 10)
  const fresh = plan.matches.filter((m) => m.penalty === 0 && m.entry.firstSeenAt.slice(0, 10) >= since).slice(0, DAILY_LIMIT)
  const added = await addMatches(env, tenant, fresh, now)
  if (added.length === 0) return { added: 0, skipped: null }

  await recordEvent(env, tenant, {
    kind: 'automation',
    tier: 'info',
    title: `${added.length} new ${added.length === 1 ? 'match' : 'matches'} for you`,
    body: added.map((m) => m.entry.name).join(', '),
    href: '#gigs',
    action: 'Open gigs',
    dedupeKey: `matching:${today}`,
  })
  return { added: added.length, skipped: null }
}

/** Entries the owner may want to look at: newest first, with what delivery says about each. */
export async function recentCatalog(env: Env, limit = 100) {
  return getDb(env.DB).select().from(opportunities).orderBy(desc(opportunities.firstSeenAt)).limit(limit)
}
