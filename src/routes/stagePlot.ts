/**
 * The artist's stage plot: the survey's answers, stored as one document.
 *
 * A tenant setting rather than a table, because it is one record per artist
 * that is always read and written whole — the input list, the layout and the
 * power are derived from it on read (`shared/stagePlot.ts`), so nothing about
 * it is ever queried by column. `tenant_settings` is already scoped, so this
 * adds no seventeenth table to guard.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { tenantOf, type AppEnv } from '../context'
import { clearTenantSetting, readTenantSetting, writeTenantSetting } from '../lib/nudgeSettings'
import { INSTRUMENT_IDS, isPhotoChoice, MAX_GEAR, MAX_PERFORMERS, NOTE_MAX, parseStagePlot } from '../../shared/stagePlot'

export const STAGE_PLOT_KEY = 'stagePlot'

const PlotSchema = z.object({
  act: z.enum(['solo', 'duo', 'band']),
  performers: z
    .array(
      z.object({
        id: z.string().min(1).max(20),
        name: z.string().max(80),
        instruments: z.array(z.enum(INSTRUMENT_IDS as [string, ...string[]])).max(INSTRUMENT_IDS.length),
        vocals: z.enum(['lead', 'backing', 'none']),
        gear: z.array(z.string().max(120)).max(MAX_GEAR),
        // A library photo's address, 'none', or nothing for Scout's choice.
        photo: z.string().refine(isPhotoChoice, 'A photo must be an https address.').nullable().optional(),
      }),
    )
    .min(1)
    .max(MAX_PERFORMERS),
  monitors: z.enum(['wedges', 'iem', 'both', 'none']),
  playback: z.boolean(),
  notes: z.string().max(NOTE_MAX).nullable(),
  // Where each person stands, when arranged by hand. Optional, so a client
  // that has never heard of it saves exactly what it did before.
  stage: z
    .object({
      upstage: z.array(z.string().min(1).max(20)).max(MAX_PERFORMERS),
      downstage: z.array(z.string().min(1).max(20)).max(MAX_PERFORMERS),
    })
    .nullable()
    .optional(),
})

const stagePlot = new Hono<AppEnv>()

stagePlot.get('/', async (c) => {
  const plot = parseStagePlot(await readTenantSetting(c.env, tenantOf(c), STAGE_PLOT_KEY))
  return c.json({ plot })
})

stagePlot.put('/', zValidator('json', PlotSchema), async (c) => {
  const body = c.req.valid('json')
  const stored = JSON.stringify({ ...body, updatedAt: new Date().toISOString() })
  await writeTenantSetting(c.env, tenantOf(c), STAGE_PLOT_KEY, stored)
  return c.json({ plot: parseStagePlot(stored) })
})

stagePlot.delete('/', async (c) => {
  await clearTenantSetting(c.env, tenantOf(c), STAGE_PLOT_KEY)
  return c.json({ plot: null })
})

export default stagePlot
