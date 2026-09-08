import { describe, it, expect } from 'vitest'
import {
  matchName,
  matchReply,
  initialisms,
  significantWords,
  domainOf,
  domainRoot,
  isRelayDomain,
  isConsumerDomain,
  matchConfidence,
  type MatchableGig,
  type ReplyMessage,
} from '../shared/replyMatch'

/**
 * The eight real reply/festival pairs from the mailbox, because the rule this
 * phase was planned around — match on the organiser's domain — holds for
 * exactly one of them. These fixtures are the argument for matching on the
 * name instead, kept as a test so the argument cannot quietly stop being true.
 */
const REAL: Array<{ festival: string; sender: string; subject: string; body: string }> = [
  {
    festival: 'Highlands Music Festival',
    sender: 'noreply@highlandsmusicfestival.ca',
    subject: 'Highlands Music Festival 2026 Artist Application Update',
    body: 'Thank you so much for submitting an artist application for Highlands Music Festival 2026.',
  },
  {
    festival: 'LieLow Music Fest',
    sender: 'lielowmusicfest@gmail.com',
    subject: 'Re: Form Submission - New Form',
    body: 'Thank you so much for sending your music our way and thinking of LieLow',
  },
  {
    festival: 'Festival du Voyageur',
    sender: 'jdesaulniers@heho.ca',
    subject: 'RE: New artist submission by: Doug McArthur',
    body: 'Wondering if you are available to do an acoustic set for FDV? Julien Desaulniers, Artistic Director, Festival du Voyageur Inc.',
  },
  {
    festival: 'Folk On The Rocks',
    sender: 'no-reply@wufoo.com',
    subject: 'FOTR 2026 Artist Submission Form',
    body: 'Thank you so much for applying to play Folk On The Rocks 2026!',
  },
  {
    festival: 'Road to BreakOut West Showcase',
    sender: 'andrea@manitobamusic.com',
    subject: 'Road to BOW showcase application',
    body: "Thank you so much for applying for Manitoba Music's Road to BreakOut West Showcase.",
  },
  {
    festival: 'Manitoba Showcase',
    sender: 'do-not-reply@iwanttoshowcase.ca',
    subject: 'Application Payment Confirmed for Doug McArthur (Manitoba Showcase 2026)',
    body: 'Please do not reply. This is an automated message.',
  },
  {
    festival: 'JIMWEEK',
    sender: 'noreply@jotform.com',
    subject: 'We have received your response for JIMWEEK 2026 Music + Film/Video Submission Form',
    body: 'JIMWEEK 2026 Music + Film/Video Submission Form',
  },
  {
    festival: 'Manitoba Arts Network Showcase',
    sender: 'performingarts@mbartsnet.ca',
    subject: 'Manitoba Arts Network Showcase Application',
    body: 'Thank you for applying to I Want to Showcase for the Manitoba Arts Network 2026 Showcase conference.',
  },
]

describe('the domain is not the test', () => {
  it('only one real reply in eight comes from the festival’s own domain', () => {
    // The count is the point. This is the number the planned rule would have
    // matched on, and it is why the name carries more weight than the domain.
    const own = REAL.filter((r) => {
      const d = domainRoot(domainOf(r.sender))
      return !isRelayDomain(d) && !isConsumerDomain(d) && d.includes('highlands')
    })
    expect(own).toHaveLength(1)
  })

  it('recognises the relays and the consumer mail they arrive from', () => {
    expect(isRelayDomain('wufoo.com')).toBe(true)
    expect(isRelayDomain('jotform.com')).toBe(true)
    expect(isRelayDomain('squarespace.info')).toBe(true)
    expect(isConsumerDomain('gmail.com')).toBe(true)
    expect(isRelayDomain('highlandsmusicfestival.ca')).toBe(false)
  })

  it('reads a domain root through a subdomain and a two-part suffix', () => {
    expect(domainRoot(domainOf('a@mail.highlandsmusicfestival.ca'))).toBe('highlandsmusicfestival.ca')
    expect(domainRoot('festival.voyageur.mb.ca')).toBe('voyageur.mb.ca')
  })
})

describe('the name is the test', () => {
  it('finds every one of the eight by name', () => {
    const missed = REAL.filter((r) => matchName(r.festival, r) === null)
    expect(missed.map((m) => m.festival)).toEqual([])
  })

  it('matches a full name across the stopwords inside it', () => {
    // "folk" and "rocks" are the significant words, and "On The" sits between
    // them — which a pattern built from significant words alone would miss.
    const m = matchName('Folk On The Rocks', {
      subject: '',
      body: 'applying to play Folk On The Rocks 2026!',
    })
    expect(m?.kind).toBe('full')
  })

  it('prefers the subject, where a name is deliberate', () => {
    const m = matchName('Highlands Music Festival', REAL[0])
    expect(m?.where).toBe('subject')
  })

  it('reads an abbreviation as a name', () => {
    expect(initialisms('Festival du Voyageur')).toContain('FDV')
    expect(initialisms('Folk On The Rocks')).toContain('FOTR')
    // From a run inside the name, not the whole of it: nobody writes RTBOWS.
    expect(initialisms('Road to BreakOut West Showcase')).toContain('BOW')
  })

  it('will not generate a two-letter abbreviation', () => {
    expect(initialisms('The Festival')).toEqual([])
  })

  it('drops the words every event shares', () => {
    expect(significantWords('The Highlands Music Festival 2026')).toEqual(['highlands'])
  })
})

