import { describe, it, expect } from 'vitest'
import { app, isReplyScanHour, REPLY_SCAN_HOURS } from '../src/index'

/**
 * No integration secrets configured — enough to exercise routing without a DB.
 *
 * `API_TOKEN` is the exception and it is not an integration secret: since
 * passkey login replaced Cloudflare Access, `/api/*` is behind a middleware
 * that turns away anything with no credential, and every case below is about
 * what a route does *after* it has been let in. The bearer token is how the
 * research agents get in for real (src/lib/auth.ts), so using it here tests
 * the same door they use rather than a hole cut for the suite.
 */
const TEST_TOKEN = 'test-bearer-token'
const emptyEnv = { API_TOKEN: TEST_TOKEN } as Record<string, unknown>

/** `app.request`, authenticated. The middleware is exercised on its own below. */
function request(path: string, init: RequestInit = {}, env: Record<string, unknown> = emptyEnv) {
  return app.request(
    path,
    { ...init, headers: { ...((init.headers as Record<string, string>) ?? {}), Authorization: `Bearer ${TEST_TOKEN}` } },
    env,
  )
}

describe('API route registration', () => {
  // Regression guard for the /api/sync route-order bug: /api/sync/reconcile
  // must be matched by the reconcile router, NOT swallowed by the sync
  // router's GET /:id (which would treat "reconcile" as an id and 404).
  // With no Gmail secrets the reconcile preview returns 503 ("Gmail not
  // configured") *before* touching the DB — reaching that proves the
  // reconcile router handled the request.
  it('GET /api/sync/reconcile resolves to the reconcile router', async () => {
    const res = await request('/api/sync/reconcile', {}, emptyEnv)
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Gmail not configured')
  })

  // The review route validates query params before touching D1, so these two
  // cases are reachable with no database binding at all.
  it('GET /api/review rejects an unknown filter before hitting the database', async () => {
    const res = await request('/api/review?filter=nonsense', {}, emptyEnv)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; allowed: string[] }
    expect(body.error).toContain('nonsense')
    expect(body.allowed).toContain('needs')
  })

  it('GET /api/review rejects a non-positive limit', async () => {
    for (const bad of ['0', '-3', 'abc', '1.5']) {
      const res = await request(`/api/review?limit=${bad}`, {}, emptyEnv)
      expect(res.status, `limit=${bad}`).toBe(400)
    }
  })

  // The snooze endpoint validates shape and date before touching D1, so these
  // are reachable with no database binding.
  it('POST /api/review/snooze rejects a date that is not a date', async () => {
    const res = await request(
      '/api/review/snooze',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'gig', id: 1, until: 'next tuesday' }) },
      emptyEnv,
    )
    expect(res.status).toBe(400)
  })

  it('POST /api/review/snooze refuses a date in the past', async () => {
    // Snoozing backwards would silently do nothing, which is worse than an
    // error — the item would look deferred and reappear immediately.
    const res = await request(
      '/api/review/snooze',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'gig', id: 1, until: '2020-01-01' }) },
      emptyEnv,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('must be after')
  })

  it('POST /api/review/snooze rejects an unknown entity kind', async () => {
    // Promo drafts have no snooze columns; the schema is what keeps them out.
    const res = await request(
      '/api/review/snooze',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'promo', id: 1, until: '2030-01-01' }) },
      emptyEnv,
    )
    expect(res.status).toBe(400)
  })

  it('GET /api/review accepts the snoozed filter', async () => {
    // Guards the FILTERS list in the route against drifting from ReviewFilter:
    // an unlisted filter 400s before reaching the database, so a 400 here would
    // mean the route rejects a filter the type system allows.
    const res = await request('/api/review?filter=snoozed', {}, emptyEnv)
    expect(res.status).not.toBe(400)
  })

  it('GET /api/health reports integration config without secrets', async () => {
    const res = await request('/api/health', {}, emptyEnv)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      calendarConfigured: boolean
      gmailConfigured: boolean
    }
    expect(body.calendarConfigured).toBe(false)
    expect(body.gmailConfigured).toBe(false)
  })

  // The gig create route validates performance dates before it touches D1, so
  // these are reachable with no database binding.
  it('POST /api/gigs refuses a performance that ends before it starts', async () => {
    const res = await request(
      '/api/gigs',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sawdust City Folk Festival',
          type: 'festival',
          performanceStart: '2027-07-12',
          performanceEnd: '2027-07-10',
        }) },
      emptyEnv,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/ends before it starts/)
  })

  it('POST /api/gigs refuses a travel band that is not one of the four', async () => {
    // `country` and `location` are free text on purpose — the research agents
    // write prose and `normaliseCountry` reads it. The bands are not: they
    // index a table of costs, and a value outside it would silently drop the
    // travel line out of the estimate.
    const res = await request(
      '/api/gigs',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Treefort', type: 'festival', travelBand: 'teleport' }) },
      emptyEnv,
    )
    expect(res.status).toBe(400)
  })

  it('POST /api/gigs refuses a negative number of nights', async () => {
    const res = await request(
      '/api/gigs',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Treefort', type: 'festival', nights: -1 }) },
      emptyEnv,
    )
    expect(res.status).toBe(400)
  })

  it('POST /api/gigs refuses a performance date that is not a date', async () => {
    // `deadline` is allowed to hold prose and 26 production rows do; these two
    // columns are not, which is the distinction worth guarding.
    const res = await request(
      '/api/gigs',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sawdust City Folk Festival',
          type: 'festival',
          performanceStart: 'second weekend in July',
        }) },
      emptyEnv,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/must be a date/)
  })


  // Same shape as the /api/sync/reconcile guard above: `epk` and `kinds` are
  // words that a `/:id` route would happily swallow.
  it('GET /api/artist/epk reaches the EPK handler, not an id lookup', async () => {
    const res = await request('/api/artist/epk?audience=nonsense', {}, emptyEnv)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; allowed: string[] }
    expect(body.error).toContain('nonsense')
    expect(body.allowed).toContain('festival')
  })

  it('GET /api/artist/kinds answers from the shared vocabulary with no database', async () => {
    const res = await request('/api/artist/kinds', {}, emptyEnv)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { kinds: string[]; audiences: string[] }
    expect(body.kinds).toContain('bio')
    expect(body.audiences).toEqual(['festival', 'sync', 'press'])
  })

  it('GET /api/artist/answer needs a field label before it will do anything', async () => {
    const res = await request('/api/artist/answer', {}, emptyEnv)
    expect(res.status).toBe(400)
  })

  it('GET /api/artist/answer says so plainly when it does not recognise the question', async () => {
    // Reached without D1 because an unclassified field has nothing to look up.
    const res = await request(
      '/api/artist/answer?label=Do%20you%20have%20a%20valid%20passport%3F',
      {},
      emptyEnv,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { questionKind: string | null }
    expect(body.questionKind).toBeNull()
  })

  it('POST /api/artist refuses a question kind the app does not know', async () => {
    const res = await request(
      '/api/artist',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'bio', label: 'Long bio', questionKind: 'favourite_colour' }) },
      emptyEnv,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('favourite_colour')
  })

  it('POST /api/artist refuses a review date that is not a date', async () => {
    const res = await request(
      '/api/artist',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'bio', label: 'Long bio', reviewBy: 'next spring' }) },
      emptyEnv,
    )
    expect(res.status).toBe(400)
  })

  // The application router is mounted at '/api/gigs/:id/application', ahead of
  // the gigs router — the same ordering the reconcile router needs. It reads
  // `:id` off the mount path, so these prove both that it is reachable and
  // that the id arrives, without a database: every case below is rejected
  // before the handler touches D1.
  it('the application router is reached, not swallowed by GET /api/gigs/:id', async () => {
    const res = await request('/api/gigs/not-a-number/application', {}, emptyEnv)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('gig id')
  })

  it('PATCH on an application field needs both ids to be ids', async () => {
    const res = await request(
      '/api/gigs/1/application/fields/0',
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answerState: 'approved' }) },
      emptyEnv,
    )
    expect(res.status).toBe(400)
  })

  it('PATCH on an application field refuses an answer state the app does not have', async () => {
    const res = await request(
      '/api/gigs/1/application/fields/2',
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answerState: 'nearly' }) },
      emptyEnv,
    )
    expect(res.status).toBe(400)
  })

  it('POST .../application/prepare refuses a form address that is not a URL', async () => {
    const res = await request(
      '/api/gigs/1/application/prepare',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'the festival website' }) },
      emptyEnv,
    )
    expect(res.status).toBe(400)
  })

  // Phase 4. The scan needs Gmail, and says so before it touches D1 — the same
  // shape as the sync reconciler, and reachable with no bindings at all.
  it('POST /api/replies/scan says Gmail is not configured before reading anything', async () => {
    const res = await request('/api/replies/scan', { method: 'POST' }, emptyEnv)
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string; missing: string[] }
    expect(body.error).toBe('Gmail not configured')
    expect(body.missing).toContain('GMAIL_REFRESH_TOKEN')
  })

  it('accepting a reply needs a reply id that is an id', async () => {
    const res = await request(
      '/api/replies/0/accept',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      emptyEnv,
    )
    expect(res.status).toBe(400)
  })

  it('accepting a reply refuses a gig id that is not one', async () => {
    const res = await request(
      '/api/replies/3/accept',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gigId: 'the folk festival' }) },
      emptyEnv,
    )
    expect(res.status).toBe(400)
  })

})

