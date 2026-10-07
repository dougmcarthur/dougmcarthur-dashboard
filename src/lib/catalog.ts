/**
 * Writing to the shared catalog, and linking artists' rows to it.
 *
 * The rules are in `shared/opportunityCatalog.ts`; this is the database half.
 * Three properties:
 *
 *  - **A catalog write never names a constraint.** It reads by key and then
 *    inserts or updates, for the reason `storeGrant` gives: an `ON CONFLICT`
 *    target is part of an interface, and the unique index exists only to turn
 *    a race between two artists' agents into an error this code catches and
 *    resolves by reading again.
 *  - **A later sighting fills gaps and never overwrites.** The first artist's
 *    research sets the facts; another artist's agent finding the same call
 *    adds a missing deadline but cannot rewrite a name every artist reads.
 *    One research session reading a poisoned page must not be able to change
 *    what everybody else sees.
 *  - **Only research is published by default.** A row an agent filed is a
 *    call it found on a public page. A row the artist typed in may be a
 *    private arrangement — a house concert, an offer made to them — so it is
 *    catalogued hidden, and the owner can show it from the admin surface.
 *  - **Linking is best-effort, and retried.** A catalog failure must never
 *    cost an artist the gig they just filed; the row stands, and the nightly
 *    housekeeping (`relinkMissing`) links it. The backfill below is one-shot —
 *    it runs until its marker is written and then never again — so it is not
 *    what catches a row that failed to link next month.
 */

import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, opportunities, syncTargets } from '../db/schema'
import { scoped, type TenantId } from '../db/scope'
import {
  catalogKey,
  factsFromGig,
  factsFromSync,
  fillMissing,
  publishable,
  syncCategory,
  type CatalogFacts,
} from '../../shared/opportunityCatalog'
import { gigStage, gigStatusFromStored } from '../../shared/gigStage'
import { ONCE_KEYS, readSetting, writeSetting } from './settings'
import type { Env } from '../types'

async function findByKey(env: Env, key: string) {
  return getDb(env.DB).select().from(opportunities).where(eq(opportunities.catalogKey, key)).get()
}

