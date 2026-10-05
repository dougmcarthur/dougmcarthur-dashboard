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
 *  - **Linking is best-effort.** A catalog failure must never cost an artist
 *    the gig they just filed; the row stands and the daily backfill links it.
 */

import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, opportunities, syncTargets } from '../db/schema'
import { scoped, type TenantId } from '../db/scope'
import {
  catalogKey,
  factsFromGig,
  factsFromSync,
  fillMissing,
  publishable,
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

/** Catalogue a gig row and link it. Swallows failure — see the module note. */
export async function linkGig(
  env: Env,
  tenant: TenantId,
  gig: Parameters<typeof factsFromGig>[0] & { id: number },
  now: string,
  mayPublish: boolean,
): Promise<void> {
  try {
    const id = await catalogue(env, factsFromGig(gig), gig, now, mayPublish)
    await getDb(env.DB)
      .update(gigOpportunities)
      .set({ opportunityId: id })
      .where(scoped(gigOpportunities, tenant, eq(gigOpportunities.id, gig.id)))
  } catch (err) {
    console.error('catalog link failed (gig):', err)
  }
}

/** Catalogue a sync target and link it, for organisations only. */
export async function linkSync(
  env: Env,
  tenant: TenantId,
  target: { id: number; name: string; agencyType?: string | null },
  now: string,
  mayPublish: boolean,
): Promise<void> {
  const facts = factsFromSync(target)
  // A person is not catalogued at all. Their name belongs on the artist's own
  // row and nowhere shared.
  if (facts.category !== 'sync') return
  try {
    const id = await catalogue(env, facts, {}, now, mayPublish)
    await getDb(env.DB)
      .update(syncTargets)
      .set({ opportunityId: id })
      .where(scoped(syncTargets, tenant, eq(syncTargets.id, target.id)))
  } catch (err) {
    console.error('catalog link failed (sync):', err)
  }
}

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
    const gigs = await db
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
      // Every row, linked or not: v2 exists to carry the fee into entries v1
      // already made. Re-linking lands on the same entry and only fills gaps.
      .where(scoped(gigOpportunities, tenant))
    for (const gig of gigs) {
      // Nobody recorded who filed the rows that predate the catalog. One the
      // artist never touched is a research find; one already applied to,
      // offered or booked may be a private arrangement — "Mainstage
      // Invitation" is an offer, not a call — so it is catalogued hidden and
      // the owner can show it.
      const untouched = gigStage(gigStatusFromStored(gig)) === 'new'
      await linkGig(env, tenant, gig, gig.discoveredAt, untouched)
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
