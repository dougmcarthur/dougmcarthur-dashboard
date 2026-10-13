import { describe, it, expect } from 'vitest'
import { asTenantId } from '../src/db/scope'
import { calendarWay } from '../src/lib/gigNudges'
import { composeFeed } from '../src/routes/notifications'
import { CALENDAR_APP_SCOPE, CALENDAR_OWNED_SCOPE } from '../src/lib/googleGrant'
import { sqliteD1 } from './support/sqliteD1'

/**
 * Which way into the calendar is open, run against the production schema.
 *
 * Settings reads the artist's grant and the bell used to read the Worker secrets
 * alone, so a calendar connected with the button was *Working* on one screen and
 * *disconnected* on the other, with a critical row on the bell and a Reconnect
 * button that reconnected nothing. The two now answer through `calendarWay`, and
 * this is where that stays true: it needs real rows because what is being tested
 * is which rows count, and for whom.
 */

const OWNER = asTenantId('tnt_0001')
const OTHER = asTenantId('tnt_0002')

const SECRETS = {
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'secret',
  GOOGLE_REFRESH_TOKEN: 'token',
  GOOGLE_CALENDAR_ID: 'owner-calendar',
}

function database(secrets: Record<string, string> = {}) {
  const { d1, db } = sqliteD1()

  const grant = (o: { tenant?: string; purpose: string; scopes: string; calendarId?: string | null }) =>
    db
      .prepare(
        `INSERT INTO google_grants (tenant_id, purpose, refresh_token, account_email, scopes, granted_at, calendar_id)
         VALUES (?, ?, 'encrypted', 'artist@example.com', ?, '2026-09-25T00:00:00.000Z', ?)`,
      )
      .run(o.tenant ?? OWNER, o.purpose, o.scopes, o.calendarId ?? null)

  return { env: { DB: d1, ...secrets } as never, grant }
}

describe('which way into the calendar is open', () => {
  it('is none when nothing has been connected and no secrets are set', async () => {
    const t = database()
    expect(await calendarWay(t.env, OWNER)).toBeNull()
  })

  it('is the artist\'s own calendar once they have connected one', async () => {
    const t = database()
    t.grant({ purpose: 'calendar', scopes: CALENDAR_APP_SCOPE, calendarId: 'scout-calendar' })
    expect(await calendarWay(t.env, OWNER)).toEqual({ kind: 'grant', calendarId: 'scout-calendar' })
  })

  it('does not count somebody else\'s grant', async () => {
    const t = database()
    t.grant({ tenant: OTHER, purpose: 'calendar', scopes: CALENDAR_APP_SCOPE, calendarId: 'theirs' })
    expect(await calendarWay(t.env, OWNER)).toBeNull()
  })

  it('does not count a grant Google gave less than was asked for', async () => {
    // Connected, and unable to write. Settings calls this rejected; the bell
    // must not call it fine.
    const t = database()
    t.grant({ purpose: 'calendar', scopes: 'openid email', calendarId: 'scout-calendar' })
    expect(await calendarWay(t.env, OWNER)).toBeNull()
  })

  it('does not count a grant with no calendar to write to', async () => {
    const t = database()
    t.grant({ purpose: 'calendar', scopes: CALENDAR_APP_SCOPE, calendarId: null })
    expect(await calendarWay(t.env, OWNER)).toBeNull()
  })

  it('prefers the primary-calendar opt-in, because choosing it was deliberate', async () => {
    const t = database()
    t.grant({ purpose: 'calendar', scopes: CALENDAR_APP_SCOPE, calendarId: 'scout-calendar' })
    t.grant({ purpose: 'calendar.primary', scopes: CALENDAR_OWNED_SCOPE })
    expect(await calendarWay(t.env, OWNER)).toEqual({ kind: 'primary' })
  })

  it('falls back to the Worker secrets, which a deployment set up that way still relies on', async () => {
    const t = database(SECRETS)
    expect(await calendarWay(t.env, OWNER)).toEqual({ kind: 'secrets' })
  })

  it("does not give an artist the owner's calendar, which is what the secrets are", async () => {
    // A second artist with no grant of their own has no calendar. Falling
    // through to the secrets put their bookings on the owner's diary.
    const t = database(SECRETS)
    expect(await calendarWay(t.env, OTHER)).toBeNull()
  })

  it('still gives an artist their own grant when the secrets are set', async () => {
    const t = database(SECRETS)
    t.grant({ tenant: OTHER, purpose: 'calendar', scopes: CALENDAR_APP_SCOPE, calendarId: 'theirs' })
    expect(await calendarWay(t.env, OTHER)).toEqual({ kind: 'grant', calendarId: 'theirs' })
  })

  it('lets a grant win over the secrets', async () => {
    const t = database(SECRETS)
    t.grant({ purpose: 'calendar', scopes: CALENDAR_APP_SCOPE, calendarId: 'scout-calendar' })
    expect(await calendarWay(t.env, OWNER)).toEqual({ kind: 'grant', calendarId: 'scout-calendar' })
  })
})

describe('what the bell says about it', () => {
  const calendarRow = async (t: ReturnType<typeof database>) =>
    (await composeFeed(t.env, OWNER, new Date('2026-10-09T12:00:00Z'), Infinity)).built.items.find(
      (n) => n.key === 'connection:calendar',
    )

  it('says nothing when the calendar was connected with the button', async () => {
    const t = database()
    t.grant({ purpose: 'calendar', scopes: CALENDAR_APP_SCOPE, calendarId: 'scout-calendar' })
    expect(await calendarRow(t)).toBeUndefined()
  })

  it('still says so when nothing is connected', async () => {
    const t = database()
    expect((await calendarRow(t))?.title).toBe('Google Calendar disconnected')
  })
})