// ── Whole-message matching ────────────────────────────────────────────────────

const message = (over: Partial<ReplyMessage> = {}): ReplyMessage => ({
  messageId: 'm1',
  threadId: 't1',
  from: 'noreply@highlandsmusicfestival.ca',
  subject: 'Highlands Music Festival 2026 Artist Application Update',
  body: 'Thank you so much for submitting an artist application for Highlands Music Festival 2026.',
  receivedAt: '2026-04-13T18:37:21Z',
  ...over,
})

const gig = (over: Partial<MatchableGig> = {}): MatchableGig => ({
  id: 1,
  name: 'Highlands Music Festival',
  organizer: null,
  status: 'submitted',
  url: 'https://highlandsmusicfestival.ca/apply',
  submittedAt: '2026-02-01T00:00:00Z',
  ...over,
})

describe('matching a message to a gig', () => {
  it('scores name and domain together when both agree', () => {
    const { candidates } = matchReply(message(), [gig()])
    expect(candidates).toHaveLength(1)
    expect(candidates[0].signals.map((s) => s.id).sort()).toEqual(['domain', 'name'])
    expect(matchConfidence(candidates[0])).toBe('likely')
  })

  it('still matches when the sender is a stranger’s gmail', () => {
    const { candidates } = matchReply(
      message({
        from: 'lielowmusicfest@gmail.com',
        subject: 'Re: Form Submission - New Form',
        body: 'thinking of LieLow',
      }),
      [gig({ name: 'LieLow Music Fest', url: 'https://lielow.ca' })],
    )
    expect(candidates).toHaveLength(1)
    expect(candidates[0].signals.map((s) => s.id)).toEqual(['name'])
  })

  it('refuses a message that predates the application', () => {
    const { candidates } = matchReply(
      message({ receivedAt: '2026-01-01T00:00:00Z' }),
      [gig({ submittedAt: '2026-02-01T00:00:00Z' })],
    )
    expect(candidates).toEqual([])
  })

  it('does not gate on a date it does not have', () => {
    // `submitted_at` is null on every row that reached the phase before
    // migration 0010. Guessing from `updated_at` would throw away real matches.
    const { candidates } = matchReply(
      message({ receivedAt: '2020-01-01T00:00:00Z' }),
      [gig({ submittedAt: null })],
    )
    expect(candidates).toHaveLength(1)
  })

  it('ignores gigs nothing was ever sent for', () => {
    expect(matchReply(message(), [gig({ status: 'discovered' })]).candidates).toEqual([])
    expect(matchReply(message(), [gig({ status: 'passed' })]).candidates).toEqual([])
  })

  it('reads a legacy status through the vocabulary', () => {
    // The research agents still POST `approved`. A second copy of that mapping
    // here is how the two would drift.
    expect(matchReply(message(), [gig({ status: 'approved' })]).candidates).toHaveLength(1)
  })
})

describe('learned bindings', () => {
  const stranger = message({ from: 'jdesaulniers@heho.ca', subject: 'RE: contract', body: 'See attached.' })
  const voyageur = gig({ id: 7, name: 'Festival du Voyageur', url: 'https://festivalvoyageur.mb.ca' })

  it('match nothing on their own — an unrelated domain and no name', () => {
    expect(matchReply(stranger, [voyageur]).candidates).toEqual([])
  })

  it('are decisive once the address is confirmed', () => {
    const { candidates } = matchReply(stranger, [voyageur], [
      { gigId: 7, kind: 'address', value: 'jdesaulniers@heho.ca' },
    ])
    expect(candidates[0].bound).toBe(true)
    expect(matchConfidence(candidates[0])).toBe('certain')
  })

  it('carry the rest of the thread with them', () => {
    const { candidates } = matchReply(
      message({ from: 'someone-else@heho.ca', threadId: 'tX', subject: 'Re:', body: 'ok' }),
      [voyageur],
      [{ gigId: 7, kind: 'thread', value: 'tX' }],
    )
    expect(candidates[0].bound).toBe(true)
  })

  it('beat a name match on another gig, rather than tying with it', () => {
    const other = gig({ id: 9, name: 'Highlands Music Festival' })
    const { candidates, ambiguous } = matchReply(
      message({ from: 'jdesaulniers@heho.ca', threadId: 'tX' }),
      [voyageur, other],
      [{ gigId: 7, kind: 'thread', value: 'tX' }],
    )
    expect(candidates[0].gigId).toBe(7)
    expect(ambiguous).toBe(false)
  })
})

describe('when two gigs look equally likely', () => {
  it('says so rather than choosing', () => {
    const { candidates, ambiguous } = matchReply(
      message({ subject: 'Winter Roots Festival application', body: 'about the Winter Roots Festival' }),
      [
        gig({ id: 1, name: 'Winter Roots Festival', url: null }),
        gig({ id: 2, name: 'Winter Roots Festival', url: null }),
      ],
    )
    expect(candidates).toHaveLength(2)
    expect(ambiguous).toBe(true)
  })
})
