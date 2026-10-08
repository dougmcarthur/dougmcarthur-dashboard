import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { createSession, sha256Hex } from '../src/lib/auth'
import { SESSION_COOKIE } from '../shared/auth'
import { sqliteD1 } from './support/sqliteD1'

/**
 * The sync routes, with their terms, against the production schema.
 *
 * What is at stake is not a field: it is whether a target that refuses cold
 * pitches can reach the artist as something to send. So these run the real
 * routes, with real sessions and a real SQLite, and look at what was stored and
 * what was offered.
 */

const NOW = '2026-10-07T12:00:00.000Z'

const REFUSING_SITE = `<html><body><p>We license music to film.</p><p>NO unsolicited material           please.</p></body></html>`

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** A Worker with a session for the owner, and a fetch that serves one site. */
async function setup(site: Record<string, string> = {}) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))

  const requested: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input)
      requested.push(url)
      const body = site[url]
      const res = new Response(body ?? '', { status: body === undefined ? 404 : 200, headers: { 'content-type': 'text/html' } })
      Object.defineProperty(res, 'url', { value: url })
      return res
    }),
  )

  const { d1, db } = sqliteD1()
  const env = { DB: d1, DASHBOARD_URL: 'http://localhost:8787', API_TOKEN: 'legacy-secret' } as never
  db.exec(`INSERT INTO tenants (id, display_name, created_at) VALUES ('tnt_0002', 'Artist', '2026-01-01')`)
  db.prepare(`INSERT INTO agent_tokens (id, tenant_id, token_hash, label) VALUES ('tok_1', 'tnt_0001', ?, 'Research routines')`).run(
    await sha256Hex('issued-token'),
  )

  const background: Array<Promise<unknown>> = []
  const ctx = { waitUntil: (p: Promise<unknown>) => void background.push(p), passThroughOnException() {} }

  const { token } = await createSession(env, { credentialId: null, label: 'test', userId: 'usr_0001' })
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, withContext = false) =>
    app.request(
      path,
      {
        method,
        headers: { 'content-type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}`, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env,
      withContext ? (ctx as never) : undefined,
    )
  const asAgent = (path: string, body: unknown) =>
    app.request(
      path,
      { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer issued-token' }, body: JSON.stringify(body) },
      env,
    )

  const row = (id: number) => db.prepare(`SELECT * FROM sync_targets WHERE id = ?`).get(id) as Record<string, string | null>
  const settled = () => Promise.all(background.splice(0))
  return { db, env, call, asAgent, row, requested, settled }
}

const PITCH = { name: 'Friends Music Partners', contactEmail: 'beth@friends.example', notes: 'LA library.', pitchDraft: 'Hey Beth, ...' }

describe('filing a target', () => {
  it('closes one whose own notes say it refuses, whoever filed it', async () => {
    const t = await setup()
    const res = await t.call('POST', '/api/sync', { ...PITCH, notes: 'LA library. They do not accept unsolicited submissions.' })
    expect(res.status).toBe(201)
    const { id } = (await res.json()) as { id: number }
    expect(t.row(id)).toMatchObject({
      submission_policy: 'closed',
      policy_evidence: 'They do not accept unsolicited submissions.',
      policy_checked_at: NOW,
    })
  })

  it('starts a target unchecked when nobody said anything about its rules', async () => {
    const t = await setup()
    const { id } = (await (await t.call('POST', '/api/sync', PITCH)).json()) as { id: number }
    expect(t.row(id)).toMatchObject({ submission_policy: null, policy_checked_at: null })
  })

  it('does not read a website until there is somewhere to read it from, which a unit test never has', async () => {
    const t = await setup()
    await t.call('POST', '/api/sync', PITCH)
    expect(t.requested).toEqual([])
  })

  it('reads the site after the response, and a refusal on it closes the target', async () => {
    const t = await setup({ 'https://friends.example/about.html': REFUSING_SITE, 'https://friends.example/': '<p>Home.</p>' })
    const res = await t.call('POST', '/api/sync', PITCH, {}, true)
    const { id } = (await res.json()) as { id: number }
    expect(t.row(id).submission_policy).toBeNull()

    await t.settled()
    expect(t.row(id)).toMatchObject({
      submission_policy: 'closed',
      policy_evidence: 'NO unsolicited material please.',
      policy_url: 'https://friends.example/about.html',
    })
  })

  it('refuses a website that is not a web address', async () => {
    const t = await setup()
    const res = await t.call('POST', '/api/sync', { ...PITCH, website: 'javascript:alert(1)' })
    expect(res.status).toBe(400)
  })

  it('stores a website with the scheme a person left off', async () => {
    const t = await setup()
    const { id } = (await (await t.call('POST', '/api/sync', { ...PITCH, website: 'friends.example' })).json()) as { id: number }
    expect(t.row(id).website).toBe('https://friends.example')
  })
})

describe('the forms on the Sync page', () => {
  // Both build their body with `field || null`, so a blank field is a null.
  // The route answered 400 to every one of them, which meant a target with a
  // field left empty could not be created or saved from the screen at all.
  it('create a target with blank fields', async () => {
    const t = await setup()
    const res = await t.call('POST', '/api/sync', {
      name: 'Blank Fields Music',
      agencyType: null,
      contactEmail: null,
      contactRole: null,
      confirmationMethod: null,
      notes: null,
      pitchDraft: null,
      website: null,
      status: 'draft_ready',
    })
    expect(res.status).toBe(201)
  })

  it('save a target after a field was cleared, and a cleared field is cleared', async () => {
    const t = await setup()
    const { id } = (await (await t.call('POST', '/api/sync', { ...PITCH, contactRole: 'Founder', website: 'friends.example' })).json()) as { id: number }
    const res = await t.call('PATCH', `/api/sync/${id}`, { name: 'Friends Music Partners', contactRole: null, website: null, notes: null, status: null })
    expect(res.status).toBe(200)
    expect(t.row(id)).toMatchObject({ contact_role: null, website: null, notes: null, status: 'draft_ready' })
  })
})

describe('what a research agent may file about a target\'s rules', () => {
  const FILED = { name: 'Marmoset', contactEmail: 'sync@marmoset.example', notes: 'Library.', submissionPolicy: 'unknown' }

  it('has to say, even if the answer is "unknown"', async () => {
    const t = await setup()
    const { submissionPolicy: _, ...without } = FILED
    const res = await t.asAgent('/api/sync', without)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/submissionPolicy/)
  })

  it('cannot call a target open without the sentence that says so', async () => {
    const t = await setup()
    const res = await t.asAgent('/api/sync', { ...FILED, submissionPolicy: 'open' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/policyQuote/)
  })

  it('files a refusal with its quote and its page, and nothing to pitch', async () => {
    const t = await setup()
    const res = await t.asAgent('/api/sync', {
      ...FILED,
      submissionPolicy: 'closed',
      policyQuote: 'NO unsolicited material please.',
      policyUrl: 'https://friends.example/about.html',
      website: 'https://friends.example',
    })
    expect(res.status).toBe(201)
    const { id } = (await res.json()) as { id: number }
    expect(t.row(id)).toMatchObject({
      submission_policy: 'closed',
      policy_evidence: 'NO unsolicited material please.',
      policy_url: 'https://friends.example/about.html',
      website: 'https://friends.example',
      pitch_draft: null,
    })
  })

  it('files "unknown" as looked at and silent, which is not the same as unchecked', async () => {
    const t = await setup()
    const { id } = (await (await t.asAgent('/api/sync', FILED)).json()) as { id: number }
    expect(t.row(id).submission_policy).toBeNull()
    expect(t.row(id).policy_checked_at).toBe(NOW)
  })

  it('cannot make a policy of its own choosing by sending the columns', async () => {
    const t = await setup()
    const res = await t.asAgent('/api/sync', { ...FILED, policyOverriddenAt: NOW, policyCheckedAt: NOW })
    expect(res.status).toBe(400)
  })

  it('cannot reach the check, or the override', async () => {
    const t = await setup()
    const { id } = (await (await t.call('POST', '/api/sync', PITCH)).json()) as { id: number }
    const as = (method: string, path: string, body?: unknown) =>
      app.request(
        path,
        { method, headers: { 'content-type': 'application/json', Authorization: 'Bearer issued-token' }, body: body ? JSON.stringify(body) : undefined },
        t.env,
      )

    const check = await as('POST', `/api/sync/${id}/check-terms`)
    const override = await as('PATCH', `/api/sync/${id}`, { overrideTerms: true })
    expect(check.status).toBe(403)
    expect(override.status).toBe(403)
    expect(t.requested).toEqual([])
    expect(t.row(id).policy_overridden_at).toBeNull()
  })
})

describe('checking on request', () => {
  it('reads the site and returns the row with what was found', async () => {
    const t = await setup({ 'https://friends.example/about.html': REFUSING_SITE, 'https://friends.example/': '<p>Home.</p>' })
    const { id } = (await (await t.call('POST', '/api/sync', PITCH)).json()) as { id: number }
    const res = await t.call('POST', `/api/sync/${id}/check-terms`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id,
      submissionPolicy: 'closed',
      policyEvidence: 'NO unsolicited material please.',
      policyUrl: 'https://friends.example/about.html',
    })
  })

  it('says not found for another artist\'s target, and reads nothing', async () => {
    const t = await setup()
    const id = Number(
      t.db
        .prepare(`INSERT INTO sync_targets (tenant_id, name, contact_email, discovered_at, updated_at) VALUES ('tnt_0002', 'Theirs', 'x@theirs.example', ?, ?)`)
        .run(NOW, NOW).lastInsertRowid,
    )
    expect((await t.call('POST', `/api/sync/${id}/check-terms`)).status).toBe(404)
    expect(t.requested).toEqual([])
  })
})

describe('deciding to pitch anyway', () => {
  async function refused() {
    const t = await setup()
    const { id } = (await (await t.call('POST', '/api/sync', { ...PITCH, notes: 'Does not accept unsolicited submissions.' })).json()) as { id: number }
    return { t, id }
  }

  it('is recorded on its own column, and can be taken back', async () => {
    const { t, id } = await refused()
    const on = await t.call('PATCH', `/api/sync/${id}`, { overrideTerms: true })
    expect(on.status).toBe(200)
    expect(t.row(id)).toMatchObject({ submission_policy: 'closed', policy_overridden_at: NOW })

    await t.call('PATCH', `/api/sync/${id}`, { overrideTerms: false })
    expect(t.row(id).policy_overridden_at).toBeNull()
    expect(t.row(id).submission_policy).toBe('closed')
  })

  it('survives a check that finds the refusal again', async () => {
    const { t, id } = await refused()
    await t.call('PATCH', `/api/sync/${id}`, { overrideTerms: true })
    await t.call('POST', `/api/sync/${id}/check-terms`)
    expect(t.row(id).policy_overridden_at).toBe(NOW)
  })

  it('cannot be used to write the policy itself', async () => {
    const { t, id } = await refused()
    await t.call('PATCH', `/api/sync/${id}`, { submissionPolicy: 'open', policyEvidence: 'trust me' })
    // Unknown fields are not columns: the refusal is exactly as it was.
    expect(t.row(id)).toMatchObject({ submission_policy: 'closed', policy_evidence: 'Does not accept unsolicited submissions.' })
  })
})

describe('editing a target', () => {
  it('closes it when an edit to the notes says it refuses', async () => {
    const t = await setup()
    const { id } = (await (await t.call('POST', '/api/sync', PITCH)).json()) as { id: number }
    await t.call('PATCH', `/api/sync/${id}`, { notes: 'Emailed them. They say: no unsolicited material.' })
    expect(t.row(id)).toMatchObject({ submission_policy: 'closed', policy_evidence: 'They say: no unsolicited material.' })
  })

  it('does not close it for a note that only doubts', async () => {
    const t = await setup()
    const { id } = (await (await t.call('POST', '/api/sync', PITCH)).json()) as { id: number }
    await t.call('PATCH', `/api/sync/${id}`, { notes: 'Could not confirm they take unsolicited pitches.' })
    expect(t.row(id).submission_policy).toBeNull()
  })

  it('never clears a refusal because a note stopped mentioning it', async () => {
    const t = await setup()
    const { id } = (await (await t.call('POST', '/api/sync', { ...PITCH, notes: 'No unsolicited material.' })).json()) as { id: number }
    await t.call('PATCH', `/api/sync/${id}`, { notes: 'Nothing to say now.' })
    expect(t.row(id).submission_policy).toBe('closed')
  })

  it('reads a new address when it changes, and refuses one that is not an address', async () => {
    const t = await setup({ 'https://new.example/about': REFUSING_SITE, 'https://new.example/': '<p>Home.</p>' })
    const { id } = (await (await t.call('POST', '/api/sync', PITCH)).json()) as { id: number }

    expect((await t.call('PATCH', `/api/sync/${id}`, { website: 'not a web address at all' })).status).toBe(400)

    expect((await t.call('PATCH', `/api/sync/${id}`, { website: 'new.example' }, {}, true)).status).toBe(200)
    expect(t.row(id).website).toBe('https://new.example')
    await t.settled()
    expect(t.row(id).submission_policy).toBe('closed')
  })

  it('does not read again for an edit that leaves the address alone', async () => {
    const t = await setup()
    const { id } = (await (await t.call('POST', '/api/sync', { ...PITCH, website: 'friends.example' })).json()) as { id: number }
    await t.call('PATCH', `/api/sync/${id}`, { website: 'friends.example', contactRole: 'Founder' }, {}, true)
    await t.settled()
    expect(t.requested).toEqual([])
  })
})