/** The catalog id for these facts, creating the entry the first time. */
export async function catalogue(
  env: Env,
  facts: CatalogFacts,
  keyInput: { applicationUrl?: string | null },
  now: string,
  mayPublish: boolean,
): Promise<number> {
  const db = getDb(env.DB)
  const key = catalogKey({ ...facts, applicationUrl: keyInput.applicationUrl })
  const existing = await findByKey(env, key)
  if (existing) {
    await db
      .update(opportunities)
      .set({ ...fillMissing({ ...existing, category: existing.category as CatalogFacts['category'] }, facts), lastSeenAt: now })
      .where(eq(opportunities.id, existing.id))
    return existing.id
  }
  try {
    const [row] = await db
      .insert(opportunities)
      .values({
        catalogKey: key,
        ...facts,
        // Set once, at first sighting. A later sighting never flips it, so an
        // entry the owner hid stays hidden whoever finds it next.
        public: mayPublish && publishable(facts) ? 1 : 0,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .returning({ id: opportunities.id })
    return row.id
  } catch (err) {
    // Two agents filing the same call at once: the other insert won, so
    // this one reads what it wrote.
    const again = await findByKey(env, key)
    if (again) return again.id
    throw err
  }
}

/**
 * Catalogue a gig row and link it. Swallows failure — see the module note — and
 * says whether it worked, for the caller that counts.
 */
export async function linkGig(
  env: Env,
  tenant: TenantId,
  gig: Parameters<typeof factsFromGig>[0] & { id: number },
  now: string,
  mayPublish: boolean,
): Promise<boolean> {
  try {
    const id = await catalogue(env, factsFromGig(gig), gig, now, mayPublish)
    await getDb(env.DB)
      .update(gigOpportunities)
      .set({ opportunityId: id })
      .where(scoped(gigOpportunities, tenant, eq(gigOpportunities.id, gig.id)))
    return true
  } catch (err) {
    console.error('catalog link failed (gig):', err)
    return false
  }
}

/** Catalogue a sync target and link it, for organisations only. */
export async function linkSync(
  env: Env,
  tenant: TenantId,
  target: { id: number; name: string; agencyType?: string | null },
  now: string,
  mayPublish: boolean,
): Promise<boolean> {
  const facts = factsFromSync(target)
  // A person is not catalogued at all. Their name belongs on the artist's own
  // row and nowhere shared.
  if (facts.category !== 'sync') return false
  try {
    const id = await catalogue(env, facts, {}, now, mayPublish)
    await getDb(env.DB)
      .update(syncTargets)
      .set({ opportunityId: id })
      .where(scoped(syncTargets, tenant, eq(syncTargets.id, target.id)))
    return true
  } catch (err) {
    console.error('catalog link failed (sync):', err)
    return false
  }
}

/** How many unlinked rows of each kind one nightly pass will take on. */
export const RELINK_LIMIT = 50

/**
 * The gig rows a link is attempted for: every one, or only those with no entry.
 * Shared by the one-shot backfill and the nightly retry so the two cannot
 * disagree about which columns a link needs.
 */
function gigsToLink(env: Env, tenant: TenantId, onlyUnlinked: boolean, limit: number) {
  return getDb(env.DB)
    .select({
      id: gigOpportunities.id,
      name: gigOpportunities.name,
      type: gigOpportunities.type,
      organizer: gigOpportunities.organizer,
      url: gigOpportunities.url,
      applicationUrl: gigOpportunities.applicationUrl,
      deadline: gigOpportunities.deadline,
      deadlineNote: gigOpportunities.deadlineNote,
      location: gigOpportunities.location,
      country: gigOpportunities.country,
      discoveredAt: gigOpportunities.discoveredAt,
      feeAmount: gigOpportunities.feeAmount,
      feeCurrency: gigOpportunities.feeCurrency,
      status: gigOpportunities.status,
      outcome: gigOpportunities.outcome,
      flag: gigOpportunities.flag,
    })
    .from(gigOpportunities)
    .where(scoped(gigOpportunities, tenant, onlyUnlinked ? isNull(gigOpportunities.opportunityId) : undefined))
    .orderBy(asc(gigOpportunities.id))
    .limit(limit)
}

/** A gig nobody has acted on is a research find; anything further along may be private. */
function isUntouched(gig: { status: string | null; outcome: string | null; flag: string | null }): boolean {
  return gigStage(gigStatusFromStored(gig)) === 'new'
}

/**
 * Link the rows whose catalog write failed when they were filed, for one artist.
 *
 * `linkGig` swallows a failure so that a catalog hiccup never costs the artist
 * the row they just filed, and says the nightly pass will pick it up — this is
 * that pass, run from housekeeping. Without it a row that missed its link stays
 * unlinked for good, because the backfill is one-shot.
 *
 * Whether it is published is decided the way the backfill decides it, because
 * the route's own answer — "an agent filed it" — is not recorded on the row: a
 * gig nobody has acted on is a research find, anything further along may be a
 * private arrangement, and a sync organisation still at `draft_ready` is the
 * same. The conservative reading, since the owner can show an entry and nobody
 * can un-publish what a stranger has read.
 *
 * Returns how many rows it linked. Idempotent: a linked row is never selected,
 * and an organisation-less sync target — a person, never catalogued — is left
 * alone without being counted.
 */
export async function relinkMissing(env: Env, tenant: TenantId): Promise<number> {
  let linked = 0

  for (const gig of await gigsToLink(env, tenant, true, RELINK_LIMIT)) {
    if (await linkGig(env, tenant, gig, gig.discoveredAt, isUntouched(gig))) linked++
  }

  // Newest first, and filtered here: whether a target is an organisation is a
  // pattern over free text, which SQLite cannot match, and people are never
  // linked — so without this a pile of them would crowd the window and a row
  // that genuinely failed would wait behind them.
  const syncs = await getDb(env.DB)
    .select({
      id: syncTargets.id,
      name: syncTargets.name,
      agencyType: syncTargets.agencyType,
      discoveredAt: syncTargets.discoveredAt,
      status: syncTargets.status,
    })
    .from(syncTargets)
    .where(scoped(syncTargets, tenant, isNull(syncTargets.opportunityId)))
    .orderBy(desc(syncTargets.id))
  for (const target of syncs.filter((t) => syncCategory(t.agencyType) === 'sync').slice(0, RELINK_LIMIT)) {
    if (await linkSync(env, tenant, target, target.discoveredAt, target.status === 'draft_ready')) linked++
  }

  return linked
}

/** Not a cap in practice — SQLite wants a number, and no artist holds this many gigs. */
const BACKFILL_LIMIT = 1_000_000

/**
 * Link every row that predates the catalog, once, on the cron.
 *
 * Every tenant before the marker, like the notes backfill, and for the same
 * reason: the marker is platform state. `first_seen_at` is the row's own
 * `discovered_at`, so the landing page's "most recent" means most recently
 * found rather than most recently backfilled.
 */
export async function runCatalogBackfillOnce(env: Env, tenants: TenantId[]): Promise<void> {
  if (await readSetting(env, ONCE_KEYS.catalogBackfill)) return
  const db = getDb(env.DB)
  let linked = 0

  for (const tenant of tenants) {
    // Every row, linked or not: v2 exists to carry the fee into entries v1
    // already made. Re-linking lands on the same entry and only fills gaps.
    const gigs = await gigsToLink(env, tenant, false, BACKFILL_LIMIT)
    for (const gig of gigs) {
      // Nobody recorded who filed the rows that predate the catalog. One the
      // artist never touched is a research find; one already applied to,
      // offered or booked may be a private arrangement — "Mainstage
      // Invitation" is an offer, not a call — so it is catalogued hidden and
      // the owner can show it.
      await linkGig(env, tenant, gig, gig.discoveredAt, isUntouched(gig))
      linked++
    }

    const syncs = await db
      .select({
        id: syncTargets.id,
        name: syncTargets.name,
        agencyType: syncTargets.agencyType,
        discoveredAt: syncTargets.discoveredAt,
      })
      .from(syncTargets)
      .where(scoped(syncTargets, tenant, and(isNull(syncTargets.opportunityId))))
    for (const target of syncs) {
      await linkSync(env, tenant, target, target.discoveredAt, true)
      linked++
    }
  }

  console.log(`catalog backfill: ${linked} rows considered`)
  await writeSetting(env, ONCE_KEYS.catalogBackfill, new Date().toISOString())
}
