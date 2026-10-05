/**
 * Stage plots and tech riders a person has to look at, read by the research
 * routine. See shared/documentReadings.ts.
 *
 * Two of these routes are in `AGENT_ROUTES`: the list of what is waiting and
 * the write of a transcription. The write checks the asset belongs to this
 * artist and still points at the file that was read, so a reading cannot be
 * filed against somebody else's library or against a file that has changed
 * since. The readings are one `tenant_settings` row, like the stage plot they
 * feed — always read and written whole, never queried by column.
 */

import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { tenantOf, type AppEnv } from '../context'
import { getDb } from '../db'
import { artistAssets } from '../db/schema'
import { scoped } from '../db/scope'
import { readTenantSetting, writeTenantSetting } from '../lib/nudgeSettings'
import {
  READING_MAX,
  READINGS_KEY,
  parseReadings,
  pendingDocuments,
  wantsReading,
  withReading,
} from '../../shared/documentReadings'

const route = new Hono<AppEnv>()

async function documents(c: Context<AppEnv>) {
  return getDb(c.env.DB)
    .select({
      id: artistAssets.id,
      kind: artistAssets.kind,
      label: artistAssets.label,
      value: artistAssets.value,
      archived: artistAssets.archived,
    })
    .from(artistAssets)
    .where(scoped(artistAssets, tenantOf(c), eq(artistAssets.kind, 'document')))
}

/** Everything read so far, for the stage-plot survey's clues. */
route.get('/', async (c) => {
  const readings = parseReadings(await readTenantSetting(c.env, tenantOf(c), READINGS_KEY))
  const pending = pendingDocuments(await documents(c), readings)
  return c.json({ readings, pending })
})

/** What the reader should look at next. */
route.get('/pending', async (c) => {
  const readings = parseReadings(await readTenantSetting(c.env, tenantOf(c), READINGS_KEY))
  return c.json({ documents: pendingDocuments(await documents(c), readings) })
})

route.post(
  '/',
  zValidator(
    'json',
    z.object({
      assetId: z.number().int().positive(),
      url: z.string().url().max(2000),
      text: z.string().trim().min(1).max(READING_MAX),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json')
    const tenant = tenantOf(c)
    const asset = await getDb(c.env.DB)
      .select({
        id: artistAssets.id,
        kind: artistAssets.kind,
        label: artistAssets.label,
        value: artistAssets.value,
        archived: artistAssets.archived,
      })
      .from(artistAssets)
      .where(scoped(artistAssets, tenant, and(eq(artistAssets.id, body.assetId))))
      .get()
    if (!asset || !wantsReading(asset)) return c.json({ error: 'No stage plot or tech rider with that id is waiting to be read.' }, 404)
    if (asset.value!.trim() !== body.url.trim()) {
      return c.json({ error: 'That document now points at a different file. List the pending documents again.' }, 409)
    }
    const readings = parseReadings(await readTenantSetting(c.env, tenant, READINGS_KEY))
    const next = withReading(readings, {
      assetId: asset.id,
      label: asset.label,
      url: body.url.trim(),
      text: body.text,
      readAt: new Date().toISOString(),
    })
    await writeTenantSetting(c.env, tenant, READINGS_KEY, JSON.stringify(next))
    return c.json({ id: asset.id, read: true })
  },
)

export default route
