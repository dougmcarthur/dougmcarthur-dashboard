import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { asTenantId } from '../src/db/scope'
import { accountAddress, readAccountDigest, writeAccountDigest, recordDigestSent } from '../src/lib/digestSettings'
import { sendMail, UndeliverableRecipient } from '../src/lib/mailer'
import { writeSetting, DIGEST_KEYS } from '../src/lib/settings'
import digest from '../src/routes/digest'
import { sqliteD1 } from './support/sqliteD1'

/**
 * Every account has a weekly digest, and an artist's cannot go anywhere but to
 * them.
 *
 * The owner's keeps working through the move: its switch and schedule were in
 * `app_settings`, and those still answer until the owner changes something.
 */

const OWNER = asTenantId('tnt_0001')
const ARTIST = asTenantId('tnt_0002')
const OTHER = asTenantId('tnt_0003')

function database(extra: Record<string, unknown> = {}) {
  const { d1, db } = sqliteD1()
  const sent: Array<{ to: string; subject: string }> = []
  db.exec(`
    INSERT INTO tenants (id, display_name, created_at) VALUES
      ('tnt_0002', 'Second Artist', '2026-10-01T00:00:00Z'),
      ('tnt_0003', 'Third Artist', '2026-10-02T00:00:00Z'),
      ('tnt_0009', 'No Address', '2026-10-03T00:00:00Z');
    INSERT INTO users (id, role, tenant_id, email, created_at) VALUES
      ('usr_0002', 'artist', 'tnt_0002', 'second@example.test', '2026-10-01T00:00:00Z'),
      ('usr_0003', 'artist', 'tnt_0003', 'third@example.test', '2026-10-02T00:00:00Z');
    UPDATE users SET email = 'owner@example.test' WHERE id = 'usr_0001';
  `)
  const EMAIL = {
    send: async (m: { to: string; subject: string }) => {
      sent.push({ to: m.to, subject: m.subject })
      return { messageId: 'm1' }
    },
  }
  return { env: { DB: d1, AUTH_EMAIL: 'owner@example.test', EMAIL, ...extra } as never, sent }
}

describe("where an account's digest goes", () => {
  it('is the address the artist signs in with', async () => {
    const t = database()
    expect(await accountAddress(t.env, ARTIST)).toBe('second@example.test')
    const settings = await readAccountDigest(t.env, ARTIST)
    expect(settings.recipient).toBe('second@example.test')
    expect(settings.audience).toBe('tenant')
    expect(settings.recipientEditable).toBe(false)
  })

  it('is nowhere, rather than somebody else, for an account with no address', async () => {
    const t = database()
    expect(await accountAddress(t.env, asTenantId('tnt_0009'))).toBeNull()
    expect((await readAccountDigest(t.env, asTenantId('tnt_0009'))).recipient).toBe('')
  })

  it("stays the owner's configured recipient for the owner", async () => {
    const t = database()
    await writeSetting(t.env, DIGEST_KEYS.recipient, 'owner@example.test')
    const settings = await readAccountDigest(t.env, OWNER)
    expect(settings.recipient).toBe('owner@example.test')
    expect(settings.audience).toBe('owner')
    expect(settings.recipientEditable).toBe(true)
  })
})

