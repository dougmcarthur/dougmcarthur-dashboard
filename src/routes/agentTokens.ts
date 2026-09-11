/**
 * The research agents' credentials, one per artist.
 *
 * `API_TOKEN` is a Worker secret with no tenant attached, which was right while
 * one artist owned every row and is wrong the moment two do: the agents POST
 * gigs, and a gig belongs to somebody. Nothing breaks visibly when one lands in
 * the wrong tenant — it simply appears on a stranger's Overview — which is why
 * this is worth building before it is needed rather than after.
 *
 * Three properties, each of which has a reason:
 *
 * **The token is shown once and stored hashed.** Same treatment as a session
 * cookie and an enrolment code. A list of what exists is not a set of working
 * credentials, and a screen that can re-show a token is a screen that leaks one.
 *
 * **Issuing and revoking cost a passkey touch.** These are the actions that
 * change who can write to your account, which is the narrow rule elevation
 * exists for (`shared/auth.ts`, migration 0020). A stolen session cookie that
 * could mint an API token would survive every other remedy in the app.
 *
 * **An agent cannot manage tokens.** The bearer path reaches this router like
 * any other, and is refused: a credential must not be able to issue its own
 * successor, or revoking one is a race rather than an ending.
 */

import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { agentTokens } from '../db/schema'
import { scoped } from '../db/scope'
import { tenantOf, type AppEnv } from '../context'
import { randomToken, sha256Hex } from '../lib/auth'
import { elevationState } from '../../shared/auth'

const tokens = new Hono<AppEnv>()

/**
 * The elevation gate, plus the actor check that has to come with it.
 *
 * Returns the refusal, or null when the request may proceed. Written as one
 * function because the two checks belong together: an agent has no session, so
 * asking "is this session elevated" of one is a question with no answer, and
 * the honest reading of no answer is no.
 */
function refusal(c: Context<AppEnv>) {
  const actor = c.get('actor')
  if (actor.kind !== 'user') {
    return c.json({ error: 'An agent token cannot manage agent tokens.' }, 403)
  }
  if (!elevationState({ now: new Date(), elevatedAt: actor.session.elevatedAt }).elevated) {
    return c.json(
      { error: 'Confirm it is you before changing how you sign in.', needsElevation: true },
      403,
    )
  }
  return null
}

/** What exists, and never what it is. */
tokens.get('/', async (c) => {
  const rows = await getDb(c.env.DB)
    .select()
    .from(agentTokens)
    .where(scoped(agentTokens, tenantOf(c)))
    .orderBy(desc(agentTokens.createdAt))

  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      label: r.label,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      revokedAt: r.revokedAt,
    })),
  })
})

const IssueSchema = z.object({ label: z.string().trim().min(1).max(80) })

tokens.post('/', zValidator('json', IssueSchema), async (c) => {
  const no = refusal(c)
  if (no) return no

  const { label } = c.req.valid('json')
  const secret = randomToken()
  const id = randomToken(16)

  await getDb(c.env.DB)
    .insert(agentTokens)
    .values({
      id,
      tenantId: tenantOf(c),
      tokenHash: await sha256Hex(secret),
      label,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    })

  // The one and only time this value exists outside the agent's own
  // configuration. Named `token` rather than folded into the row so nothing
  // reading the list shape can accidentally render it.
  return c.json({ id, label, token: secret }, 201)
})

/**
 * Revoked, not deleted.
 *
 * A row that is gone cannot tell you a token existed and stopped working,
 * which is exactly the question asked when an agent starts 401ing.
 */
tokens.delete('/:id', async (c) => {
  const no = refusal(c)
  if (no) return no

  const id = c.req.param('id')
  const db = getDb(c.env.DB)
  const row = await db
    .select()
    .from(agentTokens)
    .where(scoped(agentTokens, tenantOf(c), eq(agentTokens.id, id)))
    .get()
  if (!row) return c.json({ error: 'not found' }, 404)

  await db
    .update(agentTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(scoped(agentTokens, tenantOf(c), eq(agentTokens.id, id)))

  return c.json({ id, revoked: true })
})

export default tokens
