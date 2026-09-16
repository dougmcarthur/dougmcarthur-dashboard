import { describe, it, expect } from 'vitest'
import { rarityOf, rarityLookup, rarestWord, weigh, type RarityIndex } from '../shared/termRarity'
import {
  MATCH_THRESHOLD,
  matchReply,
  matchStrength,
  type MatchableGig,
  type ReplyMessage,
} from '../shared/replyMatch'

const gigs = [
  { id: 10, name: 'Sofar Sounds Winnipeg — Artist Application', status: 'shortlisted', url: null, organizer: null, submittedAt: '2026-08-01' },
] as unknown as MatchableGig[]

/** What Gmail would report for a musician living in Winnipeg. */
const MEASURED: RarityIndex = { corpusSize: 12000, counts: { winnipeg: 2400, sofar: 9, sounds: 300 } }

const message = (subject: string, body: string) =>
  ({ id: 'm', threadId: 't', subject, body, from: 'x@example.com', date: '2026-09-16', receivedAt: '2026-09-16T00:00:00Z' }) as unknown as ReplyMessage

describe('what a word is worth in the mailbox it will be searched in', () => {
  it('bands a word by its share, not its length', () => {
    expect(rarityOf(9, 12000).band).toBe('rare')
    expect(rarityOf(100, 12000).band).toBe('uncommon')
    expect(rarityOf(500, 12000).band).toBe('common')
    expect(rarityOf(2400, 12000).band).toBe('everywhere')
  })

  it('gives an unmeasured word its full weight rather than guessing it is common', () => {
    // A missing input is never a guess. Treating unmeasured as common would
    // make the matcher quietly worse whenever Gmail was unreachable.
    const r = rarityOf(null, null)
    expect(r.band).toBe('unknown')
    expect(weigh(26, r)).toBe(26)
  })

  it('survives a corpus size of zero rather than dividing by it', () => {
    expect(rarityOf(5, 0).band).toBe('unknown')
  })

  it('picks the rarest word, and falls back to the longest when nothing is measured', () => {
    const measured = rarityLookup(MEASURED)
    expect(rarestWord(['winnipeg', 'sofar', 'sounds'], measured)).toBe('sofar')

    const unmeasured = rarityLookup(null)
    // Length decides, which is exactly what the matcher did before.
    expect(rarestWord(['sofar', 'winnipeg'], unmeasured)).toBe('winnipeg')
  })
})

describe('the measured matcher, against the mail that flooded the queue', () => {
  const junk = [
    ['a pizza receipt', 'Your order is confirmed', 'Thanks for ordering from our Winnipeg location.'],
    ['a utility bill', 'Your statement is ready', 'Manitoba Hydro, Winnipeg MB. Amount due $84.20.'],
    ['a city newsletter', 'This week', 'Events around Winnipeg this weekend.'],
  ] as const

  it('showed all of it before rarity was measured', () => {
    // The state the screenshot was in. Kept as a test so the fix cannot be
    // mistaken for something that was always true.
    for (const [label, subject, body] of junk) {
      const top = matchReply(message(subject, body), gigs, [], null).candidates[0]
      expect(top, label).toBeTruthy()
      expect(top.score, label).toBe(MATCH_THRESHOLD)
    }
  })

  it('shows none of it once the words are measured', () => {
    for (const [label, subject, body] of junk) {
      const r = matchReply(message(subject, body), gigs, [], MEASURED)
      expect(r.candidates, label).toEqual([])
    }
  })

  it('still finds the genuine reply, on the rare word instead of the city', () => {
    const top = matchReply(
      message('Re: your submission', 'Thanks for applying to Sofar Sounds Winnipeg.'),
      gigs, [], MEASURED,
    ).candidates[0]
    expect(top).toBeTruthy()
    expect(top.signals[0].detail).toMatch(/sofar/i)
    expect(top.signals[0].detail).not.toMatch(/winnipeg/i)
  })
})

describe('the invariant stage 4 turned out to be', () => {
  /**
   * The proposal said "raise the threshold above any single body-only signal".
   * Once rarity existed that became wrong: it would drop a genuine reply whose
   * only evidence is a rare word, which is a real lead. What actually has to
   * hold is narrower — a word that is common in this mailbox must never reach
   * the bar on its own, however long it is.
   */
  it('never lets a common word carry a match by itself', () => {
    for (const df of [500, 1200, 2400, 6000]) {
      const index: RarityIndex = { corpusSize: 12000, counts: { winnipeg: df, sofar: 9, sounds: 300 } }
      const r = matchReply(message('hello', 'Something about Winnipeg today.'), gigs, [], index)
      expect(r.candidates, `df=${df}`).toEqual([])
    }
  })

  it('lets a rare word carry a lead, and calls it a lead rather than a match', () => {
    const top = matchReply(message('hello', 'A note about Sofar.'), gigs, [], MEASURED).candidates[0]
    expect(top).toBeTruthy()
    // One mention, no domain, no thread. Worth showing, not worth trusting.
    expect(matchStrength(top)).toBe('weak')
  })

  it('leaves a full-name match alone, however ordinary the words in it are', () => {
    // Weighing a whole name would punish a festival for being called something
    // plain, and a name written out in full is distinctive by construction.
    const top = matchReply(
      message('Sofar Sounds Winnipeg — Artist Application', 'See attached.'),
      gigs, [], MEASURED,
    ).candidates[0]
    expect(top.score).toBeGreaterThanOrEqual(50)
  })
})
