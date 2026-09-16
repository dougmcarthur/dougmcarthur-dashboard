/**
 * Connecting Google Tasks, and saying where each kind of nudge goes.
 *
 * Two things in one router because they are one decision on screen: choosing
 * Tasks as a destination is pointless without the grant, and the grant is
 * pointless without something routed to it.
 *
 * Neither needs a passkey touch. The rule stays narrow — an action that
 * changes who can get in, or destroys data across a boundary — and this is
 * neither: the worst a wrong preference does is put a reminder somewhere you
 * did not want it, which the next reconcile undoes.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { tenantOf, type AppEnv } from '../context'
import { forgetGrant, readGrant } from '../lib/googleGrant'
import { beginConsent, consentAvailable } from '../lib/googleOAuth'
import { readNudgePreferences, writeTenantSetting, NUDGE_KEYS } from '../lib/nudgeSettings'
import {
  MAX_OPENING_LEAD_DAYS,
  NUDGE_KINDS,
  nudgeKindSpec,
  type Destination,
  type NudgeKind,
} from '../../shared/nudgeRouting'

const tasks = new Hono<AppEnv>()

tasks.get('/status', async (c) => c.json(await readGrant(c.env, tenantOf(c), 'tasks')))

tasks.get('/connect', async (c) => {
  if (!consentAvailable(c.env)) {
    return c.json({ error: 'Google client credentials or TOKEN_ENCRYPTION_KEY are not configured' }, 503)
  }
  return beginConsent(c, 'tasks')
})

/**
 * Forget the grant. The list and everything in it stay in the artist's
 * account — disconnecting is not the same request as "throw away my
 * reminders", and a chore you still have to do is not less true because
 * Scout stopped watching.
 */
tasks.post('/disconnect', async (c) => {
  await forgetGrant(c.env, tenantOf(c), 'tasks')
  return c.json({ ok: true })
})

/* --------------------------------------------------------------------- */
/* Routing                                                                */
/* --------------------------------------------------------------------- */

const routing = new Hono<AppEnv>()

routing.get('/', async (c) => c.json(await readNudgePreferences(c.env, tenantOf(c))))

/**
 * Each kind validated against **its own** choices rather than against the
 * union.
 *
 * `superRefine` rather than a per-kind schema because the constraint lives in
 * `shared/nudgeRouting.ts` and should be read from there — a second copy in a
 * validator is a second place for "a show is never a task" to drift from. A
 * request naming an unavailable destination is refused with the reason, not
 * quietly coerced: the screen should never have offered it, so this failing
 * means the screen is wrong and silence would hide that.
 */
const body = z
  .object({
    show: z.string().optional(),
    deadline: z.string().optional(),
    opens: z.string().optional(),
    reply: z.string().optional(),
    openingLeadDays: z.number().int().min(0).max(MAX_OPENING_LEAD_DAYS).optional(),
  })
  .superRefine((value, ctx) => {
    for (const spec of NUDGE_KINDS) {
      const chosen = value[spec.id]
      if (chosen === undefined) continue
      if (!spec.choices.includes(chosen as Destination)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [spec.id],
          message: `${spec.label} can only go to: ${spec.choices.join(', ')}`,
        })
      }
    }
  })

routing.patch('/', zValidator('json', body), async (c) => {
  const patch = c.req.valid('json')
  const tenant = tenantOf(c)

  for (const spec of NUDGE_KINDS) {
    const chosen = patch[spec.id]
    if (chosen !== undefined) await writeTenantSetting(c.env, tenant, NUDGE_KEYS[spec.id], chosen)
  }
  if (patch.openingLeadDays !== undefined) {
    await writeTenantSetting(
      c.env,
      tenant,
      NUDGE_KEYS.openingLeadDays,
      String(patch.openingLeadDays),
    )
  }

  // Read back rather than echoed. A stored value the kind does not offer falls
  // back on read, so echoing the request would report a preference that is not
  // the one in force.
  return c.json(await readNudgePreferences(c.env, tenant))
})

/** Exported so the settings screen can render the choices it is allowed to. */
export function choicesFor(kind: NudgeKind): Destination[] {
  return nudgeKindSpec(kind).choices
}

export { routing }
export default tasks
