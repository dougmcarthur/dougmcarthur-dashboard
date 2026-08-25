/**
 * Settings that must be changeable without a deploy.
 *
 * The digest's on/off switch belongs here rather than in wrangler.toml for one
 * reason: the moment you most want the email to stop is the moment you least
 * want to be waiting on a build. Same for the recipient, which decides whether
 * a send is free or billable — see src/lib/mailer.ts.
 */

import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { appSettings } from '../db/schema'
import type { Env } from '../types'

export const DIGEST_KEYS = {
  enabled: 'digest.enabled',
  recipient: 'digest.recipient',
  sender: 'digest.sender',
} as const

export interface DigestSettings {
  enabled: boolean
  recipient: string
  sender: string
}

/**
 * Defaults chosen so an un-configured install is inert rather than surprising:
 * the digest is off until switched on, and the recipient is the address that
 * is unambiguously free to send to.
 */
export const DIGEST_DEFAULTS: DigestSettings = {
  enabled: false,
  recipient: 'dougmcarthur0@gmail.com',
  sender: 'digest@dougmcarthur.net',
}

export async function readDigestSettings(env: Env): Promise<DigestSettings> {
  const db = getDb(env.DB)
  const rows = await db.select().from(appSettings)
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    enabled: (map.get(DIGEST_KEYS.enabled) ?? String(DIGEST_DEFAULTS.enabled)) === 'true',
    recipient: map.get(DIGEST_KEYS.recipient) ?? DIGEST_DEFAULTS.recipient,
    sender: map.get(DIGEST_KEYS.sender) ?? DIGEST_DEFAULTS.sender,
  }
}

export async function writeSetting(env: Env, key: string, value: string): Promise<void> {
  const db = getDb(env.DB)
  const updatedAt = new Date().toISOString()
  // D1 supports ON CONFLICT, so this stays one round trip rather than a
  // read-then-write that two concurrent callers could interleave.
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt } })
}

/** Clears a setting so the default applies again. */
export async function clearSetting(env: Env, key: string): Promise<void> {
  const db = getDb(env.DB)
  await db.delete(appSettings).where(eq(appSettings.key, key))
}
