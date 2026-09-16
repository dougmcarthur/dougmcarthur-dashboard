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
import type { TenantId } from '../db/scope'
import type { Env } from '../types'

/** What the calendar is called in the artist's own Google account. */
export const SCOUT_CALENDAR_NAME = 'Sun Dogs Music Scout'

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

    const calendarId =
      purpose === 'calendar' ? await createScoutCalendar(accessToken, SCOUT_CALENDAR_NAME) : null

    await storeGrant(env, tenant, {
      refreshToken,
      accountEmail: await accountEmail(accessToken),
      scopes,
      purpose,
      calendarId,
    })
    return 'connected'
  } catch (err) {
    console.error(`${purpose} connect failed:`, err)
    return 'failed'
  }
}
