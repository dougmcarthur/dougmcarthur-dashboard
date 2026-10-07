import { afterEach, describe, it, expect, vi } from 'vitest'
import { api } from '../frontend/src/api'

/**
 * What a person reads when the server refuses a request, run through the real
 * client with a stand-in for the network.
 *
 * A route validated by zod answers `{ success: false, error: { issues: [...] } }`:
 * an object where every other refusal in this app sends a sentence. The client
 * read `error` as a sentence unconditionally, so the first thing a person saw
 * was a JavaScript error about a method that does not exist, and the diagnostics
 * the feedback form attaches were lost with it.
 */

const realFetch = globalThis.fetch

function serverSays(status: number, body: unknown) {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as never
}

async function messageOf(call: () => Promise<unknown>): Promise<string> {
  try {
    await call()
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
  throw new Error('the call was expected to fail')
}

const save = () => api.survey.answer({ id: 'a'.repeat(32), screen: 'A2', answer: { value: 'A2.lt2' }, seconds: 5 })

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('when the server refuses a request', () => {
  it('says what the server said, when it said it in a sentence', async () => {
    serverSays(409, { error: 'This survey is already finished.' })
    expect(await messageOf(save)).toBe('This survey is already finished.')
  })

  it('does not show a person a programming error when the refusal is a validation object', async () => {
    serverSays(400, { success: false, error: { name: 'ZodError', issues: [{ code: 'invalid_type', path: ['seconds'], message: 'Expected number' }] } })
    const message = await messageOf(save)
    expect(message).not.toMatch(/\[object Object\]|is not a function|undefined|ZodError/)
    expect(message).toMatch(/not accepted/i)
  })

  it('still reads the status line when the body is not JSON at all', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502, statusText: 'Bad Gateway' })) as never
    expect(await messageOf(save)).toBe('Bad Gateway')
  })
})
