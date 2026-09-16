/**
 * Where each kind of nudge goes, per artist.
 *
 * `app_settings` was the obvious place and is the wrong one: it is platform
 * state — the digest schedule, the one-shot markers, the term-rarity cache —
 * and has one right answer for the deployment. Which calendar an artist wants
 * their shows on is not that. So `tenant_settings` (migration 0026) is the
 * fifteenth scoped table, and these reads go through `scoped()` like every
 * other.
 *
 * The rules themselves are in `shared/nudgeRouting.ts`, which reads no
 * database and no clock. This file only turns rows into the preferences
 * object and back — including refusing a stored value the kind does not
 * offer, because a preference naming a destination the writer will not honour
 * is worse than the default: the screen would say Calendar and nothing would
 * appear there.
 */

import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { tenantSettings } from '../db/schema'
import { scoped, withTenant, type TenantId } from '../db/scope'
import {
  NUDGE_DEFAULTS,
  normaliseDestination,
  normaliseLeadDays,
  type NudgePreferences,
} from '../../shared/nudgeRouting'
import type { Env } from '../types'

export const NUDGE_KEYS = {
  show: 'nudge.show',
  deadline: 'nudge.deadline',
  opens: 'nudge.opens',
  reply: 'nudge.reply',
  openingLeadDays: 'nudge.openingLeadDays',
} as const

export async function readNudgePreferences(env: Env, tenant: TenantId): Promise<NudgePreferences> {
  const rows = await getDb(env.DB)
    .select()
    .from(tenantSettings)
    .where(scoped(tenantSettings, tenant))
  const map = new Map(rows.map((r) => [r.key, r.value]))

  return {
    show: normaliseDestination('show', map.get(NUDGE_KEYS.show) ?? NUDGE_DEFAULTS.show),
    deadline: normaliseDestination('deadline', map.get(NUDGE_KEYS.deadline) ?? NUDGE_DEFAULTS.deadline),
    opens: normaliseDestination('opens', map.get(NUDGE_KEYS.opens) ?? NUDGE_DEFAULTS.opens),
    reply: normaliseDestination('reply', map.get(NUDGE_KEYS.reply) ?? NUDGE_DEFAULTS.reply),
    openingLeadDays: normaliseLeadDays(
      map.get(NUDGE_KEYS.openingLeadDays) ?? NUDGE_DEFAULTS.openingLeadDays,
    ),
  }
}

export async function writeTenantSetting(
  env: Env,
  tenant: TenantId,
  key: string,
  value: string,
): Promise<void> {
  const updatedAt = new Date().toISOString()
  const db = getDb(env.DB)
  // Delete-then-insert rather than an upsert, for the reason `storeGrant`
  // gives at length: an `ON CONFLICT` target names a uniqueness constraint,
  // and naming one is what made widening those keys a two-migration job.
  // Naming none works against the schema on either side of any future change.
  await db.delete(tenantSettings).where(scoped(tenantSettings, tenant, eq(tenantSettings.key, key)))
  await db.insert(tenantSettings).values(withTenant(tenant, { key, value, updatedAt }))
}
