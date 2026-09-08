import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc, isNull, inArray } from 'drizzle-orm'
import { getDb } from '../db'
import { gigReplies, gigCorrespondents, gigOpportunities } from '../db/schema'
import { gmailConfigured } from '../lib/gmail'
import { fetchReplies, planReplyScan } from '../lib/gmailReplies'
import { recordEvent } from '../lib/notificationEvents'
import {
  matchReply,
  matchConfidence,
  type Binding,
  type MatchableGig,
} from '../../shared/replyMatch'
import { classifyReply, REPLY_CLASS_LABELS } from '../../shared/replyClassify'
import { normaliseGigStatus } from '../../shared/gigStatus'
import type { Env } from '../types'

/**
 * Phase 4 — reading the organiser's answer.
 *
 * The rule this whole router is built around: **classification proposes, it
 * never transitions.** Nothing here writes `gig_opportunities.status`. A reply
 * you accept binds the correspondent and records that you agreed; moving the
 * row is a separate call to `PATCH /api/gigs/:id`, which is the one place that
 * owns what a transition means and refuses the ones the pipeline does not
 * offer. Two calls is the correct number — a wrong auto-transition here tells
 * you that you were rejected when you were not.
 */
const replies = new Hono<{ Bindings: Env }>()

function notConfigured(c: { json: Function; env: Env }) {
  return c.json(
    {
      error: 'Gmail not configured',
      missing: (['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'] as const).filter(
        (k) => !c.env[k],
      ),
    },
    503,
  )
}

function todayOf(c: { req: { query: (k: string) => string | undefined } }): string {
  const q = c.req.query('today')
  return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 10)
}

async function loadBindings(env: Env): Promise<Binding[]> {
  const db = getDb(env.DB)
  const rows = await db.select().from(gigCorrespondents)
  return rows.map((r) => ({
    gigId: r.gigId,
    kind: r.kind === 'thread' ? 'thread' : 'address',
    value: r.value,
  }))
}

function toMatchable(row: typeof gigOpportunities.$inferSelect): MatchableGig {
  return {
    id: row.id,
    name: row.name,
    organizer: row.organizer,
    status: row.status ?? 'discovered',
    url: row.url,
    applicationUrl: row.applicationUrl,
    submittedAt: row.submittedAt,
  }
}

/** What was found, with the gig it points at resolved for display. */
replies.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const showResolved = c.req.query('resolved') === 'true'

  const rows = await db
    .select()
    .from(gigReplies)
    .where(showResolved ? undefined : isNull(gigReplies.resolution))
    .orderBy(desc(gigReplies.receivedAt))

  const gigIds = [...new Set(rows.map((r) => r.gigId).filter((id): id is number => id !== null))]
  const gigs = gigIds.length
    ? await db.select().from(gigOpportunities).where(inArray(gigOpportunities.id, gigIds))
    : []
  const byId = new Map(gigs.map((g) => [g.id, g]))

  return c.json({
    items: rows.map((r) => ({
      ...r,
      inSpam: r.inSpam === 1,
      matchAmbiguous: r.matchAmbiguous === 1,
      matchSignals: safeJson(r.matchSignals),
      classLabel: REPLY_CLASS_LABELS[(r.classification ?? 'unclear') as keyof typeof REPLY_CLASS_LABELS],
      gig: r.gigId ? { id: r.gigId, name: byId.get(r.gigId)?.name ?? null, status: byId.get(r.gigId)?.status ?? null } : null,
    })),
    unresolved: rows.filter((r) => !r.resolution).length,
  })
})

