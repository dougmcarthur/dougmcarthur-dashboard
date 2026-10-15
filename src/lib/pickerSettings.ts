/**
 * Google's picker, for adding files to an artist's Drive folder: a browser API
 * key and the number of the Cloud project that owns the OAuth client.
 *
 * Both are public by nature. The picker runs in the artist's browser and hands
 * both to Google from there, so a row is no weaker than a `[vars]` entry, and a
 * row is what the owner asked for: a value somebody has to type once is changed
 * from admin mode and not from a commit and a deploy. The survey's Turnstile
 * site key is the same shape (src/lib/surveySettings.ts).
 *
 * There is deliberately no environment fallback. They were `GOOGLE_PICKER_API_KEY`
 * and `GOOGLE_CLOUD_PROJECT_NUMBER` in wrangler.toml, commented out and never
 * set in production, so nothing is being migrated, and two places for one value
 * is how the one you changed turns out not to be the one that is read.
 * `test/pickerSettings.test.ts` fails if either name comes back.
 *
 * Absent rows mean the Drive tab connects and lists the folder but offers no
 * picker, and says so.
 */

import { inArray } from 'drizzle-orm'
import { getDb } from '../db'
import { appSettings } from '../db/schema'
import { clearSetting, writeSetting } from './settings'
import type { Env } from '../types'

export const PICKER_KEYS = {
  apiKey: 'drive.pickerApiKey',
  appId: 'drive.pickerAppId',
} as const

export interface PickerConfig {
  /** Both halves are set, so the picker can open. */
  available: boolean
  apiKey: string | null
  appId: string | null
}

export async function readPickerConfig(env: Env): Promise<PickerConfig> {
  const rows = await getDb(env.DB)
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, Object.values(PICKER_KEYS)))
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const apiKey = (map.get(PICKER_KEYS.apiKey) ?? '').trim() || null
  const appId = (map.get(PICKER_KEYS.appId) ?? '').trim() || null
  return { available: Boolean(apiKey && appId), apiKey, appId }
}

/**
 * The project number an OAuth client ID names: the digits before its first dash
 * (`123456789012-abc….apps.googleusercontent.com`). It is what the picker's app
 * id has to equal, because `drive.file` grants access to a picked file per
 * project, and a different number opens a picker whose files Scout then cannot
 * read.
 *
 * Offered to the owner, never applied: a fact read off a client ID is a
 * suggestion beside a field they confirm, not a value written on their behalf.
 */
export function projectNumberOfClientId(clientId: string | undefined): string | null {
  return /^(\d{6,15})-/.exec((clientId ?? '').trim())?.[1] ?? null
}

export interface PickerView extends PickerConfig {
  /** From the Worker's Google client ID, when it has one. See above. */
  clientProjectNumber: string | null
}

export async function readPickerView(env: Env): Promise<PickerView> {
  return { ...(await readPickerConfig(env)), clientProjectNumber: projectNumberOfClientId(env.GOOGLE_CLIENT_ID) }
}

export interface PickerSettingsPatch {
  /** Null or empty clears it. */
  apiKey?: string | null
  appId?: string | null
}

export async function writePickerSettings(env: Env, patch: PickerSettingsPatch): Promise<void> {
  if (patch.apiKey !== undefined) await set(env, PICKER_KEYS.apiKey, (patch.apiKey ?? '').trim() || null)
  if (patch.appId !== undefined) await set(env, PICKER_KEYS.appId, (patch.appId ?? '').trim() || null)
}

async function set(env: Env, key: string, value: string | null) {
  if (value === null) await clearSetting(env, key)
  else await writeSetting(env, key, value)
}
