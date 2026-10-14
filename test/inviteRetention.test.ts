import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  INVITE_TTL_DAYS,
  UNUSED_INVITE_RETENTION_DAYS,
  inviteRetentionCutoff,
} from '../shared/invites'
import { pruneInvites } from '../src/lib/invites'
import { sqliteD1 } from './support/sqliteD1'

/**
 * An invitation nobody used goes ninety days after it stopped working.
 *
 * It holds the name and address the owner typed for somebody who never signed
 * up, and until this rule nothing ever removed it. The prune runs for real
 * against the production schema, because the WHERE is the whole question: one
 * that missed `redeemed_at` would delete the record of where an account came
 * from, and one that read only the expiry would keep a withdrawn invitation for
 * as long as the thirty days it had left.
 */

const NOW = new Date('2026-10-13T12:00:00.000Z')
const DAY = 86_400_000
/** An ISO time `days` before NOW. A negative number is the future. */
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()

type Seed = {
  id: string
  expiresAt: string
  revokedAt?: string | null
  redeemedAt?: string | null
}

function database(rows: Seed[]) {
  const { d1, db } = sqliteD1()
  for (const r of rows) {
    db.prepare(
      `INSERT INTO invites (id, token_hash, email, display_name, issued_by, expires_at,
        redeemed_at, redeemed_user_id, revoked_at, created_at)
       VALUES (?, ?, ?, 'An Invitee', 'usr_owner', ?, ?, ?, ?, ?)`,
    ).run(
      r.id,
      `hash-${r.id}`,
      `${r.id}@invitee.example`,
      r.expiresAt,
      r.redeemedAt ?? null,
      r.redeemedAt ? `usr_${r.id}` : null,
      r.revokedAt ?? null,
      ago(200),
    )
  }
  const remaining = () =>
    (db.prepare('SELECT id FROM invites ORDER BY id').all() as Array<{ id: string }>).map((row) => row.id)
  return { env: { DB: d1 } as never, remaining }
}

describe('the period', () => {
  it('outlasts the days an invitation can be used for', () => {
    // Otherwise a row would be deleted while its link still worked.
    expect(UNUSED_INVITE_RETENTION_DAYS).toBeGreaterThan(INVITE_TTL_DAYS)
  })

  it('is measured back from the date it is handed', () => {
    expect(inviteRetentionCutoff(NOW)).toBe(ago(UNUSED_INVITE_RETENTION_DAYS))
  })
})

describe('what the sweep removes, run for real', () => {
  it('removes one that expired more than the period ago', async () => {
    const { env, remaining } = database([{ id: 'old', expiresAt: ago(UNUSED_INVITE_RETENTION_DAYS + 1) }])
    expect(await pruneInvites(env, NOW)).toBe(1)
    expect(remaining()).toEqual([])
  })

  it('keeps one on the line and one inside it', async () => {
    // Strictly older, so a row exactly on the boundary waits one more tick.
    const { env, remaining } = database([
      { id: 'on-the-line', expiresAt: ago(UNUSED_INVITE_RETENTION_DAYS) },
      { id: 'inside', expiresAt: ago(UNUSED_INVITE_RETENTION_DAYS - 1) },
    ])
    expect(await pruneInvites(env, NOW)).toBe(0)
    expect(remaining()).toEqual(['inside', 'on-the-line'])
  })

  it('removes one a millisecond past the line', async () => {
    const past = new Date(Date.parse(ago(UNUSED_INVITE_RETENTION_DAYS)) - 1).toISOString()
    const { env, remaining } = database([{ id: 'just-past', expiresAt: past }])
    expect(await pruneInvites(env, NOW)).toBe(1)
    expect(remaining()).toEqual([])
  })

  it('keeps one that is still valid, and one that lapsed recently', async () => {
    const { env, remaining } = database([
      { id: 'valid', expiresAt: ago(-10) },
      { id: 'lapsed-lately', expiresAt: ago(10) },
    ])
    expect(await pruneInvites(env, NOW)).toBe(0)
    expect(remaining()).toEqual(['lapsed-lately', 'valid'])
  })
})

