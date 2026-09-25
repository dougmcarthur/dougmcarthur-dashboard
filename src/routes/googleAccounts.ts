/**
 * Google, as accounts rather than as four separate connections.
 *
 * `GET /connect` is the one button: one consent for every service in
 * `BUNDLE_PURPOSES`, finished at the shared callback (`/api/gmail/callback`,
 * with `google` in `state`). The per-service connect routes still exist, and
 * are what the screen offers for the edge case — a calendar on one Google
 * account and mail on another.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { tenantOf, type AppEnv } from '../context'
import { BUNDLE_PURPOSES, forgetGoogleAccount, grantConfigured, listGoogleAccounts } from '../lib/googleGrant'
import { beginConsent, consentAvailable } from '../lib/googleOAuth'

const google = new Hono<AppEnv>()

google.get('/accounts', async (c) =>
  c.json({
    configured: grantConfigured(c.env),
    bundle: BUNDLE_PURPOSES,
    accounts: await listGoogleAccounts(c.env, tenantOf(c)),
  }),
)

google.get('/connect', async (c) => {
  if (!consentAvailable(c.env)) {
    return c.json({ error: 'Google client credentials or TOKEN_ENCRYPTION_KEY are not configured' }, 503)
  }
  return beginConsent(c, 'google')
})

/**
 * Disconnect one account from everything it covers. What Scout made in it —
 * the calendar, the task list, the Drive folder, drafts — stays in the
 * account; disconnecting is not "delete what you already wrote".
 */
google.post(
  '/disconnect',
  zValidator('json', z.object({ email: z.string().trim().nullable() })),
  async (c) => {
    const removed = await forgetGoogleAccount(c.env, tenantOf(c), c.req.valid('json').email)
    return c.json({ ok: true, removed })
  },
)

export default google
