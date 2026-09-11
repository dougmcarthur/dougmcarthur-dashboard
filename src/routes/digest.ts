import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { desc } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, syncTargets, promoDrafts, digestReports } from '../db/schema'
import { scoped, withTenant, type TenantId } from '../db/scope'
import { tenantOf, type AppEnv } from '../context'
import { buildReviewQueue } from '../../shared/reviewQueue'
import { buildDigest, type Digest } from '../../shared/digest'
import type { GigOpportunity, SyncTarget, PromoDraft } from '../../shared/types'
import { subjectFor, renderHtml, renderText } from '../lib/digestMail'
import { sendMail, mailerConfigured } from '../lib/mailer'
import { readDigestSettings, writeSetting, DIGEST_KEYS } from '../lib/settings'
import { describeSchedule, nextRun } from '../../shared/digestSchedule'
import type { Env } from '../types'

/**
 * The weekly digest: preview it, send it, configure it.
 *
 * `GET /preview` renders exactly what a send would produce without sending, so
 * the content can be checked — and iterated on — without a mailbox, a binding,
 * or a week of waiting. It also does not write the reporting marks, which is
 * what keeps previewing free of side effects: previewing twice must not make
 * the real send go quiet.
 */
const digest = new Hono<AppEnv>()

/** Builds the digest and the mail bodies. Shared by preview, send and cron. */
export async function composeDigest(
  env: Env,
  tenant: TenantId,
): Promise<{ digest: Digest; subject: string; html: string; text: string }> {
  const db = getDb(env.DB)
  const [gigs, sync, promo, prior] = await Promise.all([
    db.select().from(gigOpportunities).where(scoped(gigOpportunities, tenant)).orderBy(desc(gigOpportunities.discoveredAt)),
    db.select().from(syncTargets).where(scoped(syncTargets, tenant)).orderBy(desc(syncTargets.discoveredAt)),
    db.select().from(promoDrafts).where(scoped(promoDrafts, tenant)).orderBy(desc(promoDrafts.createdAt)),
    db.select().from(digestReports).where(scoped(digestReports, tenant)),
  ])

  const items = buildReviewQueue({
    gigs: gigs as GigOpportunity[],
    sync: sync as SyncTarget[],
    promo: promo as PromoDraft[],
  })

  const built = buildDigest({
    items,
    prior: prior.map((p) => ({
      entityType: p.entityType,
      entityId: p.entityId,
      grp: p.grp,
      fingerprint: p.fingerprint,
      reportedAt: p.reportedAt,
    })),
  })

  const base = env.DASHBOARD_URL ?? 'https://dashboard.dougmcarthur.net'
  return {
    digest: built,
    subject: subjectFor(built),
    html: renderHtml(built, base),
    text: renderText(built, base),
  }
}

/**
 * Records what was just reported. Called only after a successful send —
 * marking first would mean a failed send silently swallows a week of changes,
 * because the next run would consider them already reported.
 */
export async function recordDigest(env: Env, tenant: TenantId, built: Digest): Promise<void> {
  if (built.marks.length === 0) return
  const db = getDb(env.DB)
  const reportedAt = new Date().toISOString()
  for (const m of built.marks) {
    // The one upsert in this codebase that keeps its `ON CONFLICT` target
    // through the tenant change, because the key it names is still right:
    // `entity_id` is a global autoincrement, so two artists cannot collide on
    // one. That is why `digest_reports` is not among the four constraints the
    // scoping migration widens.
    await db
      .insert(digestReports)
      .values(withTenant(tenant, { entityType: m.entityType, entityId: m.entityId, grp: m.grp, fingerprint: m.fingerprint, reportedAt }))
      .onConflictDoUpdate({
        target: [digestReports.entityType, digestReports.entityId],
        set: { grp: m.grp, fingerprint: m.fingerprint, reportedAt },
      })
  }
}

digest.get('/preview', async (c) => {
  const { digest: built, subject, html, text } = await composeDigest(c.env, tenantOf(c))
  const settings = await readDigestSettings(c.env)
  const now = new Date()
  return c.json({
    empty: built.empty,
    subject,
    groups: built.groups,
    html,
    text,
    settings,
    mailerConfigured: mailerConfigured(c.env),
    // Says plainly why a send would be skipped, rather than leaving the
    // Settings screen to infer it from three separate flags.
    wouldSend: !built.empty && settings.enabled && mailerConfigured(c.env),
    schedule: {
      ...settings.schedule,
      describes: describeSchedule(settings.schedule),
      nextRun: nextRun(now, settings.schedule, settings.lastSentAt)?.toISOString() ?? null,
      lastSentAt: settings.lastSentAt,
    },
  })
})

digest.post('/send', async (c) => {
  const settings = await readDigestSettings(c.env)
  if (!mailerConfigured(c.env)) {
    return c.json({ error: 'This site cannot send email yet.' }, 503)
  }

  const tenant = tenantOf(c)
  const { digest: built, subject, html, text } = await composeDigest(c.env, tenant)

  // An empty digest teaches you to ignore the full ones, so there is no way to
  // send one — not even by asking. A manual send of nothing is still nothing.
  if (built.empty) return c.json({ sent: false, reason: 'nothing to report' })

  const result = await sendMail(c.env, {
    to: settings.recipient,
    from: settings.sender,
    subject: `Scout — ${subject}`,
    text,
    html,
  })

  await recordDigest(c.env, tenant, built)
  return c.json({ sent: true, to: settings.recipient, subject, messageId: result.messageId })
})

const SettingsSchema = z.object({
  enabled: z.boolean().optional(),
  recipient: z.string().email().optional(),
  sender: z.string().email().optional(),
  day: z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']).optional(),
  hour: z.number().int().min(0).max(23).optional(),
  // Checked against the runtime's own zone table rather than a hardcoded list:
  // an unknown zone would make every scheduling comparison throw, which reads
  // as "the digest silently stopped".
  timezone: z
    .string()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en-CA', { timeZone: tz })
        return true
      } catch {
        return false
      }
    }, 'unknown time zone')
    .optional(),
})

digest.patch('/settings', zValidator('json', SettingsSchema), async (c) => {
  const body = c.req.valid('json')
  if (body.enabled !== undefined) await writeSetting(c.env, DIGEST_KEYS.enabled, String(body.enabled))
  if (body.recipient !== undefined) await writeSetting(c.env, DIGEST_KEYS.recipient, body.recipient)
  if (body.sender !== undefined) await writeSetting(c.env, DIGEST_KEYS.sender, body.sender)
  if (body.day !== undefined) await writeSetting(c.env, DIGEST_KEYS.day, body.day)
  if (body.hour !== undefined) await writeSetting(c.env, DIGEST_KEYS.hour, String(body.hour))
  if (body.timezone !== undefined) await writeSetting(c.env, DIGEST_KEYS.timezone, body.timezone)
  return c.json(await readDigestSettings(c.env))
})

export default digest
