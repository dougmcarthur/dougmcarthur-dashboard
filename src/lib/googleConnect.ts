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
  accountEmail,
  exchangeCode,
  scopeFor,
  storeGrant,
  type GrantPurpose,
} from './googleGrant'
import { createScoutCalendar } from './googleCalendar'
import { createScoutTaskList } from './googleTasks'
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

    // Reported rather than assumed: Google may hand back less than was asked
    // for, and finding that out here beats finding it out mid-write.
    if (!scopes.includes(scopeFor(purpose))) {
      await storeGrant(env, tenant, {
        refreshToken,
        accountEmail: await accountEmail(accessToken),
        scopes,
        purpose,
      })
      return 'missing_scope'
    }

    // Two purposes have something to make before the grant is usable, and for
    // the same reason in each case: there is nothing to write to until Scout
    // makes it. `calendar.primary` is the exception — the artist already has
    // the calendar, which is the whole point of choosing it.
    const calendarId =
      purpose === 'calendar' ? await createScoutCalendar(accessToken, SCOUT_CALENDAR_NAME) : null
    const tasksListId =
      purpose === 'tasks' ? await createScoutTaskList(accessToken, SCOUT_TASK_LIST_NAME) : null

    await storeGrant(env, tenant, {
      refreshToken,
      accountEmail: await accountEmail(accessToken),
      scopes,
      purpose,
      calendarId,
      tasksListId,
    })
    return 'connected'
  } catch (err) {
    console.error(`${purpose} connect failed:`, err)
    return 'failed'
  }
}
