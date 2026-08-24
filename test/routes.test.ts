import { describe, it, expect } from 'vitest'
import app from '../src/index'

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
})
