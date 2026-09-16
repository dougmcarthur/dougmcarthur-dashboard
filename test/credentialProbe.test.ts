import { describe, it, expect, afterEach, vi } from 'vitest'
import { probeCredential } from '../src/lib/credentialCheck'
import type { Env } from '../src/types'

const NOW = new Date('2026-09-16T12:00:00.000Z')

const env = {
  GOOGLE_CLIENT_ID: 'client',
  GOOGLE_CLIENT_SECRET: 'secret',
  GMAIL_REFRESH_TOKEN: 'refresh',
  GOOGLE_REFRESH_TOKEN: 'refresh-cal',
} as unknown as Env

function answer(status: number, body = '') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('probeCredential', () => {
  it('spends the refresh token rather than reading any data', async () => {
    const spy = vi.fn(async () => new Response('{"access_token":"a"}', { status: 200 }))
    vi.stubGlobal('fetch', spy)

    await probeCredential(env, 'gmail', NOW)

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(init.method).toBe('POST')
    // A probe that listed a message would fail for reasons that are not the
    // credential, which is the thing being tested.
    expect(String(init.body)).toContain('grant_type=refresh_token')
  })

  it('records the time it was handed, never the clock it could read', async () => {
    answer(200, '{"access_token":"a"}')
    const record = await probeCredential(env, 'gmail', NOW)
    expect(record.at).toBe(NOW.toISOString())
  })

  it('treats a refusal as a verdict about the credential', async () => {
    for (const status of [400, 401, 403]) {
      answer(status, '{"error":"invalid_grant"}')
      const record = await probeCredential(env, 'gmail', NOW)
      expect(record.outcome).toBe('rejected')
      expect(record.detail).toContain('invalid_grant')
    }
  })

  it('treats Google having a bad day as no verdict at all', async () => {
    // The distinction the whole design rests on: a 500 means Google had a
    // problem and the credential was never judged. Recording it as a refusal
    // would invent a verdict and put a critical alarm on the bell.
    for (const status of [500, 502, 429]) {
      answer(status, 'upstream error')
      const record = await probeCredential(env, 'gmail', NOW)
      expect(record.outcome).toBe('unreachable')
    }
  })

  it('treats a thrown request as unreachable, not as a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const record = await probeCredential(env, 'gmail', NOW)
    expect(record.outcome).toBe('unreachable')
    expect(record.detail).toContain('network down')
  })

  it('accepts a 200 as working and stores no detail to show', async () => {
    answer(200, '{"access_token":"a"}')
    const record = await probeCredential(env, 'gmail', NOW)
    expect(record.outcome).toBe('working')
    expect(record.detail).toBeUndefined()
  })

  it('flattens and truncates whatever Google says, because a card is one line', async () => {
    answer(400, `{\n  "error":  "invalid_grant",\n  "description": "${'x'.repeat(400)}"\n}`)
    const record = await probeCredential(env, 'gmail', NOW)
    expect(record.detail).not.toContain('\n')
    expect(record.detail!.length).toBeLessThanOrEqual(200)
    expect(record.detail!.endsWith('…')).toBe(true)
  })

  it('answers rather than throwing when asked about something it cannot probe', async () => {
    const record = await probeCredential({} as Env, 'gmail', NOW)
    expect(record.outcome).toBe('unreachable')
  })

  it('uses each connection its own refresh token', async () => {
    const spy = vi.fn(async () => new Response('{"access_token":"a"}', { status: 200 }))
    vi.stubGlobal('fetch', spy)

    await probeCredential(env, 'gmail', NOW)
    await probeCredential(env, 'calendar', NOW)

    const bodies = spy.mock.calls.map(([, init]) => String((init as RequestInit).body))
    expect(bodies[0]).toContain('refresh_token=refresh&')
    expect(bodies[1]).toContain('refresh_token=refresh-cal')
  })
})
