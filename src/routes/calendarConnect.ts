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
import { forgetGrant, primaryCalendarOffered, readGrant } from '../lib/googleGrant'
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
 * The artist's own calendar, as a second and separate grant.
 *
 * Refused unless the deployment turned it on, rather than started and failed
 * at Google: the scope has to be declared on the OAuth client and reviewed
 * before a consent naming it completes for anybody outside the test-user
 * list, so a deployment that has not done that work would send somebody to a
 * consent screen that ends in an error page. See `primaryCalendarOffered`.
 */
calendar.get('/status/primary', async (c) =>
  c.json({
    ...(await readGrant(c.env, tenantOf(c), 'calendar.primary')),
    offered: primaryCalendarOffered(c.env),
  }),
)

calendar.get('/connect/primary', async (c) => {
  if (!consentAvailable(c.env)) {
    return c.json({ error: 'Google client credentials or TOKEN_ENCRYPTION_KEY are not configured' }, 503)
  }
  if (!primaryCalendarOffered(c.env)) {
    return c.json({ error: 'This deployment does not offer the primary-calendar grant' }, 503)
  }
  return beginConsent(c, 'calendar.primary')
})

/**
 * Forget the grant. The calendar itself is left alone in the artist's account:
 * deleting it would take every event with it, and disconnecting is not the
 * same request as "remove what Scout already told me".
 *
 * The same is true of the primary-calendar grant and matters more there: the
 * entries Scout wrote are sitting in the artist's own diary among everything
 * else, and deleting them on disconnect would be reaching into a calendar the
 * artist has just said Scout may no longer touch.
 */
calendar.post('/disconnect', async (c) => {
  await forgetGrant(c.env, tenantOf(c), 'calendar')
  return c.json({ ok: true })
})

calendar.post('/disconnect/primary', async (c) => {
  await forgetGrant(c.env, tenantOf(c), 'calendar.primary')
  return c.json({ ok: true })
})

export default calendar
