import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isOwnMail, ownSenders, SCOUT_SENDERS } from '../shared/ownMail'
import { planReplyScan } from '../src/lib/gmailReplies'
import type { MatchableGig } from '../shared/replyMatch'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const TODAY = '2026-09-08'
const gig = (over: Partial<MatchableGig> = {}): MatchableGig => ({
  id: 1,
  name: 'Manitoba Arts Council Create Program',
  organizer: null,
  status: 'submitted',
  url: 'https://artscouncil.mb.ca',
  submittedAt: '2026-06-10T00:00:00Z',
  ...over,
})

/**
 * The weekly digest names the gigs that need a decision and lands in the
 * owner's own inbox, so the reply scan found it, matched it to whichever gig it
 * listed first and offered to bind `digest@` to that application.
 */
describe('which addresses count as this app', () => {
  it('always includes every address the send binding accepts', () => {
    const toml = read('../wrangler.toml')
    const block = toml.slice(toml.indexOf('allowed_sender_addresses'))
    const declared = [...block.slice(0, block.indexOf(']')).matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase())
    expect(declared.length).toBeGreaterThan(0)
    // A sender added to the binding and not here would be mail the scan reads.
    for (const address of declared) expect(SCOUT_SENDERS).toContain(address)
    expect(ownSenders()).toEqual(expect.arrayContaining(declared))
  })

  it('adds the configured senders, lower-cased and once', () => {
    const senders = ownSenders(['Digest@SunDogsMusic.ca', 'notes@sundogsmusic.ca', '  ', null, undefined])
    expect(senders).toContain('notes@sundogsmusic.ca')
    expect(senders.filter((a) => a === 'digest@sundogsmusic.ca')).toHaveLength(1)
    expect(senders.every((a) => a === a.toLowerCase())).toBe(true)
  })

  it('matches an address exactly, never a domain', () => {
    const senders = ownSenders()
    expect(isOwnMail('digest@sundogsmusic.ca', senders)).toBe(true)
    expect(isOwnMail('Digest@SunDogsMusic.ca', senders)).toBe(true)
    expect(isOwnMail('login@sundogsmusic.ca', senders)).toBe(true)
    // The artist's own mail lives on the same domain, and an organiser may be
    // answering somebody there.
    expect(isOwnMail('hello@sundogsmusic.ca', senders)).toBe(false)
    expect(isOwnMail('jane@mbartsnet.ca', senders)).toBe(false)
    expect(isOwnMail('', senders)).toBe(false)
  })
})

describe('what the scan asks Gmail for, with respect to its own mail', () => {
  it('leaves the digest and sign-in senders out of every query', () => {
    const plan = planReplyScan({
      gigs: [
        gig(),
        // A conjunction-only name, so a loose query exists as well as a precise one.
        gig({ id: 2, name: 'Riverbend Valley Gathering' }),
      ],
      today: TODAY,
    })
    expect(plan.queries.length).toBeGreaterThanOrEqual(2)
    for (const q of plan.queries) {
      expect(q).toContain('-from:digest@sundogsmusic.ca')
      expect(q).toContain('-from:login@sundogsmusic.ca')
    }
  })

  it('leaves out a sender the deployment was configured with', () => {
    const [q] = planReplyScan({ gigs: [gig()], today: TODAY, ownSenders: ['Scout@Example.test'] }).queries
    expect(q).toContain('-from:scout@example.test')
    expect(q).toContain('-from:digest@sundogsmusic.ca')
  })

  it('does not ask for mail from a bound address that is its own', () => {
    // A binding made from the Review queue's "Yes, this is the one" on a
    // digest, back when the scan still offered them.
    const { queries } = planReplyScan({
      gigs: [gig()],
      bindings: [
        { gigId: 1, kind: 'address', value: 'digest@sundogsmusic.ca' },
        { gigId: 1, kind: 'address', value: 'jane@mbartsnet.ca' },
      ],
      today: TODAY,
    })
    const joined = queries.join('\n')
    expect(joined).toContain(' from:jane@mbartsnet.ca')
    expect(joined).not.toMatch(/[ {(]from:digest@/)
  })

  it('still fits the query budget with the exclusions in the prefix', () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      gig({ id: i + 1, name: `Riverbend Valley Roots Gathering Number ${i}` }),
    )
    const plan = planReplyScan({ gigs: many, today: TODAY })
    expect(plan.queries.length).toBeGreaterThan(1)
    for (const q of plan.queries) expect(q.length).toBeLessThanOrEqual(1500)
  })
})

describe('what the scan does with its own mail once it has it', () => {
  const route = read('../src/routes/replies.ts')
  const scan = route.slice(route.indexOf('export async function runReplyScan'), route.indexOf('export type ReplyScanOutcome'))

  it('drops it before it is scored or stored', () => {
    const skip = scan.indexOf('isOwnMail(message.from')
    expect(skip).toBeGreaterThan(-1)
    expect(skip).toBeLessThan(scan.indexOf('matchReply('))
    expect(skip).toBeLessThan(scan.indexOf('db.insert(gigReplies)'))
  })

  it('removes the rows an earlier scan filed, and leaves the ones somebody resolved', () => {
    // The query no longer returns this mail, so the clear-on-no-match branch
    // can never reach a row it had already filed.
    expect(scan).toMatch(/delete\(gigReplies\)[\s\S]*inArray\(gigReplies\.fromAddress, senders\)[\s\S]*isNull\(gigReplies\.resolution\)/)
  })

  it('reads the digest sender setting as well as the fixed pair', () => {
    expect(scan).toContain('DIGEST_KEYS.sender')
    expect(scan).toContain('AUTH_EMAIL_SENDER')
  })
})
