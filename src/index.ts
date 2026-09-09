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
import application from './routes/application'
import taskRuns from './routes/taskRuns'
import reminders from './routes/reminders'
import health from './routes/health'
import notifications, { pruneNotifications } from './routes/notifications'
import digest, { composeDigest, recordDigest } from './routes/digest'
import syncReconcile from './routes/syncReconcile'
import replies, { runReplyScan } from './routes/replies'
import backfill, { runNotesBackfillOnce } from './routes/backfill'
import auth from './routes/auth'
import { readDigestSettings, writeSetting, DIGEST_KEYS } from './lib/settings'
import { isDigestDue } from '../shared/digestSchedule'
import { sendMail, mailerConfigured } from './lib/mailer'
import { gmailConfigured } from './lib/gmail'
import { recordEvent } from './lib/notificationEvents'
import { bearerAuthorised, pruneAuth, readSession } from './lib/auth'
import { originAllowed, relyingParty } from '../shared/auth'
import { localParts } from '../shared/digestSchedule'

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', logger())

/**
 * CORS, narrowed to this deployment.
 *
 * It was `cors()` — every origin — which was harmless while Cloudflare Access
 * turned strangers away at the edge and nothing here relied on a cookie.
 * Both halves of that changed at once. A wildcard `Access-Control-Allow-Origin`
 * already refuses to carry credentials, so this is not the lock; narrowing it
 * just means a cross-site page is told no at the preflight rather than after
 * the route has run.
 */
app.use('/api/*', (c, next) => {
  const party = relyingParty({ dashboardUrl: c.env.DASHBOARD_URL, requestUrl: c.req.url })
  return cors({
    origin: party ? party.origins : [],
    credentials: true,
  })(c, next)
})

/**
 * The security boundary, and now the only one.
 *
 * Cloudflare Access used to sit in front of `dashboard.dougmcarthur.net` and
 * this file had no auth in it at all — every request that reached the Worker
 * had already been let through at the edge. Passkey login moved that job in
 * here (see src/lib/auth.ts and docs/passkey-login.md), which changes what a
 * mistake costs: a route that is not covered by this middleware is public to
 * the internet, not merely public to whoever Access already trusted.
 *
 * So the check is one middleware over the whole API with a written-down list
 * of exemptions, rather than something each router opts into. Adding a router
 * cannot forget to authenticate; the only way to be public is to appear
 * below.
 *
 * Static assets stay unauthenticated on purpose — the login screen is one of
 * them, and a sign-in page you have to be signed in to fetch is not a design
 * anyone can use. Nothing under `/assets` reads the database.
 */
const PUBLIC_API_PREFIXES = [
  // The ceremonies themselves. Signing in cannot require being signed in.
  '/api/auth/',
]

app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (PUBLIC_API_PREFIXES.some((prefix) => path.startsWith(prefix))) return next()

  // Two credentials, and they are for two different callers: a browser sends
  // the session cookie, the out-of-repo research agents send a bearer token.
  // The token is checked first because it is a string compare and the session
  // is a D1 read.
  if (bearerAuthorised(c.env, c.req.header('Authorization'))) return next()

  const session = await readSession(c.env, c.req.header('Cookie'))
  if (!session) return c.json({ error: 'not signed in' }, 401)

  // Second lock on cross-site writes. `SameSite=Lax` on the cookie is the
  // first and does most of the work; this catches a browser that sends the
  // cookie anyway with an `Origin` this deployment has never heard of. A
  // request with no `Origin` passes, which is every non-browser caller — but
  // those have already had to present the bearer token above to get here.
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const party = relyingParty({ dashboardUrl: c.env.DASHBOARD_URL, requestUrl: c.req.url })
    if (party && !originAllowed(c.req.header('Origin'), party.origins)) {
      return c.json({ error: 'cross-site request refused' }, 403)
    }
  }

  return next()
})

app.route('/api/auth', auth)
app.route('/api/overview', overview)
app.route('/api/review', review)
// NOTE: before '/api/gigs', for the same reason the reconcile router is
// registered before '/api/sync' — a router mounted on a longer path has to be
// offered the request first.
app.route('/api/gigs/:id/application', application)
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
app.route('/api/backfill', backfill)
app.route('/api/health', health)
app.route('/api/replies', replies)
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
  // Expired sessions, spent challenges and dead setup codes. Not a
  // correctness matter — every one of them is checked against the clock when
  // it is read — so this only stops three tables growing without limit.
  await pruneAuth(env)
}

/**
 * The local hours a reply scan runs on.
 *
 * Three times a day rather than every tick. Pinned to local hours instead of
 * tracked in a settings row, for the reason housekeeping is: it needs no
 * state and it cannot drift. A missed tick costs a few hours of noticing,
 * which is the right price for a mailbox — an organiser's question is urgent
 * in days, not in minutes, and twenty-four Gmail sweeps a day to find that
 * out is work nobody asked for.
 *
 * Morning, midday and evening, because those are when a reply gets read.
 */
export const REPLY_SCAN_HOURS = [7, 12, 18]

export function isReplyScanHour(hour: number): boolean {
  return REPLY_SCAN_HOURS.includes(hour)
}

/**
 * The mailbox sweep, on a schedule rather than on a button.
 *
 * The scan was already safe to run unattended — a reply you have resolved is
 * never re-proposed, which is the property that makes this a scheduling
 * question rather than a design one. Until now the property was true and
 * unused: nothing ran it but a click, so a reply sat unnoticed exactly as
 * long as you went without opening the page.
 *
 * It does not move any row. Accepting a match is still yours, and so is the
 * transition after it. See docs/reply-matching-plan.md.
 */
async function runReplyScanIfDue(env: Env): Promise<void> {
  if (!gmailConfigured(env)) return
  const settings = await readDigestSettings(env)
  const now = new Date()
  if (!isReplyScanHour(localParts(now, settings.schedule.timezone).hour)) return

  // The queue's rule, in the one place a scan could have broken it: the
  // window `planReplyScan` derives is measured from a date, so the date is
  // computed once here rather than read again downstream.
  const today = now.toISOString().slice(0, 10)
  const result = await runReplyScan(env, today)
  if (result.stored > 0 || result.found > 0) {
    console.log(`reply scan: ${result.found} found, ${result.stored} stored, ${result.skipped} already decided`)
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
        // One-shot, and it un-arms itself. See runNotesBackfillOnce.
        runNotesBackfillOnce(env).catch((err) => {
          console.error('notes backfill failed:', err)
        }),
        runReplyScanIfDue(env).catch((err) => {
          // Logged and swallowed, like the others. A Gmail outage must not
          // take the digest down with it — they share a tick and nothing
          // else.
          console.error('reply scan failed:', err)
        }),
      ]),
    )
  },
}
