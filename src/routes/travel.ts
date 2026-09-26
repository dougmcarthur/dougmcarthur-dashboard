/**
 * Where the artist travels from — the home base trip distances are measured
 * from. See src/lib/travelEnrich.ts.
 *
 * Setting it is one lookup, made here because a person is waiting on the
 * answer: a home Scout cannot find is refused with the reason rather than
 * stored as a guess. Measuring the gigs from it is not done here — that is the
 * hourly job's work, started at once in the background so the first numbers
 * do not wait an hour.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { tenantOf, type AppEnv } from '../context'
import { geocode } from '../lib/geo'
import { enrichTravel, readHome, writeHome } from '../lib/travelEnrich'

const travel = new Hono<AppEnv>()

travel.get('/home', async (c) => {
  const home = await readHome(c.env, tenantOf(c))
  return c.json({ home: home ? { place: home.place } : null })
})

travel.put(
  '/home',
  zValidator('json', z.object({ place: z.string().trim().min(2).max(120) })),
  async (c) => {
    const tenant = tenantOf(c)
    const { place } = c.req.valid('json')
    const found = await geocode(c.env, place, null)
    if (found.outcome === 'not_found') {
      return c.json({ error: `OpenStreetMap does not know "${place}". Try the town and province, like "Winnipeg, MB".` }, 422)
    }
    if (found.outcome === 'failed') {
      return c.json({ error: 'The map lookup did not answer just now. Nothing was changed — try again in a minute.' }, 502)
    }
    await writeHome(c.env, tenant, { place, ...found.value })

    // Measure the gigs from the new home now rather than on the next hourly
    // tick. Best effort: the tick picks up whatever this does not finish.
    try {
      c.executionCtx.waitUntil(
        enrichTravel(c.env, tenant, { afterRequest: true }).catch((err) => console.error('travel enrich after home change failed:', err)),
      )
    } catch {
      // No execution context outside the Worker (tests); the hourly tick covers it.
    }
    return c.json({ home: { place } })
  },
)

travel.delete('/home', async (c) => {
  await writeHome(c.env, tenantOf(c), null)
  return c.json({ home: null })
})

export default travel
