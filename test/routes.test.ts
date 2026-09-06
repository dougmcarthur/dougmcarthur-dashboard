import { describe, it, expect } from 'vitest'
import { app } from '../src/index'

// No integration secrets configured — enough to exercise routing without a DB.
const emptyEnv = {} as Record<string, unknown>

describe('API route registration', () => {
  // Regression guard for the /api/sync route-order bug: /api/sync/reconcile
  // must be matched by the reconcile router, NOT swallowed by the sync
  // router's GET /:id (which would treat "reconcile" as an id and 404).
  // With no Gmail secrets the reconcile preview returns 503 ("Gmail not
  // configured") *before* touching the DB — reaching that proves the
  // reconcile router handled the request.
  it('GET /api/sync/reconcile resolves to the reconcile router', async () => {
    const res = await app.request('/api/sync/reconcile', {}, emptyEnv)
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Gmail not configured')
  })

  // The review route validates query params before touching D1, so these two
  // cases are reachable with no database binding at all.
  it('GET /api/review rejects an unknown filter before hitting the database', async () => {
    const res = await app.request('/api/review?filter=nonsense', {}, emptyEnv)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; allowed: string[] }
    expect(body.error).toContain('nonsense')
    expect(body.allowed).toContain('needs')
  })

  it('GET /api/review rejects a non-positive limit', async () => {
    for (const bad of ['0', '-3', 'abc', '1.5']) {
      const res = await app.request(`/api/review?limit=${bad}`, {}, emptyEnv)
      expect(res.status, `limit=${bad}`).toBe(400)
    }
  })

  // The snooze endpoint validates shape and date before touching D1, so these
  // are reachable with no database binding.
  it('POST /api/review/snooze rejects a date that is not a date', async () => {
    const res = await app.request(
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
    const res = await app.request(
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
    const res = await app.request(
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
    const res = await app.request('/api/review?filter=snoozed', {}, emptyEnv)
    expect(res.status).not.toBe(400)
  })

  it('GET /api/health reports integration config without secrets', async () => {
    const res = await app.request('/api/health', {}, emptyEnv)
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
    const res = await app.request(
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

  it('POST /api/gigs refuses a performance date that is not a date', async () => {
    // `deadline` is allowed to hold prose and 26 production rows do; these two
    // columns are not, which is the distinction worth guarding.
    const res = await app.request(
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

})
