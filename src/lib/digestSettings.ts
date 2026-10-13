/**
 * The weekly digest's settings, per account.
 *
 * The digest used to be the owner's: its switch, schedule and recipient lived
 * in `app_settings`, which is platform state, and the cron sent it for the
 * owner's tenant alone. Every artist can have one now. What changed is where
 * the three things live and who decides them:
 *
 *  - **Switch and schedule are the account's own**, in `tenant_settings`. Off
 *    until the artist switches it on, which is the repo's rule that a deploy
 *    never starts mailing by itself, applied to accounts.
 *  - **The recipient is never typed.** An artist's digest goes to the address
 *    they sign in with, fixed by their invitation. A settings row that decides
 *    where mail goes is the shape of an account-takeover vector, and an artist
 *    able to set one could mail the owner or a stranger. The owner keeps the
 *    configurable recipient, because the owner's digest has always had one.
 *  - **The sender is the platform's.** One address, one domain, and not
 *    something an account chooses.
 *
 * The owner reads both spellings: a value in `tenant_settings` wins, and where
 * there is none the old `app_settings` row still answers. That is why nothing
 * had to be migrated, and why the owner's digest kept going on the deploy that
 * moved them: the same "read both spellings" move `normaliseGigStatus` makes.
 * Writes go to the account's own settings, so an owner who changes a day leaves
 * the old row behind and nothing reads it.
 */

import { asc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { users } from '../db/schema'
import type { TenantId } from '../db/scope'
import { isOwnerTenant } from './actor'
import { readTenantSetting, writeTenantSetting } from './nudgeSettings'
import { DIGEST_DEFAULTS, DIGEST_KEYS, readDigestSettings } from './settings'
import type { Weekday } from '../../shared/digestSchedule'
import type { Audience } from '../../shared/recipients'
import type { DigestSettings } from './settings'
import type { Env } from '../types'

export interface AccountDigest extends DigestSettings {
  /** `owner` reaches the configured recipient; `tenant` reaches this account's own address. */
  audience: Extract<Audience, 'owner' | 'tenant'>
  /** Whether the recipient is something this account may change. Only the owner's is. */
  recipientEditable: boolean
  /** The account has chosen a time zone, as opposed to being given the platform's. */
  zoneChosen: boolean
}

const KEYS = [DIGEST_KEYS.enabled, DIGEST_KEYS.day, DIGEST_KEYS.hour, DIGEST_KEYS.timezone, DIGEST_KEYS.lastSentAt] as const

const WEEKDAYS = new Set<string>(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])

/**
 * The address an artist's digest goes to: the one on their own account.
 *
 * The earliest account in the tenant that has an address, which is the person
 * the invitation was issued to. Null when there is none, and then there is
 * nowhere to send it and the card says so.
 */
export async function accountAddress(env: Env, tenant: TenantId): Promise<string | null> {
  const rows = await getDb(env.DB)
    .select({ email: users.email })
    .from(users)
    .where(eq(users.tenantId, tenant))
    .orderBy(asc(users.createdAt))
  return rows.map((r) => r.email?.trim()).find((email): email is string => Boolean(email)) ?? null
}

export async function readAccountDigest(env: Env, tenant: TenantId): Promise<AccountDigest> {
  const [platform, owner] = await Promise.all([readDigestSettings(env), isOwnerTenant(env, tenant)])
  const stored = new Map<string, string | null>(
    await Promise.all(KEYS.map(async (key) => [key, await readTenantSetting(env, tenant, key)] as const)),
  )

  const day = stored.get(DIGEST_KEYS.day)
  const hour = Number(stored.get(DIGEST_KEYS.hour))
  const own = {
    enabled: stored.get(DIGEST_KEYS.enabled),
    day: day && WEEKDAYS.has(day) ? (day as Weekday) : null,
    // A stored hour that is not a number falls back rather than scheduling the
    // send for NaN o'clock, which never matches and so never sends.
    hour: stored.get(DIGEST_KEYS.hour) !== null && Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null,
    timezone: stored.get(DIGEST_KEYS.timezone),
    lastSentAt: stored.get(DIGEST_KEYS.lastSentAt),
  }

  // Where the owner has no row of their own the platform row still answers; an
  // artist has no platform row to fall back to, only the defaults.
  const fallback = owner ? platform : { ...DIGEST_DEFAULTS, lastSentAt: null }

  return {
    enabled: (own.enabled ?? String(fallback.enabled)) === 'true',
    recipient: owner ? platform.recipient : ((await accountAddress(env, tenant)) ?? ''),
    sender: platform.sender,
    schedule: {
      day: own.day ?? fallback.schedule.day,
      hour: own.hour ?? fallback.schedule.hour,
      timezone: own.timezone ?? fallback.schedule.timezone,
    },
    lastSentAt: own.lastSentAt ?? fallback.lastSentAt,
    audience: owner ? 'owner' : 'tenant',
    recipientEditable: owner,
    zoneChosen: own.timezone !== null,
  }
}

export interface DigestPatch {
  enabled?: boolean
  day?: Weekday
  hour?: number
  timezone?: string
}

export async function writeAccountDigest(env: Env, tenant: TenantId, patch: DigestPatch): Promise<void> {
  if (patch.enabled !== undefined) await writeTenantSetting(env, tenant, DIGEST_KEYS.enabled, String(patch.enabled))
  if (patch.day !== undefined) await writeTenantSetting(env, tenant, DIGEST_KEYS.day, patch.day)
  if (patch.hour !== undefined) await writeTenantSetting(env, tenant, DIGEST_KEYS.hour, String(patch.hour))
  if (patch.timezone !== undefined) await writeTenantSetting(env, tenant, DIGEST_KEYS.timezone, patch.timezone)
}

/** Written only after a send resolves, so a failed one is retried on the next tick. */
export async function recordDigestSent(env: Env, tenant: TenantId, at: Date): Promise<void> {
  await writeTenantSetting(env, tenant, DIGEST_KEYS.lastSentAt, at.toISOString())
}
