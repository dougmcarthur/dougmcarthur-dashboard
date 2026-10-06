/**
 * The artist survey's switches, which live in `app_settings` and are changed
 * from the owner's admin screen.
 *
 * They were `[vars]` in wrangler.toml, which meant opening or closing a public
 * survey was a commit and a deploy. The moment you most want it closed is the
 * moment you least want to wait on a build — the reason the digest's switch
 * lives in the database too (src/lib/settings.ts).
 *
 * Three values are here and one is deliberately not:
 *
 * - **open**, **contact address** and the Turnstile **site key** are rows.
 *   The site key is public by nature (the widget runs in the page), so a row is
 *   no weaker than a var, and it cannot be a var anyway: a variable typed into
 *   the Cloudflare dashboard is wiped by the next `wrangler deploy` unless the
 *   file names it.
 * - The Turnstile **secret** stays a Worker secret. A secret cannot be written
 *   at runtime, and putting one in D1 would make a copy of the database a
 *   working credential. Secrets survive a deploy, so it is set once in the
 *   Cloudflare dashboard (Workers → Settings → Variables and Secrets).
 *
 * Absent rows mean closed, with no contact and no spam check — a deployment
 * that has never been configured is inert rather than surprising.
 */

import { inArray } from 'drizzle-orm'
import { getDb } from '../db'
import { appSettings } from '../db/schema'
import { clearSetting, writeSetting } from './settings'
import type { Env } from '../types'

export const SURVEY_KEYS = {
  open: 'survey.open',
  contact: 'survey.contactEmail',
  siteKey: 'survey.turnstileSiteKey',
} as const

/** Where the summary will be posted. A route of this Worker, so it is never a dead link. */
export const SURVEY_RESULTS_PATH = '/survey-results'

export interface SurveyConfig {
  /** What the page needs to open: switched on, and able to say who to ask. */
  open: boolean
  /** The owner's switch, whether or not it can take effect. */
  wanted: boolean
  contact: string | null
  siteKey: string | null
  /** The Worker secret is present. It is never read back, only noticed. */
  secretSet: boolean
  /** Both halves of Turnstile are set, so a start is actually checked. */
  botCheck: boolean
  /** Where the notice says the summary will be posted. */
  resultsUrl: string
  /** When the switch last changed, or null if it never has. */
  changedAt: string | null
}

/**
 * `origin` is the fallback for the results address only. `DASHBOARD_URL` is
 * preferred because a request header is written by whoever is asking — the same
 * rule `relyingParty` follows (shared/auth.ts).
 */
export async function readSurveyConfig(env: Env, origin: string): Promise<SurveyConfig> {
  const rows = await getDb(env.DB)
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, Object.values(SURVEY_KEYS)))
  const map = new Map(rows.map((r) => [r.key, r]))

  const contact = (map.get(SURVEY_KEYS.contact)?.value ?? '').trim()
  const siteKey = (map.get(SURVEY_KEYS.siteKey)?.value ?? '').trim()
  const wanted = map.get(SURVEY_KEYS.open)?.value === 'true'
  const secretSet = !!(env.TURNSTILE_SECRET_KEY ?? '').trim()
  const base = (env.DASHBOARD_URL ?? origin).replace(/\/$/, '')

  return {
    open: wanted && contact.length > 0,
    wanted,
    contact: contact || null,
    siteKey: siteKey || null,
    secretSet,
    botCheck: secretSet && siteKey.length > 0,
    resultsUrl: `${base}${SURVEY_RESULTS_PATH}`,
    changedAt: map.get(SURVEY_KEYS.open)?.updatedAt ?? null,
  }
}

export interface SurveySettingsPatch {
  open?: boolean
  /** Null or empty clears it. */
  contact?: string | null
  siteKey?: string | null
}

export type SurveySettingsResult = { ok: true } | { ok: false; error: string }

/**
 * Applies a change, or refuses the whole of it.
 *
 * The rule the notice depends on is checked against what the settings *would
 * be*, not against what the patch says: switching on with a contact already
 * stored is fine, and so is sending both in one request, but clearing the
 * contact of an open survey would close it silently — a switch that reads "on"
 * over a survey nobody can start — so it is refused and says why.
 */
export async function writeSurveySettings(
  env: Env,
  current: SurveyConfig,
  patch: SurveySettingsPatch,
): Promise<SurveySettingsResult> {
  const contact = patch.contact !== undefined ? (patch.contact ?? '').trim() || null : current.contact
  const wanted = patch.open ?? current.wanted

  if (wanted && !contact) {
    return {
      ok: false,
      error: patch.open
        ? 'Set a contact address first. The notice every respondent reads promises one.'
        : 'Close the survey before removing its contact address. The notice promises one.',
    }
  }

  if (patch.contact !== undefined) await set(env, SURVEY_KEYS.contact, contact)
  if (patch.siteKey !== undefined) await set(env, SURVEY_KEYS.siteKey, (patch.siteKey ?? '').trim() || null)
  // Last, so a failed write above never leaves the switch on. Only when it
  // changes, because the row's timestamp is what the screen reports as "since".
  if (patch.open !== undefined && patch.open !== current.wanted) {
    await writeSetting(env, SURVEY_KEYS.open, String(patch.open))
  }
  return { ok: true }
}

async function set(env: Env, key: string, value: string | null) {
  if (value === null) await clearSetting(env, key)
  else await writeSetting(env, key, value)
}
