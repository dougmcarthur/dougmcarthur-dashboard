/**
 * Which pages' first-visit lines this account has dismissed.
 *
 * One `tenant_settings` row, `hints.dismissed`: a JSON list of page ids. It
 * follows the account, so a line put away on the phone stays away on the
 * laptop, and is read and written through the scoped helpers like every other
 * setting. No row means none dismissed.
 *
 * Not in `AGENT_ROUTES`, and refused to an agent here as well. It changes
 * nothing about who can get in, so it needs no passkey touch. Admin mode has no
 * tenant and never reaches it.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { tenantOf, type AppEnv } from '../context'
import { readTenantSetting, writeTenantSetting } from '../lib/nudgeSettings'
import { HINT_PAGES, parseDismissed, withDismissed } from '../../shared/pageHints'

export const PAGE_HINT_KEY = 'hints.dismissed'

const pageHints = new Hono<AppEnv>()

pageHints.use('*', async (c, next) => {
  if (c.get('actor').kind === 'agent') return c.json({ error: 'not available to an agent token' }, 403)
  return next()
})

pageHints.get('/', async (c) => {
  const stored = await readTenantSetting(c.env, tenantOf(c), PAGE_HINT_KEY)
  return c.json({ dismissed: parseDismissed(stored) })
})

const BodySchema = z.object({ page: z.enum(HINT_PAGES) }).strict()

// Idempotent: dismissing a line twice, from two tabs, leaves one entry.
pageHints.post('/dismiss', zValidator('json', BodySchema), async (c) => {
  const { page } = c.req.valid('json')
  const tenant = tenantOf(c)
  const dismissed = withDismissed(parseDismissed(await readTenantSetting(c.env, tenant, PAGE_HINT_KEY)), page)
  await writeTenantSetting(c.env, tenant, PAGE_HINT_KEY, JSON.stringify(dismissed))
  return c.json({ dismissed })
})

export default pageHints
