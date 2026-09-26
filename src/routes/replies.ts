import { rarityIndexFor } from '../lib/termRarity'
import { significantWords } from '../../shared/replyMatch'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, desc, isNull, inArray } from 'drizzle-orm'
import { getDb } from '../db'
import { gigReplies, gigCorrespondents, gigOpportunities, artistAssets } from '../db/schema'
import { scoped, withTenant, type TenantId } from '../db/scope'
import { readGigs, readGig } from '../db/gigRows'
import { tenantOf, type AppEnv } from '../context'
import { gmailConfigured, type GmailEnv } from '../lib/gmail'
import { fetchReplies, planReplyScan, sentThreadIds } from '../lib/gmailReplies'
import { recordEvent } from '../lib/notificationEvents'
import { FORGOTTEN_ON_DISMISS } from '../lib/replyRetention'
import {
  matchReply,
  matchConfidence,
  type Binding,
  type MatchableGig,
} from '../../shared/replyMatch'
import { classifyReply, REPLY_CLASS_LABELS } from '../../shared/replyClassify'
import { recogniseAsks, composeReplyDraft, type AskReading, type RecognisedAsk } from '../../shared/replyDraft'
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
const replies = new Hono<AppEnv>()

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

async function loadBindings(env: Env, tenant: TenantId): Promise<Binding[]> {
  const db = getDb(env.DB)
  const rows = await db.select().from(gigCorrespondents).where(scoped(gigCorrespondents, tenant))
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
  const tenant = tenantOf(c)
  const showResolved = c.req.query('resolved') === 'true'

  const rows = await db
    .select()
    .from(gigReplies)
    .where(scoped(gigReplies, tenant, showResolved ? undefined : isNull(gigReplies.resolution)))
    .orderBy(desc(gigReplies.receivedAt))

  const gigIds = [...new Set(rows.map((r) => r.gigId).filter((id): id is number => id !== null))]
  const gigs = gigIds.length
    ? await db
        .select()
        .from(gigOpportunities)
        .where(scoped(gigOpportunities, tenant, inArray(gigOpportunities.id, gigIds)))
        .then(readGigs)
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
/**
 * One scan, shared by the button and the cron.
 *
 * `today` is an argument rather than read here, for the same reason the queue
 * takes one: `planReplyScan` derives its lookback from it, and a scan whose
 * horizon depends on when it happened to run is a scan you cannot reason
 * about.
 */
export async function runReplyScan(
  env: Env & GmailEnv,
  tenant: TenantId,
  today: string,
): Promise<ReplyScanOutcome> {
  const db = getDb(env.DB)
  const now = new Date().toISOString()

  const allGigs = readGigs(await db.select().from(gigOpportunities).where(scoped(gigOpportunities, tenant)))
  const gigs = allGigs.map(toMatchable)
  const bindings = await loadBindings(env, tenant)

  const plan = planReplyScan({ gigs, bindings, today })
  if (plan.queries.length === 0) {
    return { ...plan, found: 0, stored: 0, skipped: 0, unmatched: 0, cleared: 0 }
  }

  const messages = await fetchReplies(env, plan)

  const existing = messages.length
    ? await db
        .select()
        .from(gigReplies)
        .where(
          scoped(
            gigReplies,
            tenant,
            inArray(gigReplies.gmailMessageId, messages.map((m) => m.messageId)),
          ),
        )
    : []
  const byMessage = new Map(existing.map((r) => [r.gmailMessageId, r]))

  let stored = 0
  let skipped = 0
  // Fetched, read, and found to be about none of your applications.
  let unmatched = 0
  // Of those, the ones an earlier scan had filed and this one removed.
  let cleared = 0
  const fresh: Array<{ subject: string | null; gigName: string | null; classification: string }> = []

  // Measured once for the whole scan rather than per message: the question is
  // about the mailbox, not about any one email, and the answer is cached for a
  // month anyway. See src/lib/termRarity.ts.
  // One search, reused for every message in the scan.
  const sentThreads = gmailConfigured(env)
    ? await sentThreadIds(env, plan.windowDays)
    : new Set<string>()

  const rarity = await rarityIndexFor(
    env,
    gigs.flatMap((g) => significantWords(g.name)),
    new Date(),
  )

  for (const message of messages) {
    const prior = byMessage.get(message.messageId)
    // A decision already made is not re-proposed. This is what makes the scan
    // safe to run on a schedule.
    if (prior?.resolution) {
      skipped++
      continue
    }

    // Mail that says in its own headers it was not written by a person.
    // Dropped before scoring rather than weighed, because the two signals
    // behind this verdict are reliable by specification — a mailing list and
    // an auto-responder both declare themselves, and an organiser's reply
    // declares neither. See shared/bulkMail.ts.
    //
    // Deliberately before the resolution check above is not possible and
    // deliberately after it is: a message somebody already decided about stays
    // decided, whatever its headers say now.
    if (message.automation === 'automated') {
      skipped++
      continue
    }

    const { candidates, ambiguous } = matchReply(
      { ...message, inYourThread: sentThreads.has(message.threadId) },
      gigs,
      bindings,
      rarity,
    )
    // Nothing in the pipeline matched, so this is not a reply to an
    // application and does not belong in a queue of them.
    //
    // This is the half the precision work missed. Weighing words by rarity
    // stopped a pizza receipt producing a *candidate*, and the row was written
    // anyway — `best` undefined, score zero, signals empty — so the Review
    // page went on listing it under "Nothing in the pipeline matched this
    // one". The scoring was fixed and the queue was not.
    //
    // A row that already exists is *deleted* rather than left, so the fix
    // reaches the mail the old scan already filed instead of only new mail.
    // That needs no migration and no backfill: the sweep window is derived
    // from the oldest submission, so the next scan re-fetches those messages,
    // re-scores them under the current rules and clears the ones that no
    // longer match. Compare wanted against present, like every other
    // reconcile here.
    //
    // Nothing is lost. The message stays in the mailbox, it is re-fetched on
    // every scan while it is inside the window, and a gig added next week
    // gives it a candidate it did not have today.
    //
    // `candidates.length` rather than `gigId`: an *ambiguous* match has
    // candidates and deliberately stores a null gig, because naming one would
    // invent the answer the matcher just said it lacked. Those stay.
    if (candidates.length === 0) {
      if (prior) {
        await db.delete(gigReplies).where(scoped(gigReplies, tenant, eq(gigReplies.id, prior.id)))
        cleared++
      }
      unmatched++
      continue
    }

    const best = candidates[0]
    const classification = classifyReply(message.body)
    // Read here, not on demand: this is the only moment the whole body
    // exists. See migration 0015.
    const reading = recogniseAsks(message.body)

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
          // Carried so the screen can say "confirmed" rather than re-deriving
          // it from the signals and getting a different answer.
          bound: cand.bound,
          signals: cand.signals,
        })),
      ),
      matchAmbiguous: ambiguous ? 1 : 0,
      asks: JSON.stringify(reading.asks),
      unrecognisedAsks: JSON.stringify(reading.unrecognised),
      createdAt: now,
    }

    if (prior) {
      await db.update(gigReplies).set(values).where(scoped(gigReplies, tenant, eq(gigReplies.id, prior.id)))
    } else {
      await db.insert(gigReplies).values(withTenant(tenant, values))
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
    await recordEvent(env, tenant, {
      kind: 'reconcile',
      tier: decisive.length > 0 ? 'attention' : 'info',
      title: stored === 1 ? 'One reply found in your mail' : `${stored} replies found in your mail`,
      body: decisive.length
        ? decisive.map((f) => `${f.gigName ?? 'Unmatched'}: ${REPLY_CLASS_LABELS[f.classification as keyof typeof REPLY_CLASS_LABELS]}`).join(' · ')
        : 'Acknowledgements only — nothing needs a decision.',
      href: '#review/mail',
      action: 'Read them',
      dedupeKey: `replies:${now.slice(0, 13)}`,
    })
  }

  if (cleared > 0) {
    console.log(`cleared ${cleared} replies that no longer match anything`)
  }

  return { ...plan, found: messages.length, stored, skipped, unmatched, cleared }
}