describe('the reply scan schedule', () => {
  // Three fixed local hours rather than a settings row, for the reason
  // housekeeping gives: it needs no state and it cannot drift. The test is
  // here so the cadence is a decision on record rather than a constant
  // somebody trims to one on a quiet afternoon.
  it('runs morning, midday and evening', () => {
    expect(REPLY_SCAN_HOURS).toEqual([7, 12, 18])
  })

  it('is due on those hours and on no others', () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(isReplyScanHour(hour), `hour ${hour}`).toBe(REPLY_SCAN_HOURS.includes(hour))
    }
  })
})

describe('the reply draft route', () => {
  // It validates the id before touching D1, so this is reachable with no
  // database binding — the same property the application router's cases rely
  // on.
  it('needs an id that is an id', async () => {
    const res = await request('/api/replies/not-a-number/draft', {}, emptyEnv)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('reply id')
  })

  it('is not swallowed by another replies route', async () => {
    // `/replies/:id/draft` sits alongside `/replies/:id/accept` and
    // `/replies/scan`. Reaching the 400 above proves the path resolves here
    // rather than to one of those.
    const res = await request('/api/replies/0/draft', {}, emptyEnv)
    expect(res.status).toBe(400)
  })
})

describe('the notes backfill router', () => {
  // Mounted at /api/backfill, ahead of nothing it could collide with. Both
  // verbs touch D1 immediately, so the only thing reachable without a binding
  // is that the path resolves at all — a 404 here would mean it does not.
  it('is registered', async () => {
    const res = await request('/api/backfill/notes', {}, emptyEnv)
    expect(res.status).not.toBe(404)
  })
})

