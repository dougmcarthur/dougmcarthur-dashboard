import { readdirSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { asTenantId } from '../src/db/scope'
import { isOwnerTenant } from '../src/lib/actor'
import { agentMayPublish } from '../src/lib/catalog'
import { composeFeed } from '../src/routes/notifications'
import replies from '../src/routes/replies'
import syncReconcile from '../src/routes/syncReconcile'
import health from '../src/routes/health'
import agentTokens, { OWNER_ONLY_MESSAGE } from '../src/routes/agentTokens'
import { MAILBOX_NOT_AVAILABLE } from '../src/lib/ownerMailbox'
import { sqliteD1 } from './support/sqliteD1'

/**
 * What belongs to the owner and not to an account.
 *
 * The deployment has one mailbox, one sending address and one calendar, all of
 * them Worker secrets, and all of them the owner's. These tests are about what
 * happens when an invited artist asks for something that reads them: the answer
 * has to be "not yours", whatever the route was written for.
 */

const OWNER = asTenantId('tnt_0001')
const ARTIST = asTenantId('tnt_0002')

const MAILBOX = {
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'secret',
  GMAIL_REFRESH_TOKEN: 'mailbox-token',
}

function database(secrets: Record<string, string> = {}) {
  const { d1, db } = sqliteD1()
  db.exec(`INSERT INTO tenants (id, display_name, created_at) VALUES ('tnt_0002', 'Second Artist', '2026-10-01T00:00:00Z');`)
  db.exec(
    `INSERT INTO users (id, role, tenant_id, created_at) VALUES ('usr_0002', 'artist', 'tnt_0002', '2026-10-01T00:00:00Z');`,
  )
  return { env: { DB: d1, ...secrets } as never }
}

/** The router under a request that is already signed in as somebody. */
function as<T extends Hono<any>>(router: T, tenant: string, actor: Record<string, unknown> = { kind: 'user' }) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('actor' as never, { ...actor, tenant } as never)
    await next()
  })
  app.route('/', router as never)
  return app
}

describe('who holds the deployment\'s own mailbox', () => {
  it('is the owner\'s tenant and nobody else\'s', async () => {
    const t = database()
    expect(await isOwnerTenant(t.env, OWNER)).toBe(true)
    expect(await isOwnerTenant(t.env, ARTIST)).toBe(false)
  })
})

describe('reading the mailbox', () => {
  it('refuses an artist the reply scan, so the owner\'s mail never lands in their account', async () => {
    const t = database(MAILBOX)
    const res = await as(replies, ARTIST).request('/scan', { method: 'POST' }, t.env)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe(MAILBOX_NOT_AVAILABLE)
  })

  it('lets the owner through to the Gmail check', async () => {
    // No mailbox secrets, so past the gate it says Gmail is not configured.
    const t = database()
    const res = await as(replies, OWNER).request('/scan', { method: 'POST' }, t.env)
    expect(res.status).toBe(503)
  })

  it('refuses an artist the sent-mail reconcile, preview and apply, which would show them the owner\'s pitches', async () => {
    const t = database(MAILBOX)
    const app = as(syncReconcile, ARTIST)
    expect((await app.request('/', {}, t.env)).status).toBe(403)
    const apply = await app.request(
      '/apply',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ updates: [] }) },
      t.env,
    )
    expect(apply.status).toBe(403)
  })
})

describe('what the bell says about the deployment', () => {
  const rows = async (t: ReturnType<typeof database>, tenant: typeof OWNER) =>
    (await composeFeed(t.env, tenant, new Date('2026-10-09T12:00:00Z'), Infinity)).built.items
      .filter((n) => n.kind === 'connection')
      .map((n) => n.key)

  it('tells the owner their mailbox and sending address are not set up', async () => {
    const t = database()
    expect(await rows(t, OWNER)).toEqual(expect.arrayContaining(['connection:gmail', 'connection:email']))
  })

  it('does not tell an artist, who can do nothing about either', async () => {
    const t = database()
    const keys = await rows(t, ARTIST)
    expect(keys).not.toContain('connection:gmail')
    expect(keys).not.toContain('connection:email')
  })
})

