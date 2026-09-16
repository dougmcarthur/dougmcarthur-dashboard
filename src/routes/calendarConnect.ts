/**
 * Connecting a calendar, which used to mean two Worker secrets and an OAuth
 * dance at a terminal.
 *
 * `GOOGLE_REFRESH_TOKEN` and `GOOGLE_CALENDAR_ID` were never set in
 * production, so every booked gig has quietly created no event since the
 * feature shipped. The secrets path still works and is still preferred by
 * nothing — a grant wins when one exists (`calendarTarget` in gigCalendar.ts).
 *
 * The scope is `calendar.app.created`, so there is nothing to choose and
 * nothing to paste: Scout makes its own calendar, can only write to that one,
 * and cannot read the artist's own at all.
 */

import { Hono } from 'hono'
import { tenantOf, type AppEnv } from '../context'
import { forgetGrant, readGrant } from '../lib/googleGrant'
import { beginConsent, consentAvailable } from '../lib/googleOAuth'

const calendar = new Hono<AppEnv>()

calendar.get('/status', async (c) => c.json(await readGrant(c.env, tenantOf(c), 'calendar')))

calendar.get('/connect', async (c) => {
  if (!consentAvailable(c.env)) {
    return c.json({ error: 'Google client credentials or TOKEN_ENCRYPTION_KEY are not configured' }, 503)
  }
  return beginConsent(c, 'calendar')
})

/**
 * Forget the grant. The calendar itself is left alone in the artist's account:
 * deleting it would take every event with it, and disconnecting is not the
 * same request as "remove what Scout already told me".
 */
calendar.post('/disconnect', async (c) => {
  await forgetGrant(c.env, tenantOf(c), 'calendar')
  return c.json({ ok: true })
})

export default calendar
