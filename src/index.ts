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
import gmailDrafts from './routes/gmailDrafts'
import agentTokens from './routes/agentTokens'
import admin from './routes/admin'
import profile from './routes/profile'
import { readDigestSettings, writeSetting, DIGEST_KEYS } from './lib/settings'
import { isDigestDue } from '../shared/digestSchedule'
import { sendMail, mailerConfigured } from './lib/mailer'
import { gmailConfigured } from './lib/gmail'
import { recordEvent } from './lib/notificationEvents'
import { pruneAuth, readSession } from './lib/auth'
import { actorForBearer, actorForSession, listTenants, ownerTenant } from './lib/actor'
import { pruneEvents } from './lib/notificationEvents'
import { pruneUsage, recordUsage } from './lib/usage'
import type { TenantId } from './db/scope'
import type { RootEnv } from './context'
import { originAllowed, relyingParty } from '../shared/auth'
import { agentMayCall } from '../shared/agentRoutes'
import { localParts } from '../shared/digestSchedule'

const app = new Hono<RootEnv>()

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

/**
 * The oversight surface, which is a different surface rather than a bigger one.
 *
 * A request under this prefix is served only to an owner whose session is in
 * admin mode, and a request anywhere else is refused *to* that session. The two
 * halves matter equally: without the second, admin mode would be an artist
 * session with extra pages, and the guarantee made to an invited artist —
 * that their gig notes are theirs — would rest on the owner not clicking a
 * link. See docs/multi-tenant-plan.md.
 *
 * The routes check the role themselves as well. A hidden button is still a URL.
 */
const ADMIN_API_PREFIX = '/api/admin/'

