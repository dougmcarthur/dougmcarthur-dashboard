import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Env } from './types'
import overview from './routes/overview'
import review from './routes/review'
import gigs from './routes/gigs'
import sync from './routes/sync'
import promo from './routes/promo'
import reference from './routes/reference'
import artist from './routes/artist'
import taskRuns from './routes/taskRuns'
import reminders from './routes/reminders'
import health from './routes/health'
import notifications, { pruneNotifications } from './routes/notifications'
import digest, { composeDigest, recordDigest } from './routes/digest'
import syncReconcile from './routes/syncReconcile'
import { readDigestSettings, writeSetting, DIGEST_KEYS } from './lib/settings'
import { isDigestDue } from '../shared/digestSchedule'
import { sendMail, mailerConfigured } from './lib/mailer'
import { recordEvent } from './lib/notificationEvents'
import { localParts } from '../shared/digestSchedule'

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', logger())
app.use('/api/*', cors())

app.route('/api/overview', overview)
app.route('/api/review', review)
app.route('/api/gigs', gigs)
// NOTE: must be registered before '/api/sync' — otherwise the sync router's
// GET '/:id' route matches '/reconcile' first and swallows this endpoint.
app.route('/api/sync/reconcile', syncReconcile)
app.route('/api/sync', sync)
app.route('/api/promo', promo)
app.route('/api/artist', artist)
app.route('/api/reference-docs', reference)
app.route('/api/task-runs', taskRuns)
app.route('/api/reminders', reminders)
app.route('/api/health', health)
app.route('/api/notifications', notifications)
app.route('/api/digest', digest)

app.notFound((c) => c.json({ error: 'not found' }, 404))

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message }, 500)
})

// Fall through to static assets for non-API routes
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

/**
 * The weekly digest, on a Cron Trigger (see `[triggers]` in wrangler.toml).
 *
 * Three guards, each of which is a way this could become unwelcome rather than
 * a way it could fail:
 *
 *  - Off unless switched on, so a deploy never starts emailing by itself.
 *  - Nothing sent when there is nothing to say. An empty digest is how you
 *    learn to ignore the full ones.
 *  - The reporting marks are written only after the send resolves, so a
 *    failed send does not silently swallow a week of changes by recording
 *    them as already reported.
 *
 * Errors are logged and swallowed rather than rethrown: a cron failure has
 * nobody to report to, and an unhandled rejection here would be invisible
 * except as a retry.
 */
async function runDigest(env: Env): Promise<void> {
  const settings = await readDigestSettings(env)
  if (!settings.enabled) return
  if (!mailerConfigured(env)) {
    console.error('digest: enabled but no email binding — nothing sent')
    return
  }

  // The cron now fires hourly and this decides whether the hour is the one,
  // because the schedule lives in app_settings where it can be changed without
  // a deploy. `isDigestDue` also carries the once-per-day guard.
  const due = isDigestDue({
    now: new Date(),
    schedule: settings.schedule,
    lastSentAt: settings.lastSentAt,
  })
  if (!due.due) return

  const { digest: built, subject, html, text } = await composeDigest(env)
  if (built.empty) return

  try {
    await sendMail(env, {
      to: settings.recipient,
      from: settings.sender,
      subject: `Music HQ — ${subject}`,
      text,
      html,
    })
  } catch (err) {
    // A digest that fails to send is the one failure nothing else can tell you
    // about: the digest *is* the channel that reaches you when you are not
    // looking at the dashboard. So this is critical, and it is written before
    // the throw so the record survives the retry.
    await recordEvent(env, {
      kind: 'digest',
      tier: 'critical',
      title: 'Weekly digest failed to send',
      body: err instanceof Error ? err.message : String(err),
      href: '#settings',
      action: 'Check email',
      dedupeKey: `digest:failed:${due.localDate}`,
    })
    throw err
  }

  await recordDigest(env, built)
  // Written only after the send resolves, for the same reason the reporting
  // marks are: a failed send must be retried on the next tick, not counted as
  // this week's.
  await writeSetting(env, DIGEST_KEYS.lastSentAt, new Date().toISOString())

  await recordEvent(env, {
    kind: 'digest',
    tier: 'info',
    title: `Weekly digest sent — ${built.focus.length} to act on`,
    body: subject,
    href: '#review/needs',
    action: 'Open queue',
    dedupeKey: `digest:sent:${due.localDate}`,
  })
}

/**
 * Housekeeping, once a day rather than on every hourly tick.
 *
 * Pinned to a local hour instead of tracked in a settings row: it needs no
 * state, it cannot drift, and a tick missed at 3am costs a day of retention on
 * a table measured in tens of rows.
 */
async function runHousekeeping(env: Env): Promise<void> {
  const settings = await readDigestSettings(env)
  if (localParts(new Date(), settings.schedule.timezone).hour !== 3) return
  const pruned = await pruneNotifications(env)
  if (pruned.marks || pruned.events) {
    console.log(`pruned ${pruned.marks} marks, ${pruned.events} notification events`)
  }
}

/**
 * The Hono app, exported by name so tests can drive it with `app.request()`.
 * The default export is the Worker handler object — it has to carry
 * `scheduled` alongside `fetch`, so it is no longer the app itself.
 */
export { app }

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // waitUntil, so a slow send cannot be cut short when scheduled() returns.
    ctx.waitUntil(
      Promise.all([
        runDigest(env).catch((err) => {
          console.error('digest run failed:', err)
        }),
        runHousekeeping(env).catch((err) => {
          console.error('housekeeping failed:', err)
        }),
      ]),
    )
  },
}
