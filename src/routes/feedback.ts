/**
 * Feedback from the app to whoever runs it. See `shared/feedback.ts`.
 *
 * Artist-side only: this router is `AppEnv`, and reading what arrived is on
 * the oversight surface (`/api/admin/feedback`). The sender sees their message
 * and the context before it goes, and nothing arrives that they did not see.
 *
 * The owner hears about it through the bell, as an **event** — a message
 * arriving is not recoverable from later state. The title names the artist,
 * never a tenant id, and the body is the start of the message.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, eq, gte, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { feedback as feedbackTable, tenants } from '../db/schema'
import { tenantOf, type AppEnv } from '../context'
import { ownerTenant } from '../lib/actor'
import { recordEvent } from '../lib/notificationEvents'
import {
  FEEDBACK_ERRORS_MAX,
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_TRAIL_MAX,
  feedbackKindLabel,
} from '../../shared/feedback'

/** More than this in an hour from one artist is a stuck button, not a conversation. */
export const FEEDBACK_PER_HOUR = 10

const short = (max: number) => z.string().max(max)

const ContextSchema = z.object({
  page: short(40),
  section: short(80).nullable(),
  trail: z.array(short(200)).max(FEEDBACK_TRAIL_MAX),
  errors: z
    .array(
      z.object({
        at: short(40),
        what: short(200),
        status: z.number().int().nullable(),
        message: short(300),
      }),
    )
    .max(FEEDBACK_ERRORS_MAX),
  build: short(40),
  viewport: short(20),
  theme: z.enum(['light', 'dark']),
  timeZone: short(60),
  browser: short(60),
})

export const FeedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS.map((k) => k.id) as [string, ...string[]]),
  message: z.string().trim().min(1).max(FEEDBACK_MESSAGE_MAX),
  context: ContextSchema,
})

const feedback = new Hono<AppEnv>()

feedback.post('/', zValidator('json', FeedbackSchema), async (c) => {
  const actor = c.get('actor')
  // A person's message. An agent has nothing to say here, and an issued token
  // cannot reach this route anyway — it is not in shared/agentRoutes.ts.
  if (actor.kind !== 'user') return c.json({ error: 'feedback comes from a signed-in person' }, 403)

  const tenant = tenantOf(c)
  const db = getDb(c.env.DB)
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const recent = await db
    .select({ count: sql<number>`count(*)` })
    .from(feedbackTable)
    .where(and(eq(feedbackTable.tenantId, tenant), gte(feedbackTable.createdAt, since)))
    .get()
  if ((recent?.count ?? 0) >= FEEDBACK_PER_HOUR) {
    return c.json({ error: 'That is a lot of feedback in one hour — try again a little later.' }, 429)
  }

  const { kind, message, context } = c.req.valid('json')
  const createdAt = new Date().toISOString()
  await db.insert(feedbackTable).values({
    tenantId: tenant,
    userId: actor.userId,
    kind,
    message,
    context: JSON.stringify(context),
    createdAt,
    readAt: null,
  })

  // The owner's bell, on the owner's tenant. Best-effort: the message is
  // stored either way, and a bell that failed to ring must not cost the sender
  // a red error for something that arrived.
  const owner = await ownerTenant(c.env)
  if (owner) {
    const sender = await db.select().from(tenants).where(eq(tenants.id, tenant)).get()
    const who = sender?.displayName ?? 'an artist'
    await recordEvent(c.env, owner, {
      kind: 'feedback',
      tier: kind === 'broken' ? 'attention' : 'info',
      title: `${feedbackKindLabel(kind)} — from ${who}`,
      body: message.length > 200 ? `${message.slice(0, 199)}…` : message,
      href: '#settings/account',
      action: 'Read it in admin mode',
      createdAt,
    })
  }

  return c.json({ ok: true })
})

export default feedback
