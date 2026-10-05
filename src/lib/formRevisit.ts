import { getDb } from '../db'
import { gigOpportunities } from '../db/schema'
import { scoped, type TenantId } from '../db/scope'
import { readGigs } from '../db/gigRows'
import { prepStateOf } from '../../shared/application'
import { formRevisit, revisitNotice } from '../../shared/formRevisit'
import { prepareApplication } from './applicationStaging'
import { recordEvent } from './notificationEvents'
import type { readApplicationForm } from './applicationPrep'
import type { Env } from '../types'

/**
 * Go back to the forms that were not there the first time.
 *
 * `shared/formRevisit.ts` says which gigs are due and why; this fetches the
 * rows, looks, and tells the artist what it found. It runs on the daily
 * housekeeping tick, per tenant, beside the reminder reconcile — it is the
 * thing the "applications open" task's day of grace was waiting for.
 *
 * **It is deterministic on purpose.** A routine could search the web for a form
 * the listing page does not link to, and would cost plan allowance, need a
 * token that can write an address into a gig, and leave nothing behind if its
 * run crashed. This costs nothing, cannot be skipped by a model, and reaches
 * the form the way the artist would: from the page the agent already filed, one
 * Apply link away (`src/lib/applicationPrep.ts`). What it cannot reach it says
 * so, by name, in the bell.
 *
 * **One gig at a time, and a few a night.** These are festival websites, and a
 * cron arriving in a burst is the wrong way to read them — the same reasoning
 * `scanProfiles` follows. Whatever is left over is first in line tomorrow,
 * because the oldest look goes first.
 *
 * It never moves a status and never touches `updated_at`: see `requested` in
 * `prepareApplication`.
 */

/** Per tenant per tick. A backlog of eight is a very good week. */
export const REVISIT_LIMIT = 8

export interface RevisitRun {
  /** How many were due, before the limit. */
  due: number
  read: number
  opened: number
  needsYou: number
  stillMissing: number
}

export async function revisitForms(
  env: Env,
  tenant: TenantId,
  today: string,
  options: { limit?: number; read?: typeof readApplicationForm; now?: string } = {},
): Promise<RevisitRun> {
  const db = getDb(env.DB)
  const gigs = readGigs(await db.select().from(gigOpportunities).where(scoped(gigOpportunities, tenant)))

  const due = gigs
    .filter((g) => formRevisit(g, today).due)
    // Never looked at first, then the one looked at longest ago.
    .sort((a, b) => (a.prepCheckedAt ?? '').localeCompare(b.prepCheckedAt ?? ''))

  const run: RevisitRun = { due: due.length, read: 0, opened: 0, needsYou: 0, stillMissing: 0 }

  for (const gig of due.slice(0, options.limit ?? REVISIT_LIMIT)) {
    try {
      const result = await prepareApplication(env, tenant, gig.id, {
        requested: false,
        read: options.read,
        now: options.now,
      })
      if (!result.ok) continue
      run.read++

      const { outcome, previous } = result
      if (outcome.status === 'ready') run.opened++
      else if (outcome.status === 'blocked') run.needsYou++
      else if (outcome.status === 'not_found') run.stillMissing++

      const notice = revisitNotice({
        gig: { id: gig.id, name: gig.name, opensAt: gig.opensAt },
        before: prepStateOf(previous.status, previous.note),
        after: { status: outcome.status, fields: outcome.fields.length, note: outcome.note },
        today,
      })
      if (notice) {
        await recordEvent(env, tenant, {
          kind: 'automation',
          tier: notice.tier,
          title: notice.title,
          body: notice.body,
          href: `#gigs/${gig.id}`,
          action: 'Open',
          dedupeKey: notice.dedupeKey,
        })
      }
    } catch (err) {
      // One festival's page falling over must not cost the rest their look.
      console.error(`form revisit failed for gig ${gig.id}:`, err)
    }
  }

  return run
}