describe('a withdrawn invitation', () => {
  it('is measured from the withdrawal when that came before the expiry', async () => {
    // Issued 100 days ago for 30 and withdrawn the same day: it would not lapse
    // for another 70 days, and it has been dead for 100.
    const { env, remaining } = database([
      {
        id: 'withdrawn-early',
        expiresAt: ago(100 - INVITE_TTL_DAYS),
        revokedAt: ago(100),
      },
    ])
    expect(await pruneInvites(env, NOW)).toBe(1)
    expect(remaining()).toEqual([])
  })

  it('does not restart the clock on one that had already lapsed', async () => {
    // Withdrawing a dead invitation is housekeeping, not a reason to keep its
    // address for another ninety days.
    const { env, remaining } = database([
      { id: 'withdrawn-late', expiresAt: ago(100), revokedAt: ago(5) },
    ])
    expect(await pruneInvites(env, NOW)).toBe(1)
    expect(remaining()).toEqual([])
  })

  it('is kept while the withdrawal and the expiry are both inside the period', async () => {
    const { env, remaining } = database([
      { id: 'withdrawn-lately', expiresAt: ago(-10), revokedAt: ago(20) },
    ])
    expect(await pruneInvites(env, NOW)).toBe(0)
    expect(remaining()).toEqual(['withdrawn-lately'])
  })
})

describe('a used invitation', () => {
  it('is never matched, however old, because it goes with its account', async () => {
    const { env, remaining } = database([
      { id: 'used', expiresAt: ago(400), redeemedAt: ago(420) },
      // Cannot happen through `revokeInvite`, which refuses a redeemed row, and
      // is here so the boundary is the redemption and not the other dates.
      { id: 'used-and-withdrawn', expiresAt: ago(400), redeemedAt: ago(420), revokedAt: ago(410) },
    ])
    expect(await pruneInvites(env, NOW)).toBe(0)
    expect(remaining()).toEqual(['used', 'used-and-withdrawn'])
  })
})

describe('the whole table, in one pass', () => {
  const rows: Seed[] = [
    { id: 'a-expired-long-ago', expiresAt: ago(200) },
    { id: 'b-withdrawn-long-ago', expiresAt: ago(-5), revokedAt: ago(150) },
    { id: 'c-used-long-ago', expiresAt: ago(300), redeemedAt: ago(320) },
    { id: 'd-valid', expiresAt: ago(-20) },
    { id: 'e-lapsed-lately', expiresAt: ago(3) },
    { id: 'f-withdrawn-lately', expiresAt: ago(-20), revokedAt: ago(2) },
  ]

  it('removes exactly the two that are unused and past it', async () => {
    const { env, remaining } = database(rows)
    expect(await pruneInvites(env, NOW)).toBe(2)
    expect(remaining()).toEqual(['c-used-long-ago', 'd-valid', 'e-lapsed-lately', 'f-withdrawn-lately'])
  })

  it('finds nothing the second time', async () => {
    const { env } = database(rows)
    await pruneInvites(env, NOW)
    expect(await pruneInvites(env, NOW)).toBe(0)
  })

  it('removes the rest once they have aged out too', async () => {
    const { env, remaining } = database(rows)
    await pruneInvites(env, NOW)
    const later = new Date(NOW.getTime() + (UNUSED_INVITE_RETENTION_DAYS + 25) * DAY)
    // The three unused ones are past it by then. The used one is still there.
    expect(await pruneInvites(env, later)).toBe(3)
    expect(remaining()).toEqual(['c-used-long-ago'])
  })
})

describe('where it runs', () => {
  const withoutComments = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('is on the daily housekeeping tick, once, beside the invitation-request sweep', () => {
    const index = withoutComments(readFileSync('src/index.ts', 'utf8'))
    const requests = index.indexOf('await pruneInviteRequests(env, new Date())')
    const invites = index.indexOf('await pruneInvites(env, new Date())')
    expect(requests).toBeGreaterThan(-1)
    expect(invites).toBeGreaterThan(requests)
    // Not a loop over tenants: invitations have none.
    expect(index.match(/pruneInvites\(/g)).toHaveLength(1)
    expect(index).not.toMatch(/for \(const tenant of tenants\)[^}]*pruneInvites/)
  })

  it('never selects on who a row belongs to, or deletes by account', () => {
    // A used invitation leaves through `removeTenant`. If this file started
    // matching on `redeemedUserId` it would be a second way to do that.
    const lib = withoutComments(readFileSync('src/lib/invites.ts', 'utf8'))
    const start = lib.indexOf('export async function pruneInvites')
    const body = lib.slice(start, lib.indexOf('export interface RedeemedAccount'))
    expect(body).toContain('isNull(invites.redeemedAt)')
    expect(body).not.toContain('redeemedUserId')
  })
})
