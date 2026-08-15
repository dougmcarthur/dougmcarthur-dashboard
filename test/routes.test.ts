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

  it('GET /api/health reports integration config without secrets', async () => {
    const res = await app.request('/api/health', {}, emptyEnv)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      calendarConfigured: boolean
      gmailConfigured: boolean
      emailConfigured: boolean
      emailMissingSecrets: string[]
      answerDraftingConfigured: boolean
    }
    expect(body.calendarConfigured).toBe(false)
    expect(body.gmailConfigured).toBe(false)
    expect(body.emailConfigured).toBe(false)
    expect(body.emailMissingSecrets).toContain('NOTIFY_EMAIL')
    expect(body.answerDraftingConfigured).toBe(false)
  })

  it('reports Gmail send as configured once the send secrets are present', async () => {
    const res = await app.request('/api/health', {}, {
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GMAIL_REFRESH_TOKEN: 'token',
      NOTIFY_EMAIL: 'doug@example.com',
    } as Record<string, unknown>)
    const body = (await res.json()) as { emailConfigured: boolean }
    expect(body.emailConfigured).toBe(true)
  })

  it('GET /api/answer-library is registered', async () => {
    const res = await app.request('/api/answer-library', {}, {
      DB: {
        prepare() {
          throw new Error('reached the answer-library router')
        },
      },
    } as unknown as Record<string, unknown>)
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('reached the answer-library router')
  })

  // Regression guard mirroring the /api/sync/reconcile bug: the application
  // routes are nested under a gig id, so the gig router's GET '/:id' must not
  // claim '/:id/application' first.
  it('GET /api/gigs/:id/application resolves to the application router', async () => {
    const res = await app.request('/api/gigs/1/application', {}, {
      DB: {
        prepare() {
          throw new Error('reached the application router')
        },
      },
    } as unknown as Record<string, unknown>)
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('reached the application router')
  })
})
