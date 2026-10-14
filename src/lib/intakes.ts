/**
 * A programme that has opened again, for one artist.
 *
 * The rules are in `shared/intakes.ts` and read no database. This reads the
 * catalog (which belongs to nobody) and the artist's own linked rows, hands
 * them in, and writes what comes out on the artist's side: a New row follows
 * its programme to the newer date, and a passed or missed intake is offered
 * again as a new row. Both are said on the bell, because "a grant you passed
 * on is open again" is not recoverable from tomorrow's state.
 *
 * Three properties:
 *
 *  - **Idempotent.** Advancing a row or filing the new one makes the artist
 *    hold the entry's date, which the planner checks first, so a second run on
 *    the same night finds nothing and nothing is filed twice.
 *  - **It re-offers through the matcher's own facts.** A programme for the
 *    residents of another province is not re-offered because it was once on the
 *    list. The entry goes through `matchCatalog` with nothing marked as theirs,
 *    so the reasons that remove a call are the reasons that remove it everywhere.
 *  - **Suggestions off means no new rows.** Moving a row they already have is
 *    not a suggestion, and happens regardless; filing a fresh one is, and an
 *    artist who switched them off is not sent any.
 */

import { eq, isNotNull } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, opportunities } from '../db/schema'
import { readGigs } from '../db/gigRows'
import { scoped, type TenantId } from '../db/scope'
import { focusFor } from './focus'
import { insertCatalogGig, suggestionsOff, toEntry } from './catalogMatch'
import { readTenantSetting } from './nudgeSettings'
import { recordEvent } from './notificationEvents'
import { explainMatch, matchCatalog } from '../../shared/catalogMatch'
import {
  moveSentence,
  planIntakes,
  reofferSentence,
  type IntakeEntry,
  type IntakeRow,
} from '../../shared/intakes'
import { ONBOARDING_KEYS, parseProfile } from '../../shared/onboarding'
import type { Env } from '../types'

/** How many passed intakes one night offers again. The rest follow the next night. */
export const REOFFER_LIMIT = 10

export interface IntakeRun {
  /** New rows moved to the newer date. */
  advanced: number
  /** Passed or missed intakes offered again as new rows. */
  reoffered: number
}

export async function reopenIntakes(env: Env, tenant: TenantId, today: string, now: string): Promise<IntakeRun> {
  const none: IntakeRun = { advanced: 0, reoffered: 0 }
  const db = getDb(env.DB)

  const stored = await db
    .select()
    .from(gigOpportunities)
    .where(scoped(gigOpportunities, tenant, isNotNull(gigOpportunities.opportunityId)))
  if (stored.length === 0) return none

  // `readGigs` is the one translation from storage to the statuses the rules
  // reason in, so an outcome of "passed" is read the way every screen reads it.
  const rows: IntakeRow[] = readGigs(stored).map((r) => ({
    id: r.id,
    opportunityId: r.opportunityId ?? null,
    status: r.status,
    deadline: r.deadline,
  }))

  const catalog = await db.select().from(opportunities).limit(5000)
  const entries: IntakeEntry[] = catalog.map((e) => ({
    id: e.id,
    name: e.name,
    deadline: e.deadline,
    deadlineNote: e.deadlineNote,
    opensAt: e.opensAt,
    firstSeenAt: e.firstSeenAt,
    reopenedAt: e.reopenedAt,
    delivery: e.delivery,
  }))

  const moves = planIntakes({ entries, rows, today })
  if (moves.length === 0) return none

  const off = await suggestionsOff(env, tenant)
  const [focus, profileRaw] = await Promise.all([
    focusFor(env, tenant),
    readTenantSetting(env, tenant, ONBOARDING_KEYS.profile),
  ])
  const profile = parseProfile(profileRaw)

  const done: typeof moves = []
  let reoffered = 0
  let advanced = 0

  for (const move of moves) {
    if (move.kind === 'advance') {
      // A change to what the row says, so `updated_at` moves: a snooze made
      // against the old intake is woken, which is the point. See `snoozeState`.
      await db
        .update(gigOpportunities)
        .set({ deadline: move.to, deadlineNote: move.note, opensAt: move.opensAt, updatedAt: now })
        .where(scoped(gigOpportunities, tenant, eq(gigOpportunities.id, move.rowId)))
      advanced++
      done.push(move)
      continue
    }

    if (off || reoffered >= REOFFER_LIMIT) continue
    const row = catalog.find((e) => e.id === move.entryId)
    if (!row) continue

    const result = matchCatalog({ entries: [toEntry(row)], focus, profile, have: new Set(), today })
    const match = result.matches[0]
    if (!match) continue

    await insertCatalogGig(env, tenant, match, now, `${reofferSentence(move, today)} ${explainMatch(match)}`)
    reoffered++
    done.push(move)
  }

  if (done.length > 0) {
    await recordEvent(env, tenant, {
      kind: 'automation',
      tier: 'info',
      title: `${done.length} ${done.length === 1 ? 'programme is' : 'programmes are'} open again`,
      body: done.map((m) => moveSentence(m, today)).join(' '),
      href: '#gigs',
      action: 'Open gigs',
      dedupeKey: `intakes:${today}`,
    })
  }

  return { advanced, reoffered }
}