describe('what Settings is told about the deployment', () => {
  const read = async (t: ReturnType<typeof database>, tenant: typeof OWNER) =>
    (await (await as(health, tenant).request('/', {}, t.env)).json()) as Record<string, unknown>

  it('names the missing secrets to the owner', async () => {
    const body = await read(database(), OWNER)
    expect(body.platform).toBe(true)
    expect(body.gmailMissingSecrets).toEqual(expect.arrayContaining(['GMAIL_REFRESH_TOKEN']))
  })

  it('names nothing to an artist, and says the owner\'s rows are not theirs', async () => {
    const body = await read(database(MAILBOX), ARTIST)
    expect(body.platform).toBe(false)
    expect(body.gmailConfigured).toBe(false)
    expect(body.gmailMissingSecrets).toEqual([])
    expect(body.calendarMissingSecrets).toEqual([])
    expect(body.credentials).toEqual([])
  })
})

describe('who may publish to the shared catalog', () => {
  const agent = { kind: 'agent' } as never
  const person = { kind: 'user' } as never

  it('lets the owner\'s research agents', async () => {
    expect(await agentMayPublish(database().env, agent, OWNER)).toBe(true)
  })

  it('does not let an artist\'s own agent, whose token they issued themselves', async () => {
    expect(await agentMayPublish(database().env, agent, ARTIST)).toBe(false)
  })

  it('does not publish what a person typed in, owner or not', async () => {
    expect(await agentMayPublish(database().env, person, OWNER)).toBe(false)
  })
})

describe('a route that reads the mailbox says so', () => {
  // Source-level, like `tenantScope.test.ts`: an unguarded route typechecks,
  // runs, and returns the right rows for as long as there is one artist.
  const MAILBOX_READS = /\b(?:fetchReplies|getSentEmailsForAddresses|sentThreadIds|runReplyScan)\b/

  it('asks whose mailbox it is before it reads one', () => {
    const dir = 'src/routes'
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => {
        const source = readFileSync(`${dir}/${f}`, 'utf8')
        // Defined there, or called there, and not guarded.
        return MAILBOX_READS.test(source) && !source.includes('refuseUnlessMailboxOwner')
      })
    expect(offenders).toEqual([])
  })
})

describe('the screens that would offer what the routes refuse', () => {
  const source = (path: string) => readFileSync(path, 'utf8')

  it('shows every account its own digest switch', () => {
    // It used to be hidden from artists because its request returned 403. Every
    // account has a digest now, off until they turn it on.
    const page = readFileSync('frontend/src/pages/SettingsPage.tsx', 'utf8')
    expect(page).toMatch(/right=\{<DigestSettingsCard \/>\}/)
    expect(page).not.toMatch(/role === 'owner' \? <DigestSettingsCard/)
  })

  it('offers the reply scan and the Gmail reconcile only where they work', () => {
    expect(source('frontend/src/components/ReplyInbox.tsx')).toMatch(/ownsMailbox && \(\s*<Button/)
    expect(source('frontend/src/pages/SyncPage.tsx')).toMatch(/ownsMailbox && <button/)
    expect(source('frontend/src/pages/SyncPage.tsx')).toMatch(/ownsMailbox && showReconcile/)
  })

  it('lists the owner\'s mailbox and sending address as the owner\'s, and as nobody else\'s', () => {
    expect(source('shared/integrations.ts').match(/ownerOnly: true/g)).toHaveLength(2)
    expect(source('frontend/src/components/IntegrationsCard.tsx')).toMatch(/spec\.ownerOnly && health\?\.platform === false/)
  })
})

describe("agent tokens are the owner's", () => {
  const artist = { kind: 'user', role: 'artist', session: { elevatedAt: null } }
  const owner = { kind: 'user', role: 'owner', session: { elevatedAt: null } }
  const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

  it('refuses an artist the list, issuing and revoking', async () => {
    const t = database()
    const app = as(agentTokens, ARTIST, artist)
    const list = await app.request('/', {}, t.env)
    expect(list.status).toBe(403)
    expect(((await list.json()) as { error: string }).error).toBe(OWNER_ONLY_MESSAGE)
    expect((await app.request('/', json({ label: 'mine' }), t.env)).status).toBe(403)
    expect((await app.request('/abc', { method: 'DELETE' }, t.env)).status).toBe(403)
  })

  it('lets the owner read the list', async () => {
    const t = database()
    const res = await as(agentTokens, OWNER, owner).request('/', {}, t.env)
    expect(res.status).toBe(200)
  })

  it('does not show the card to an artist', () => {
    expect(readFileSync('frontend/src/pages/SettingsPage.tsx', 'utf8')).toMatch(/role === 'owner' && <AgentTokensCard \/>/)
  })
})
