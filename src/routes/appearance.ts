/**
 * The colour theme, kept with the account.
 *
 * Only the colour theme. Light or dark, text size, typeface, width, motion and
 * links describe one pair of eyes on one screen and stay in the browser (see
 * frontend/src/appearance.ts); an accessible theme is the one choice a person
 * wants on every device they sign in from.
 *
 * One `tenant_settings` row, `appearance.palette`. No row means nothing has
 * been chosen, which is a different answer from "the default": a device that
 * asks for more contrast gets High contrast until somebody picks.
 *
 * Not in `AGENT_ROUTES`, and refused to an agent here as well. It changes
 * nothing about who can get in, so it needs no passkey touch.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { tenantOf, type AppEnv } from '../context'
import { clearTenantSetting, readTenantSetting, writeTenantSetting } from '../lib/nudgeSettings'
import { PALETTE_IDS, isPaletteId, type PaletteId } from '../../shared/themes'

export const APPEARANCE_KEYS = { palette: 'appearance.palette' } as const

const appearance = new Hono<AppEnv>()

appearance.use('*', async (c, next) => {
  if (c.get('actor').kind === 'agent') return c.json({ error: 'not available to an agent token' }, 403)
  return next()
})

appearance.get('/', async (c) => {
  const stored = await readTenantSetting(c.env, tenantOf(c), APPEARANCE_KEYS.palette)
  // A stored id this build has never heard of reads as nothing chosen.
  const palette: PaletteId | null = isPaletteId(stored) ? stored : null
  return c.json({ palette })
})

const BodySchema = z.object({ palette: z.enum(PALETTE_IDS).nullable() }).strict()

appearance.put('/', zValidator('json', BodySchema), async (c) => {
  const { palette } = c.req.valid('json')
  if (palette === null) await clearTenantSetting(c.env, tenantOf(c), APPEARANCE_KEYS.palette)
  else await writeTenantSetting(c.env, tenantOf(c), APPEARANCE_KEYS.palette, palette)
  return c.json({ palette })
})

export default appearance
