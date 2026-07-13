import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { syncTargets } from '../db/schema'
import { getSentEmailsForAddresses, gmailConfigured } from '../lib/gmail'
import type { Env } from '../types'

const reconcile = new Hono<{ Bindings: Env }>()

// GET /api/sync/reconcile — preview: what would change, plus draft diffs
reconcile.get('/', async (c) => {
  if (!gmailConfigured(c.env)) {
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

  const db = getDb(c.env.DB)
  const targets = await db.select().from(syncTargets)

  const emails = targets.map((t) => t.contactEmail).filter((e): e is string => !!e)
  const sentByEmail = await getSentEmailsForAddresses(c.env, emails)

  const results = targets
    .filter((t) => t.contactEmail && sentByEmail.has(t.contactEmail))
    .map((t) => {
      const sent = sentByEmail.get(t.contactEmail!)!
      const statusChange =
        t.status === 'draft_ready'
          ? { from: 'draft_ready', to: 'pitched' }
          : null

      return {
        id: t.id,
        name: t.name,
        contactEmail: t.contactEmail,
        currentStatus: t.status,
        statusChange,
        sentEmail: {
          date: sent.date,
          subject: sent.subject,
          body: sent.body,
        },
        // Include stored drafts for diff comparison
        pitchDraft: t.pitchDraft,
        pitchSent: t.pitchSent,
        // Has a new sent email since last reconcile?
        isNew: !t.reconciledAt || sent.date > t.reconciledAt,
      }
    })

  const unmatched = targets.filter(
    (t) => t.contactEmail && !sentByEmail.has(t.contactEmail),
  ).map((t) => ({ id: t.id, name: t.name, contactEmail: t.contactEmail, currentStatus: t.status }))

  return c.json({ results, unmatched })
})

// POST /api/sync/reconcile/apply — write status updates + store sent bodies
reconcile.post(
  '/apply',
  zValidator(
    'json',
    z.object({
      updates: z.array(
        z.object({
          id: z.number().int(),
          newStatus: z.string().optional(),
          pitchSent: z.string().optional(),
          // If true, copy sent body back into pitch_draft for future reference
          learnFromSent: z.boolean().optional(),
        }),
      ),
    }),
  ),
  async (c) => {
    const db = getDb(c.env.DB)
    const { updates } = c.req.valid('json')
    const now = new Date().toISOString()

    const applied: number[] = []

    for (const u of updates) {
      const patch: Record<string, unknown> = {
        reconciledAt: now,
        updatedAt: now,
      }
      if (u.newStatus) patch.status = u.newStatus
      if (u.pitchSent) patch.pitchSent = u.pitchSent
      if (u.learnFromSent && u.pitchSent) patch.pitchDraft = u.pitchSent

      await db.update(syncTargets).set(patch).where(eq(syncTargets.id, u.id))
      applied.push(u.id)
    }

    return c.json({ applied })
  },
)

export default reconcile
