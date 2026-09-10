/**
 * What to call this artist.
 *
 * One field, and it exists because the oversight surface has a name column and
 * nothing was filling it. `tenants.display_name` is deliberately nullable —
 * null means nobody has said, which is not the same as blank, and a missing
 * input is never a guess — so something has to be able to say.
 *
 * It is set **by the artist, on their own tenant**, rather than by the owner on
 * theirs. That is the smaller power: an owner who could rename an artist would
 * be editing a row in an account they are otherwise not allowed to read, for no
 * reason better than convenience. When invites arrive the name comes from the
 * invite at redemption and this stays the way to change it afterwards.
 *
 * `tenants` is not one of the fourteen — it is the account row rather than the
 * artist's work — so it is filtered by id here rather than through `scoped`,
 * and the id is the tenant the session already resolved to.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { tenants } from '../db/schema'
import { tenantOf, type AppEnv } from '../context'

const profile = new Hono<AppEnv>()

profile.get('/', async (c) => {
  const row = await getDb(c.env.DB).select().from(tenants).where(eq(tenants.id, tenantOf(c))).get()
  return c.json({ displayName: row?.displayName ?? null })
})

profile.patch(
  '/',
  zValidator('json', z.object({ displayName: z.string().trim().max(80).nullable() })),
  async (c) => {
    const { displayName } = c.req.valid('json')
    const tenant = tenantOf(c)
    // An empty string is not a name. It is stored as null so that "nobody has
    // said" has exactly one spelling, and the screen's blank state means the
    // same thing however it was reached.
    await getDb(c.env.DB)
      .update(tenants)
      .set({ displayName: displayName || null })
      .where(eq(tenants.id, tenant))
    return c.json({ displayName: displayName || null })
  },
)

export default profile