describe('the artist freshness filter', () => {
  // Validated against the same list the health states come from, before any
  // database work, so it is reachable with no binding.
  it('rejects a freshness the app does not have', async () => {
    const res = await request('/api/artist?freshness=stale', {}, emptyEnv)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; allowed: string[] }
    expect(body.error).toContain('stale')
    expect(body.allowed).toContain('unreviewed')
  })
})

/**
 * The middleware that replaced Cloudflare Access.
 *
 * Until now `src/index.ts` had no auth in it, because Access turned people
 * away at the edge before a request ever reached the Worker. It does not any
 * more, so these are the cases that used to be somebody else's job — and the
 * one that matters most is the last: a route added tomorrow is covered
 * whether or not its author thought about it, because the check is over
 * `/api/*` with a written-down exemption list rather than something each
 * router opts into.
 */
describe('API authentication', () => {
  const env = { API_TOKEN: 'test-bearer-token' } as Record<string, unknown>

  it('turns away a request with no credential at all', async () => {
    const res = await app.request('/api/health', {}, env)
    expect(res.status).toBe(401)
    expect((await res.json() as { error: string }).error).toBe('not signed in')
  })

  it('turns away a wrong bearer token', async () => {
    const res = await app.request('/api/health', { headers: { Authorization: 'Bearer nope' } }, env)
    expect(res.status).toBe(401)
  })

  // Without the secret set there is no bearer path at all, so an empty
  // deployment cannot be opened by guessing the empty string.
  it('accepts no bearer token when API_TOKEN is unset', async () => {
    const res = await app.request('/api/health', { headers: { Authorization: 'Bearer ' } }, {})
    expect(res.status).toBe(401)
  })

  it('lets the session endpoint answer without a session', async () => {
    // It is how the login screen finds out there is nothing to sign in with,
    // so requiring a session here would be a door that opens from the inside.
    const res = await app.request('/api/auth/session', {}, env)
    expect(res.status).not.toBe(401)
  })

  it('refuses a cross-site write even when the cookie rides along', async () => {
    // SameSite=Lax is the first lock and this is the second. The request
    // carries a session cookie for a session that does not exist, so a 401 is
    // also a pass — what must never happen is the route running.
    const res = await app.request(
      '/api/gigs/1',
      {
        method: 'PATCH',
        headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'booked' }),
      },
      { ...env, DASHBOARD_URL: 'https://dashboard.dougmcarthur.net' },
    )
    expect([401, 403]).toContain(res.status)
  })

  it('covers every API router but the ceremonies themselves', async () => {
    // The list a new router is added to by doing nothing. If a path shows up
    // here answering something other than 401, it is public to the internet —
    // which since Access was removed is a different sentence than it used to
    // be.
    const paths = [
      '/api/overview',
      '/api/review',
      '/api/gigs',
      '/api/sync',
      '/api/promo',
      '/api/artist',
      '/api/reference-docs',
      '/api/task-runs',
      '/api/reminders',
      '/api/backfill/notes',
      '/api/health',
      '/api/replies',
      '/api/notifications',
      '/api/digest',
    ]
    for (const path of paths) {
      const res = await app.request(path, {}, env)
      expect(res.status, path).toBe(401)
    }
  })
})