function safeJson(raw: string | null): unknown[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/**
 * Read the mailbox and propose.
 *
 * Re-runnable: a message already stored is refreshed rather than duplicated,
 * and one you have already resolved is left exactly as you left it — a re-scan
 * must not resurrect a decision you already made.
 */
replies.post('/scan', async (c) => {
  if (!gmailConfigured(c.env)) return notConfigured(c)

  const db = getDb(c.env.DB)
  const today = todayOf(c)
  const now = new Date().toISOString()

  const allGigs = await db.select().from(gigOpportunities)
  const gigs = allGigs.map(toMatchable)
  const bindings = await loadBindings(c.env)

  const plan = planReplyScan({ gigs, bindings, today })
  if (plan.queries.length === 0) {
    return c.json({ ...plan, found: 0, stored: 0, skipped: 0, items: [] })
  }

  const messages = await fetchReplies(c.env, plan)

  const existing = messages.length
    ? await db
        .select()
        .from(gigReplies)
        .where(inArray(gigReplies.gmailMessageId, messages.map((m) => m.messageId)))
    : []
  const byMessage = new Map(existing.map((r) => [r.gmailMessageId, r]))

  let stored = 0
  let skipped = 0
  const fresh: Array<{ subject: string; gigName: string | null; classification: string }> = []

  for (const message of messages) {
    const prior = byMessage.get(message.messageId)
    // A decision already made is not re-proposed. This is what makes the scan
    // safe to run on a schedule.
    if (prior?.resolution) {
      skipped++
      continue
    }

    const { candidates, ambiguous } = matchReply(message, gigs, bindings)
    const best = candidates[0]
    const classification = classifyReply(message.body)

    const values = {
      gmailMessageId: message.messageId,
      gmailThreadId: message.threadId,
      // Left null when two gigs matched equally well: naming one would be
      // inventing the answer the matcher just said it did not have.
      gigId: ambiguous ? null : (best?.gigId ?? null),
      fromAddress: message.from,
      fromName: message.fromName ?? null,
      subject: message.subject,
      snippet: message.snippet.slice(0, 400),
      receivedAt: message.receivedAt,
      inSpam: message.inSpam ? 1 : 0,
      classification: classification.kind,
      classConfidence: classification.confidence,
      evidence: classification.evidence,
      proposedStatus: classification.proposes,
      matchScore: best?.score ?? 0,
      matchSignals: JSON.stringify(
        candidates.slice(0, 3).map((cand) => ({
          gigId: cand.gigId,
          gigName: cand.gigName,
          score: cand.score,
          confidence: matchConfidence(cand),
          signals: cand.signals,
        })),
      ),
      matchAmbiguous: ambiguous ? 1 : 0,
      createdAt: now,
    }

    if (prior) {
      await db.update(gigReplies).set(values).where(eq(gigReplies.id, prior.id))
    } else {
      await db.insert(gigReplies).values(values)
      stored++
      fresh.push({
        subject: message.subject,
        gigName: best?.gigName ?? null,
        classification: classification.kind,
      })
    }
  }

  if (stored > 0) {
    const decisive = fresh.filter((f) => f.classification !== 'unclear' && f.classification !== 'acknowledged')
    await recordEvent(c.env, {
      kind: 'reconcile',
      tier: decisive.length > 0 ? 'attention' : 'info',
      title: stored === 1 ? 'One reply found in your mail' : `${stored} replies found in your mail`,
      body: decisive.length
        ? decisive.map((f) => `${f.gigName ?? 'Unmatched'}: ${REPLY_CLASS_LABELS[f.classification as keyof typeof REPLY_CLASS_LABELS]}`).join(' · ')
        : 'Acknowledgements only — nothing needs a decision.',
      href: '#review/reply',
      action: 'Read them',
      dedupeKey: `replies:${now.slice(0, 13)}`,
    })
  }

  return c.json({ ...plan, found: messages.length, stored, skipped })
})

const AcceptSchema = z.object({
  /** Overrides the matched gig — the answer when the matcher got it wrong. */
  gigId: z.number().int().positive().optional(),
  /** Bind this sender and thread to the gig, so the next one is a lookup. */
  remember: z.boolean().optional(),
})

/**
 * "Yes, this is about that application."
 *
 * Records the judgement and, unless told otherwise, remembers the address and
 * the thread. That is the whole answer to replies arriving from domains that
 * have nothing to do with the festival: it costs one confirmation, once.
 *
 * It does **not** move the gig. See the note at the top of this file.
 */
replies.post('/:id/accept', zValidator('json', AcceptSchema), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'A reply id is required.' }, 400)

  const db = getDb(c.env.DB)
  const body = c.req.valid('json')
  const row = await db.select().from(gigReplies).where(eq(gigReplies.id, id)).get()
  if (!row) return c.json({ error: 'not found' }, 404)

  const gigId = body.gigId ?? row.gigId
  if (!gigId) {
    return c.json({ error: 'Nothing matched this reply — say which application it is about.' }, 400)
  }

  const gig = await db.select().from(gigOpportunities).where(eq(gigOpportunities.id, gigId)).get()
  if (!gig) return c.json({ error: 'That gig does not exist.' }, 404)

  const now = new Date().toISOString()

  if (body.remember !== false) {
    for (const [kind, value] of [
      ['address', row.fromAddress],
      ['thread', row.gmailThreadId],
    ] as const) {
      // An address belongs to one gig. Confirming it elsewhere moves the
      // binding rather than leaving two that contradict each other.
      await db
        .delete(gigCorrespondents)
        .where(and(eq(gigCorrespondents.kind, kind), eq(gigCorrespondents.value, value)))
      await db.insert(gigCorrespondents).values({ gigId, kind, value, createdAt: now })
    }
  }

  await db
    .update(gigReplies)
    .set({ gigId, resolution: 'accepted', resolvedAt: now })
    .where(eq(gigReplies.id, id))

  return c.json({
    id,
    gigId,
    gigName: gig.name,
    currentStatus: normaliseGigStatus(gig.status),
    /** What the reading suggests — applied by PATCH /api/gigs/:id, not here. */
    proposedStatus: row.proposedStatus,
    remembered: body.remember !== false,
  })
})

/** "No" — to the match, the reading, or the whole message. */
replies.post('/:id/dismiss', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'A reply id is required.' }, 400)

  const db = getDb(c.env.DB)
  const row = await db.select().from(gigReplies).where(eq(gigReplies.id, id)).get()
  if (!row) return c.json({ error: 'not found' }, 404)

  await db
    .update(gigReplies)
    .set({ resolution: 'dismissed', resolvedAt: new Date().toISOString() })
    .where(eq(gigReplies.id, id))

  return c.json({ id, resolution: 'dismissed' })
})

export default replies
