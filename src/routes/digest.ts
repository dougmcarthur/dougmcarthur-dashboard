import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { desc } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, syncTargets, promoDrafts, digestReports } from '../db/schema'
import { scoped, withTenant, type TenantId } from '../db/scope'
import { readGigs } from '../db/gigRows'
import { tenantOf, type AppEnv } from '../context'
import { buildReviewQueue } from '../../shared/reviewQueue'
import { buildDigest, type Digest } from '../../shared/digest'
import type { GigOpportunity, SyncTarget, PromoDraft } from '../../shared/types'
import { renderDigestEmail } from '../lib/digestMail'
import { addressBook, sendMail, mailerConfigured, senderIdentity } from '../lib/mailer'
import { recipientAllowed } from '../../shared/recipients'
import { writeSetting, DIGEST_KEYS } from '../lib/settings'
import { readAccountDigest, recordDigestSent, writeAccountDigest } from '../lib/digestSettings'
import { artistNamesFor } from '../lib/artistName'
import { focusFor } from '../lib/focus'
import { describeSchedule, nextRun } from '../../shared/digestSchedule'
import type { Env } from '../types'

/**
 * The weekly digest: preview it, send it, configure it, for the account asking.
 *
 * Every account has one. The switch and the schedule are the account's own and
 * it is off until they turn it on; an artist's goes to the address they sign
 * in with and cannot be pointed anywhere else, and the owner's keeps its
 * configurable recipient. See `src/lib/digestSettings.ts`.
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
    db.select().from(gigOpportunities).where(scoped(gigOpportunities, tenant)).orderBy(desc(gigOpportunities.discoveredAt)).then(readGigs),
    db.select().from(syncTargets).where(scoped(syncTargets, tenant)).orderBy(desc(syncTargets.discoveredAt)),
    db.select().from(promoDrafts).where(scoped(promoDrafts, tenant)).orderBy(desc(promoDrafts.createdAt)),
    db.select().from(digestReports).where(scoped(digestReports, tenant)),
  ])

  const items = buildReviewQueue({
    gigs: gigs as GigOpportunity[],
    sync: sync as SyncTarget[],
    promo: promo as PromoDraft[],
    artist: await artistNamesFor(env, tenant),
    focus: await focusFor(env, tenant),
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

  const base = env.DASHBOARD_URL ?? 'https://scout.sundogsmusic.ca'
  const settings = await readAccountDigest(env, tenant)
  // `subject` is the whole subject line, product name included, so the preview
  // shows exactly what an inbox will.
  const mail = renderDigestEmail(built, { base, schedule: settings.schedule, identity: senderIdentity(env) })
  return { digest: built, ...mail }
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
  const settings = await readAccountDigest(c.env, tenantOf(c))
  const now = new Date()
  return c.json({
    empty: built.empty,
    subject,
    groups: built.groups,
    html,
    text,
    settings: {
      enabled: settings.enabled,
      recipient: settings.recipient,
      sender: settings.sender,
      recipientEditable: settings.recipientEditable,
    },
    mailerConfigured: mailerConfigured(c.env),
    // Says plainly why a send would be skipped, rather than leaving the
    // Settings screen to infer it from three separate flags.
    wouldSend: !built.empty && settings.enabled && Boolean(settings.recipient) && mailerConfigured(c.env),
    schedule: {
      ...settings.schedule,
      describes: describeSchedule(settings.schedule),
      nextRun: nextRun(now, settings.schedule, settings.lastSentAt)?.toISOString() ?? null,
      lastSentAt: settings.lastSentAt,
      zoneChosen: settings.zoneChosen,
    },
  })
})

/**
 * Who a request may change the recipient and sender for.
 *
 * The owner's digest has a configurable recipient and sender, which are platform
 * settings. An artist's goes to the address they sign in with, so there is
 * nothing for them to set, and a route that let them would be a way to point
 * mail at an inbox of their choosing now that the sending allowlist is gone.
 */
function ownerOnly(c: Context<AppEnv>) {
  const actor = c.get('actor')
  if (actor.kind === 'user' && actor.role === 'owner') return null
  return c.json({ error: 'Your digest goes to the address you sign in with. Only the owner can change where it goes.' }, 403)
}

digest.post('/send', async (c) => {
  const tenant = tenantOf(c)
  const settings = await readAccountDigest(c.env, tenant)
  if (!mailerConfigured(c.env)) {
    return c.json({ error: 'This site cannot send email yet.' }, 503)
  }
  if (!settings.recipient) {
    return c.json(
      { error: settings.recipientEditable ? 'The digest has nowhere to go yet. Set a recipient first.' : 'There is no email address on your account to send it to.' },
      400,
    )
  }

  const { digest: built, subject, html, text } = await composeDigest(c.env, tenant)

  // An empty digest teaches you to ignore the full ones, so there is no way to
  // send one — not even by asking. A manual send of nothing is still nothing.
  if (built.empty) return c.json({ sent: false, reason: 'nothing to report' })

  const result = await sendMail(c.env, {
    to: settings.recipient,
    audience: settings.audience,
    tenant,
    from: settings.sender,
    subject,
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
  const tenant = tenantOf(c)
  const body = c.req.valid('json')

  // Where it goes and what it is sent from are the owner's. Refused outright
  // for anybody else rather than ignored: a request that names a recipient is
  // a request to redirect mail, and "accepted, nothing happened" is a worse
  // answer than no.
  if (body.recipient !== undefined || body.sender !== undefined) {
    const refused = ownerOnly(c)
    if (refused) return refused
    // Checked here as well as at send time, so a recipient the mailer would
    // refuse is a 400 now rather than a critical in the bell next Monday.
    if (
      body.recipient !== undefined &&
      !recipientAllowed({ to: body.recipient, audience: 'owner', book: await addressBook(c.env) })
    ) {
      return c.json({ error: 'The digest can only go to the owner’s own address.' }, 400)
    }
    if (body.recipient !== undefined) await writeSetting(c.env, DIGEST_KEYS.recipient, body.recipient)
    if (body.sender !== undefined) await writeSetting(c.env, DIGEST_KEYS.sender, body.sender)
  }

  await writeAccountDigest(c.env, tenant, {
    enabled: body.enabled,
    day: body.day,
    hour: body.hour,
    timezone: body.timezone,
  })
  return c.json(await readAccountDigest(c.env, tenant))
})

export default digest