/**
 * The plan plus what the run did with it. Built off `planReplyScan`'s own
 * return type rather than restated, so a field added there cannot quietly
 * stop being reported here.
 */
export type ReplyScanOutcome = ReturnType<typeof planReplyScan> & {
  found: number
  stored: number
  skipped: number
  /** Read and found to be about none of your applications. */
  unmatched: number
  /** Of those, the ones an earlier scan had filed and this one removed. */
  cleared: number
}

replies.post('/scan', async (c) => {
  if (!gmailConfigured(c.env)) return notConfigured(c)
  return c.json(await runReplyScan(c.env, tenantOf(c), todayOf(c)))
})

/**
 * The reply to their question, drafted from the artist database.
 *
 * Composed on read rather than stored, for the reason the EPK is: an answer
 * that was missing when the mail arrived and is on file now should appear
 * without a re-scan. The asks themselves are stored, because the body they
 * were read from is not.
 *
 * Nothing here sends anything. See shared/replyDraft.ts.
 */
replies.get('/:id/draft', async (c) => {
  const db = getDb(c.env.DB)
  const tenant = tenantOf(c)
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'A reply id is required.' }, 400)

  const reply = await db.select().from(gigReplies).where(scoped(gigReplies, tenant, eq(gigReplies.id, id))).get()
  if (!reply) return c.json({ error: 'not found' }, 404)

  // Rows stored before migration 0015 carry no asks. Re-reading the snippet
  // is a worse answer than reading the email was, and it says so: the draft
  // is marked approximate rather than presented as complete.
  const stored = parseAsks(reply.asks, reply.unrecognisedAsks)
  const approximate = stored === null
  const reading = stored ?? recogniseAsks([reply.snippet, reply.evidence].filter(Boolean).join('\n'))

  const gig = reply.gigId
    ? await db
        .select()
        .from(gigOpportunities)
        .where(scoped(gigOpportunities, tenant, eq(gigOpportunities.id, reply.gigId)))
        .get()
        .then((row) => readGig(row))
    : null
  const assets = await db.select().from(artistAssets).where(scoped(artistAssets, tenant))

  return c.json({
    replyId: reply.id,
    gig: gig ? { id: gig.id, name: gig.name, status: gig.status } : null,
    draft: composeReplyDraft({
      gig: gig ? { name: gig.name, organizer: gig.organizer } : null,
      reply: { subject: reply.subject, fromName: reply.fromName, evidence: reply.evidence },
      reading,
      assets,
      approximate,
    }),
  })
})

