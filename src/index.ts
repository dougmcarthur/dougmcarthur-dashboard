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
import taskRuns from './routes/taskRuns'
import reminders from './routes/reminders'
import health from './routes/health'
import notifications from './routes/notifications'
import digest, { composeDigest, recordDigest } from './routes/digest'
import syncReconcile from './routes/syncReconcile'
import { readDigestSettings } from './lib/settings'
import { sendMail, mailerConfigured } from './lib/mailer'

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

  const { digest: built, subject, html, text } = await composeDigest(env)
  if (built.empty) return

  await sendMail(env, {
    to: settings.recipient,
    from: settings.sender,
    subject: `Music HQ — ${subject}`,
    text,
    html,
  })
  await recordDigest(env, built)
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
      runDigest(env).catch((err) => {
        console.error('digest run failed:', err)
      }),
    )
  },
}