app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (PUBLIC_API_PREFIXES.some((prefix) => path.startsWith(prefix))) return next()

  // Two credentials, and they are for two different callers: a browser sends
  // the session cookie, the out-of-repo research agents send a bearer token.
  // The token is tried first because it is the cheaper lookup of the two and
  // because an agent never sends a cookie.
  //
  // Both now answer the same question, and it is a wider one than they used to
  // answer. Authenticating a request was enough while one artist owned every
  // row; what a route needs now is **whose rows** — so the middleware resolves
  // an actor rather than a boolean, and a credential that cannot be resolved
  // to a tenant is refused. See src/lib/actor.ts.
  const wantsAdmin = path.startsWith(ADMIN_API_PREFIX)

  const agent = await actorForBearer(c.env, c.req.header('Authorization'))
  if (agent) {
    // A research agent has no account and no mode. It is refused the oversight
    // surface outright rather than being asked to switch to something it cannot
    // have.
    if (wantsAdmin) return c.json({ error: 'not available to an agent token' }, 403)
    // An issued token is limited to what research needs. The Worker decides
    // that rather than the agent's tool list, because a routine has a shell and
    // its credential rides on every request to this host — see
    // shared/agentRoutes.ts.
    if (agent.tokenId !== null && !agentMayCall(c.req.method, path)) {
      return c.json({ error: 'not available to an agent token' }, 403)
    }
    c.set('actor', agent)
    return next()
  }

  const session = await readSession(c.env, c.req.header('Cookie'))
  if (!session) return c.json({ error: 'not signed in' }, 401)

  const actor = await actorForSession(c.env, session)
  // A valid session whose account resolves to no tenant. It should not happen
  // — 0021 defaulted every existing row — and the answer to not knowing whose
  // rows these are has to be none of them, never all of them.
  if (!actor) return c.json({ error: 'not signed in' }, 401)

  // The two refusals that make the surfaces separate. Each names the mode the
  // request would need, because the honest answer to "why did that 403" is
  // "you are on the other surface", and a client that knows which one can offer
  // the switch instead of an error.
  if (wantsAdmin && actor.kind !== 'admin') {
    return c.json({ error: 'Switch to admin mode first.', needsMode: 'admin' }, 403)
  }
  if (!wantsAdmin && actor.kind === 'admin') {
    return c.json({ error: 'This is not available in admin mode.', needsMode: 'artist' }, 403)
  }

  if (actor.kind === 'admin') c.set('admin', actor)
  else c.set('actor', actor)

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
app.route('/api/gmail', gmailDrafts)
app.route('/api/agent-tokens', agentTokens)
app.route('/api/profile', profile)
// The oversight surface. See ADMIN_API_PREFIX above for what the middleware
// does with it, in both directions.
app.route('/api/admin', admin)
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
async function runDigest(env: Env, tenant: TenantId): Promise<void> {
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

  const { digest: built, subject, html, text } = await composeDigest(env, tenant)
  if (built.empty) return

  try {
    await sendMail(env, {
      to: settings.recipient,
      from: settings.sender,
      subject: `Scout — ${subject}`,
      text,
      html,
    })
  } catch (err) {
    // A digest that fails to send is the one failure nothing else can tell you
    // about: the digest *is* the channel that reaches you when you are not
    // looking at the dashboard. So this is critical, and it is written before
    // the throw so the record survives the retry.
    await recordEvent(env, tenant, {
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

  await recordDigest(env, tenant, built)
  // Written only after the send resolves, for the same reason the reporting
  // marks are: a failed send must be retried on the next tick, not counted as
  // this week's.
  await writeSetting(env, DIGEST_KEYS.lastSentAt, new Date().toISOString())

  await recordEvent(env, tenant, {
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
async function runHousekeeping(env: Env, tenants: TenantId[]): Promise<void> {
  const settings = await readDigestSettings(env)
  if (localParts(new Date(), settings.schedule.timezone).hour !== 3) return

  // Marks, per tenant. Deciding which are dead needs that tenant's live feed,
  // so this is genuinely one artist at a time.
  let marks = 0
  for (const tenant of tenants) marks += (await pruneNotifications(env, tenant)).marks

  // Today's usage sample, also per tenant and for a stronger reason: this is
  // the one place code counts a tenant's rows on the owner's behalf, and it
  // does it *as* the tenant and emits a number. See src/lib/usage.ts.
  //
  // The day is UTC rather than the artist's local date. A daily sample has to
  // agree with itself across runs, and the alternative — each tenant's own
  // midnight — would need a timezone this app does not ask anybody for.
  const today = new Date().toISOString().slice(0, 10)
  for (const tenant of tenants) await recordUsage(env, tenant, today)

  // Events, once. Retention is one platform rule — "nothing older than thirty
  // days" — and expressing it as N deletes would be N ways to get it wrong.
  const events = await pruneEvents(env)
  const samples = await pruneUsage(env)
  if (marks || events || samples) {
    console.log(`pruned ${marks} marks, ${events} notification events, ${samples} usage rows`)
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
async function runReplyScanIfDue(env: Env, tenant: TenantId): Promise<void> {
  if (!gmailConfigured(env)) return
  const settings = await readDigestSettings(env)
  const now = new Date()
  if (!isReplyScanHour(localParts(now, settings.schedule.timezone).hour)) return

  // The queue's rule, in the one place a scan could have broken it: the
  // window `planReplyScan` derives is measured from a date, so the date is
  // computed once here rather than read again downstream.
  const today = now.toISOString().slice(0, 10)
  const result = await runReplyScan(env, tenant, today)
  if (result.stored > 0 || result.found > 0) {
    console.log(`reply scan: ${result.found} found, ${result.stored} stored, ${result.skipped} already decided`)
  }
}

/**
 * The cron tick, and the one place scope is decided without a request behind
 * it.
 *
 * Three different answers to "whose rows", and the differences are the point.
 *
 * **Housekeeping is every tenant**, because pruning marks is a per-artist
 * question — which conditions are still live is derived from that artist's own
 * feed. Event retention is not, and is done once beside it.
 *
 * **The digest and the reply scan are the owner's tenant only**, because their
 * inputs are platform configuration rather than the tenant's: the schedule and
 * recipient live in `app_settings`, and the mailbox is `GMAIL_REFRESH_TOKEN`,
 * one Worker secret pointing at one inbox. Looping those over every tenant
 * would mail the owner N times and scan the owner's mailbox on a stranger's
 * behalf, which is worse than not running. Giving each artist their own digest
 * schedule and their own mailbox grant is real work with a schema behind it
 * (`docs/multi-tenant-plan.md` — it is not in this step, and it is not
 * pretended to be).
 *
 * **The notes backfill is every tenant under one marker**, because it is a
 * one-shot over rows that predate the extractor.
 *
 * Each job's errors are logged and swallowed, as before: a cron failure has
 * nobody to report to, and a Gmail outage must not take the digest down with
 * it.
 */
async function runScheduled(env: Env): Promise<void> {
  const tenants = await listTenants(env)
  const owner = await ownerTenant(env)

  await Promise.all([
    owner
      ? runDigest(env, owner).catch((err) => {
          console.error('digest run failed:', err)
        })
      : Promise.resolve(),
    runHousekeeping(env, tenants).catch((err) => {
      console.error('housekeeping failed:', err)
    }),
    // One-shot, and it un-arms itself. See runNotesBackfillOnce.
    runNotesBackfillOnce(env, tenants).catch((err) => {
      console.error('notes backfill failed:', err)
    }),
    owner
      ? runReplyScanIfDue(env, owner).catch((err) => {
          console.error('reply scan failed:', err)
        })
      : Promise.resolve(),
  ])
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
    ctx.waitUntil(runScheduled(env))
  },
}