/** Stored asks, or null when the row predates migration 0015. */
function parseAsks(asks: string | null, unrecognised: string | null): AskReading | null {
  if (!asks) return null
  try {
    const parsed = JSON.parse(asks)
    if (!Array.isArray(parsed)) return null
    return {
      asks: parsed as RecognisedAsk[],
      unrecognised: Array.isArray(safeJson(unrecognised)) ? (safeJson(unrecognised) as string[]) : [],
    }
  } catch {
    return null
  }
}

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
  const tenant = tenantOf(c)
  const body = c.req.valid('json')
  const row = await db.select().from(gigReplies).where(scoped(gigReplies, tenant, eq(gigReplies.id, id))).get()
  if (!row) return c.json({ error: 'not found' }, 404)

  const gigId = body.gigId ?? row.gigId
  if (!gigId) {
    return c.json({ error: 'Nothing matched this reply — say which application it is about.' }, 400)
  }

  // Scoped, and this one matters more than most: `gigId` can come straight
  // from the request body, so an unscoped lookup would let a reply be bound to
  // a stranger's gig by guessing an integer.
  const gig = readGig(
    await db
      .select()
      .from(gigOpportunities)
      .where(scoped(gigOpportunities, tenant, eq(gigOpportunities.id, gigId)))
      .get(),
  )
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
        .where(
          scoped(
            gigCorrespondents,
            tenant,
            eq(gigCorrespondents.kind, kind),
            eq(gigCorrespondents.value, value),
          ),
        )
      await db
        .insert(gigCorrespondents)
        .values(withTenant(tenant, { gigId, kind, value, createdAt: now }))
    }
  }

  await db
    .update(gigReplies)
    .set({ gigId, resolution: 'accepted', resolvedAt: now })
    .where(scoped(gigReplies, tenant, eq(gigReplies.id, id)))

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
  const tenant = tenantOf(c)
  const row = await db.select().from(gigReplies).where(scoped(gigReplies, tenant, eq(gigReplies.id, id))).get()
  if (!row) return c.json({ error: 'not found' }, 404)

  // The decision and the forgetting in one write: nothing shows a dismissed
  // reply again, so its mail content has no job left. The id stays, which is
  // what keeps the next scan from proposing it again — see replyRetention.ts.
  await db
    .update(gigReplies)
    .set({ resolution: 'dismissed', resolvedAt: new Date().toISOString(), ...FORGOTTEN_ON_DISMISS })
    .where(scoped(gigReplies, tenant, eq(gigReplies.id, id)))

  return c.json({ id, resolution: 'dismissed' })
})

export default replies