describe('the switch and the schedule', () => {
  it('start off for an artist, until they turn it on', async () => {
    const t = database()
    expect((await readAccountDigest(t.env, ARTIST)).enabled).toBe(false)
    await writeAccountDigest(t.env, ARTIST, { enabled: true, day: 'fri', hour: 17, timezone: 'America/Vancouver' })
    const on = await readAccountDigest(t.env, ARTIST)
    expect(on).toMatchObject({
      enabled: true,
      schedule: { day: 'fri', hour: 17, timezone: 'America/Vancouver' },
      zoneChosen: true,
    })
  })

  it("are each account's own, so one artist cannot change another's", async () => {
    const t = database()
    await writeAccountDigest(t.env, ARTIST, { enabled: true, hour: 6 })
    expect((await readAccountDigest(t.env, OTHER)).enabled).toBe(false)
    expect((await readAccountDigest(t.env, OTHER)).schedule.hour).toBe(8)
  })

  it('still answer from the old platform rows for the owner, so nothing was migrated and nothing stopped', async () => {
    const t = database()
    await writeSetting(t.env, DIGEST_KEYS.enabled, 'true')
    await writeSetting(t.env, DIGEST_KEYS.day, 'wed')
    await writeSetting(t.env, DIGEST_KEYS.hour, '7')
    await writeSetting(t.env, DIGEST_KEYS.lastSentAt, '2026-10-01T13:00:00.000Z')
    const owner = await readAccountDigest(t.env, OWNER)
    expect(owner).toMatchObject({
      enabled: true,
      schedule: { day: 'wed', hour: 7 },
      lastSentAt: '2026-10-01T13:00:00.000Z',
      zoneChosen: false,
    })
  })

  it("prefer the owner's own row once they change something", async () => {
    const t = database()
    await writeSetting(t.env, DIGEST_KEYS.enabled, 'true')
    await writeAccountDigest(t.env, OWNER, { enabled: false })
    expect((await readAccountDigest(t.env, OWNER)).enabled).toBe(false)
  })

  it('give an artist no platform row to fall back to, even when the owner has one', async () => {
    const t = database()
    await writeSetting(t.env, DIGEST_KEYS.enabled, 'true')
    await writeSetting(t.env, DIGEST_KEYS.lastSentAt, '2026-10-01T13:00:00.000Z')
    const artist = await readAccountDigest(t.env, ARTIST)
    expect(artist.enabled).toBe(false)
    expect(artist.lastSentAt).toBeNull()
  })

  it('record when a send landed, for the account that sent it', async () => {
    const t = database()
    await recordDigestSent(t.env, ARTIST, new Date('2026-10-05T12:00:00Z'))
    expect((await readAccountDigest(t.env, ARTIST)).lastSentAt).toBe('2026-10-05T12:00:00.000Z')
    expect((await readAccountDigest(t.env, OTHER)).lastSentAt).toBeNull()
  })

  it('fall back to the default for a stored hour that is not a number', async () => {
    const t = database()
    await writeAccountDigest(t.env, ARTIST, { hour: 7 })
    // Written by hand, as something else might have written it.
    const { writeTenantSetting } = await import('../src/lib/nudgeSettings')
    await writeTenantSetting(t.env, ARTIST, DIGEST_KEYS.hour, 'noon')
    expect((await readAccountDigest(t.env, ARTIST)).schedule.hour).toBe(8)
  })
})

describe("mailing an artist's digest", () => {
  const mail = (to: string, tenant?: typeof ARTIST) => ({
    to,
    audience: 'tenant' as const,
    tenant,
    from: 'digest@example.test',
    subject: 'Scout',
    text: 't',
    html: 'h',
  })

  it('reaches the artist at their own address', async () => {
    const t = database()
    await sendMail(t.env, mail('second@example.test', ARTIST))
    expect(t.sent.map((s) => s.to)).toEqual(['second@example.test'])
  })

  it("refuses the owner's address on an artist's digest, and the artist's on another's", async () => {
    const t = database()
    await expect(sendMail(t.env, mail('owner@example.test', ARTIST))).rejects.toBeInstanceOf(UndeliverableRecipient)
    await expect(sendMail(t.env, mail('second@example.test', OTHER))).rejects.toBeInstanceOf(UndeliverableRecipient)
    expect(t.sent).toEqual([])
  })

  it('refuses a stranger and a missing tenant', async () => {
    const t = database()
    await expect(sendMail(t.env, mail('stranger@example.test', ARTIST))).rejects.toBeInstanceOf(UndeliverableRecipient)
    await expect(sendMail(t.env, mail('second@example.test'))).rejects.toBeInstanceOf(UndeliverableRecipient)
  })
})

describe('changing it', () => {
  const as = (tenant: string, role: 'owner' | 'artist') => {
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('actor' as never, { kind: 'user', role, tenant, session: { elevatedAt: null } } as never)
      await next()
    })
    app.route('/', digest as never)
    return app
  }
  const patch = (body: unknown) => ({
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  it('lets an artist switch it on and choose when', async () => {
    const t = database()
    const res = await as('tnt_0002', 'artist').request(
      '/settings',
      patch({ enabled: true, day: 'thu', hour: 9, timezone: 'America/Toronto' }),
      t.env,
    )
    expect(res.status).toBe(200)
    expect(await readAccountDigest(t.env, ARTIST)).toMatchObject({ enabled: true, schedule: { day: 'thu', hour: 9 } })
    // And not the owner's.
    expect((await readAccountDigest(t.env, OWNER)).enabled).toBe(false)
  })

  it('refuses an artist who names a recipient or a sender, rather than ignoring them', async () => {
    const t = database()
    const app = as('tnt_0002', 'artist')
    expect((await app.request('/settings', patch({ recipient: 'owner@example.test' }), t.env)).status).toBe(403)
    expect((await app.request('/settings', patch({ sender: 'someone@example.test' }), t.env)).status).toBe(403)
    expect((await readAccountDigest(t.env, ARTIST)).recipient).toBe('second@example.test')
  })

  it("lets the owner set the recipient, to an address that is theirs", async () => {
    const t = database()
    const app = as('tnt_0001', 'owner')
    expect((await app.request('/settings', patch({ recipient: 'owner@example.test' }), t.env)).status).toBe(200)
    // An artist's address is on file and is not the owner's to send the owner's digest to.
    expect((await app.request('/settings', patch({ recipient: 'second@example.test' }), t.env)).status).toBe(400)
  })
})
