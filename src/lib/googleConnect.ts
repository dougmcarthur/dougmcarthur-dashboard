/**
 * Finish a consent: swap the code for a token, and make whatever the purpose
 * needs before the grant is usable.
 *
 * Separate from the route because the two purposes diverge here and only here.
 * Drafting is finished the moment the token is stored. A calendar grant is not:
 * under `calendar.app.created` there is no calendar to write to until Scout
 * makes one, so creating it is part of connecting rather than something the
 * first booking discovers it needs.
 */

import {
  BUNDLE_PURPOSES,
  accountEmail,
  exchangeCode,
  readGrant,
  scopeFor,
  storeGrant,
  type GrantPurpose,
} from './googleGrant'
import { createScoutCalendar } from './googleCalendar'
import { createScoutTaskList } from './googleTasks'
import { createFolder, ensureSubfolders } from './googleDrive'
import { getDb } from '../db'
import { tenants } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { TenantId } from '../db/scope'
import type { Env } from '../types'

/** What the calendar is called in the artist's own Google account. */
export const SCOUT_CALENDAR_NAME = 'Sun Dogs Music Scout'

/**
 * And the task list. The same name on purpose: they are two halves of one
 * thing, and two names would be a thing to explain on the Integrations screen.
 */
export const SCOUT_TASK_LIST_NAME = 'Sun Dogs Music Scout'

export async function completeGrant(
  env: Env,
  tenant: TenantId,
  purpose: GrantPurpose,
  code: string,
): Promise<string> {
  try {
    const { refreshToken, accessToken, scopes } = await exchangeCode(env, code)
    const email = await accountEmail(accessToken)

    // Reported rather than assumed: Google may hand back less than was asked
    // for, and finding that out here beats finding it out mid-write.
    if (!scopes.includes(scopeFor(purpose))) {
      await storeGrant(env, tenant, { refreshToken, accountEmail: email, scopes, purpose })
      return 'missing_scope'
    }

    const made = await provision(env, tenant, purpose, accessToken, email)
    await storeGrant(env, tenant, { refreshToken, accountEmail: email, scopes, purpose, ...made })
    return 'connected'
  } catch (err) {
    console.error(`${purpose} connect failed:`, err)
    return 'failed'
  }
}

/** What one "Connect Google account" did, service by service. */
export interface BundleOutcome {
  /** `connected` when every service landed, `partial` when some did. */
  outcome: 'connected' | 'partial' | 'failed'
  email: string | null
  connected: GrantPurpose[]
  /** Unticked on Google's consent screen. Not a fault — a choice. */
  declined: GrantPurpose[]
  /** Granted, but setting it up failed (making the calendar, say). */
  failed: GrantPurpose[]
  /** Already connected to a different Google account, and left there. */
  kept: GrantPurpose[]
}

/**
 * Finish the one-pass consent: one token, stored once per service it covers.
 *
 * Every service is its own `google_grants` row, as if connected on its own,
 * so nothing that reads a grant changes. Three rules decide each one:
 *
 *  - **Unticked is skipped, never stored as broken.** Granular consent means
 *    somebody can say yes to the calendar and no to their mail, and that is a
 *    decision to respect rather than an error to report.
 *  - **A service already on a different account stays there.** Using a second
 *    account for one service is the edge case this screen allows; pressing the
 *    main button again must not quietly undo it.
 *  - **One failure does not sink the rest.** A calendar that could not be made
 *    leaves Tasks and Drive connected, and the screen names what failed.
 */
export async function completeBundle(env: Env, tenant: TenantId, code: string): Promise<BundleOutcome> {
  const result: BundleOutcome = { outcome: 'failed', email: null, connected: [], declined: [], failed: [], kept: [] }
  let token
  try {
    token = await exchangeCode(env, code)
    result.email = await accountEmail(token.accessToken)
  } catch (err) {
    console.error('google connect failed:', err)
    return result
  }

  for (const purpose of BUNDLE_PURPOSES) {
    if (!token.scopes.includes(scopeFor(purpose))) {
      result.declined.push(purpose)
      continue
    }
    const existing = await readGrant(env, tenant, purpose)
    if (existing.connected && existing.accountEmail && result.email && !sameAddress(existing.accountEmail, result.email)) {
      result.kept.push(purpose)
      continue
    }
    try {
      const made = await provision(env, tenant, purpose, token.accessToken, result.email)
      await storeGrant(env, tenant, {
        refreshToken: token.refreshToken,
        accountEmail: result.email,
        scopes: token.scopes,
        purpose,
        ...made,
      })
      result.connected.push(purpose)
    } catch (err) {
      console.error(`google connect: ${purpose} setup failed:`, err)
      result.failed.push(purpose)
    }
  }

  result.outcome =
    result.connected.length === 0 ? 'failed' : result.failed.length || result.declined.length ? 'partial' : 'connected'
  return result
}

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * What a purpose needs made before its grant is usable — and, on a reconnect
 * of the same account, what it already has.
 *
 * Two purposes have something to make, and for the same reason: there is
 * nothing to write to until Scout makes it. Reconnecting used to make a
 * second "Sun Dogs Music Scout" calendar every time; the one already made for
 * this account is reused instead, since the same OAuth client can still reach
 * what it created. `calendar.primary` makes nothing — the artist already has
 * the calendar, which is the whole point of choosing it.
 */
async function provision(
  env: Env,
  tenant: TenantId,
  purpose: GrantPurpose,
  accessToken: string,
  email: string | null,
): Promise<{ calendarId: string | null; tasksListId: string | null; driveFolderId: string | null }> {
  const existing = await readGrant(env, tenant, purpose)
  const reuse = existing.connected && email !== null && existing.accountEmail !== null && sameAddress(existing.accountEmail, email)
  return {
    calendarId:
      purpose === 'calendar'
        ? (reuse && existing.calendarId) || (await createScoutCalendar(accessToken, SCOUT_CALENDAR_NAME))
        : null,
    tasksListId:
      purpose === 'tasks'
        ? (reuse && existing.tasksListId) || (await createScoutTaskList(accessToken, SCOUT_TASK_LIST_NAME))
        : null,
    // Under drive.file the folder Scout makes is the root of everything it may
    // touch, so it is made here, with its subfolders, rather than on first use.
    driveFolderId:
      purpose === 'drive'
        ? (reuse && existing.driveFolderId) || (await createEpkFolder(env, tenant, accessToken))
        : null,
  }
}

/**
 * "Doug McArthur – EPK", in the artist's own Drive. The artist's name from
 * their profile, because a juror's downloads folder is full of folders called
 * "EPK"; a generic name when nobody has set one.
 */
async function createEpkFolder(env: Env, tenant: TenantId, accessToken: string): Promise<string> {
  const row = await getDb(env.DB).select().from(tenants).where(eq(tenants.id, tenant)).get()
  const name = row?.displayName?.trim() ? `${row.displayName.trim()} – EPK` : 'EPK (Sun Dogs Music Scout)'
  const id = await createFolder(accessToken, name)
  await ensureSubfolders(accessToken, id)
  return id
}
