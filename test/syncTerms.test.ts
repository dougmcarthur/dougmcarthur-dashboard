import { describe, it, expect } from 'vitest'
import {
  EMPTY_TERMS,
  NO_SITE,
  UNREACHABLE,
  bulkSkipReason,
  foldFinding,
  normaliseWebsite,
  pitchGate,
  readSubmissionPolicy,
  startingTerms,
  termsDue,
  termsOf,
  termsSentence,
  termsState,
} from '../shared/syncTerms'

/**
 * Whether a sync target takes pitches from people it does not know.
 *
 * The case behind all of it: a target was filed as ready to pitch, with a note
 * calling its submission route "confirmed and simple", and its own About page
 * said "NO unsolicited material please." Every phrase below that should close a
 * target is a way a company says that, and every one that should not is a way the
 * agent's own notes, or a page, mention the subject without refusing anything.
 */

const TODAY = '2026-10-07'

describe('reading a refusal', () => {
  it.each([
    'NO unsolicited material           please.',
    'We do not accept unsolicited submissions.',
    "We don't take unsolicited demos.",
    'We cannot accept unsolicited material.',
    'We no longer accept unsolicited submissions.',
    'Unsolicited submissions will not be reviewed.',
    'All unsolicited material will be deleted unread.',
    'Submissions are by referral only.',
    'We work by invitation only.',
    'We only accept music from artists referred by someone we know.',
    'We only work with artists represented by an agent or attorney.',
    'Submissions are accepted through an attorney only.',
    'We are not currently accepting submissions.',
    'We are no longer accepting new artists.',
    'Our submission window is closed.',
    'Please do not send us music or links.',
    'We are not looking for new artists at this time.',
    'No demos please.',
    'Their site says they do not accept unsolicited submissions.',
  ])('closes on "%s"', (sentence) => {
    expect(readSubmissionPolicy(sentence)?.policy).toBe('closed')
  })

  it('quotes the sentence with the page markup\'s whitespace collapsed', () => {
    const reading = readSubmissionPolicy('ABOUT\nWe license to film.\nNO unsolicited material           please.\nAVAILABLE:')
    expect(reading).toEqual({ policy: 'closed', quote: 'NO unsolicited material please.' })
  })

  it('finds the refusal in the middle of a long page', () => {
    const page = [
      'Welcome to our site.',
      'We license to film, television and commercials.',
      'NO unsolicited material please.',
      'Contact: Beth, 555-0100.',
    ].join('\n')
    expect(readSubmissionPolicy(page)?.quote).toBe('NO unsolicited material please.')
  })

  it('keeps a long sentence to a quote that fits a card', () => {
    const long = `We do not accept unsolicited submissions ${'of any kind and '.repeat(60)}ever.`
    const quote = readSubmissionPolicy(long)?.quote ?? ''
    expect(quote.length).toBeLessThanOrEqual(301)
    expect(quote.endsWith('…')).toBe(true)
  })
})

describe('not reading a refusal where there is none', () => {
  it.each([
    // The agent's own notes, doubting. This one is a real line from the run log.
    'Could not confirm they take unsolicited pitches.',
    'Could NOT confirm the split or fee they take.',
    'Unclear whether they accept unsolicited submissions.',
    'Does not say whether they take unsolicited demos.',
    'Check if they accept unsolicited material.',
    'Find out if unsolicited pitches are welcome.',
    // A question on a FAQ is not the answer.
    'Do you accept unsolicited submissions?',
    // Mentioning the subject without refusing anything.
    'Music supervisors who take unsolicited submissions are rare.',
    'We license to film, television, commercial and non-broadcast projects.',
    'Strong, verifiable placement track record via music director.',
    'Submission route is confirmed and simple: email them directly, no portal.',
  ])('does not close on "%s"', (sentence) => {
    expect(readSubmissionPolicy(sentence)).toBeNull()
  })
})

describe('reading an invitation', () => {
  it.each([
    'We welcome unsolicited submissions from independent artists.',
    'We are currently accepting submissions.',
    'We are open to submissions all year.',
    'Submit your music to our team.',
    'Unsolicited submissions are welcome.',
  ])('opens on "%s"', (sentence) => {
    expect(readSubmissionPolicy(sentence)?.policy).toBe('open')
  })

  it('does not call a conditional invitation open', () => {
    expect(readSubmissionPolicy('We only accept submissions from our members.')).toBeNull()
    expect(readSubmissionPolicy('We accept demos unless you are already signed.')).toBeNull()
  })

  it('lets a refusal anywhere on the page beat an invitation earlier on it', () => {
    const page = 'Submit your music today!\nNo unsolicited material please.'
    expect(readSubmissionPolicy(page)?.policy).toBe('closed')
  })

  it('reads only refusals from text that is somebody\'s claim about a target', () => {
    expect(readSubmissionPolicy('They accept unsolicited submissions by email.', { only: 'closed' })).toBeNull()
    expect(readSubmissionPolicy('They do not accept unsolicited submissions.', { only: 'closed' })?.policy).toBe('closed')
  })
})

describe('where a target\'s terms stand', () => {
  const read = { policyCheckedAt: '2026-10-01T00:00:00.000Z' }

  it('is unchecked until somebody has looked, and silent once they have and found nothing', () => {
    expect(termsState({})).toBe('unchecked')
    expect(termsState(read)).toBe('silent')
  })

  it('is closed on a refusal and open on an invitation', () => {
    expect(termsState({ ...read, submissionPolicy: 'closed' })).toBe('closed')
    expect(termsState({ ...read, submissionPolicy: 'open' })).toBe('open')
  })

  it('reads an override only against a refusal', () => {
    const overridden = { policyOverriddenAt: '2026-10-07T12:00:00.000Z' }
    expect(termsState({ ...read, ...overridden, submissionPolicy: 'closed' })).toBe('overridden')
    // An override on a row that is not closed has nothing to override.
    expect(termsState({ ...read, ...overridden, submissionPolicy: 'open' })).toBe('open')
    expect(termsState({ ...read, ...overridden })).toBe('silent')
  })

  it('blocks a send on a refusal and on nothing else', () => {
    expect(pitchGate({ submissionPolicy: 'closed' }).blocked).toBe(true)
    expect(pitchGate({ submissionPolicy: 'closed', policyOverriddenAt: '2026-10-07' }).blocked).toBe(false)
    expect(pitchGate({}).blocked).toBe(false)
    expect(pitchGate(read).blocked).toBe(false)
    expect(pitchGate({ submissionPolicy: 'open' }).blocked).toBe(false)
  })

  it('is stricter for a bulk action, which also holds back what nobody has checked', () => {
    expect(bulkSkipReason({ submissionPolicy: 'closed' })).toBe('says no unsolicited pitches')
    expect(bulkSkipReason({})).toBe('terms not checked yet')
    expect(bulkSkipReason(read)).toBeNull()
    expect(bulkSkipReason({ submissionPolicy: 'open' })).toBeNull()
    expect(bulkSkipReason({ submissionPolicy: 'closed', policyOverriddenAt: '2026-10-07' })).toBeNull()
  })

  it('never describes silence as permission', () => {
    // The whole reason there are five states and not three.
    for (const row of [read, {}]) {
      const view = termsOf(row)
      expect(view.summary).toMatch(/not permission|Check before you send/)
      expect(view.label).not.toMatch(/ok|fine|clear|safe|takes/i)
    }
    expect(termsSentence(read)).toMatch(/not permission/)
  })

  it('carries the quote and the page a refusal was read on', () => {
    const view = termsOf({
      submissionPolicy: 'closed',
      policyEvidence: 'NO unsolicited material please.',
      policyUrl: 'http://friends.example/about.html',
      policyCheckedAt: '2026-10-07T00:00:00.000Z',
    })
    expect(view).toMatchObject({
      state: 'closed',
      label: 'No unsolicited pitches',
      quote: 'NO unsolicited material please.',
      url: 'http://friends.example/about.html',
    })
  })

  it('writes no em dash into anything a person reads', () => {
    const states = [{}, { policyCheckedAt: 'x' }, { submissionPolicy: 'open' }, { submissionPolicy: 'closed' }, { submissionPolicy: 'closed', policyOverriddenAt: 'x' }]
    for (const row of states) {
      const view = termsOf(row)
      expect(`${view.label} ${view.summary} ${termsSentence(row)}`).not.toContain('—')
    }
  })
})

describe('a site nobody could read', () => {
  const looked = { policyCheckedAt: '2026-10-01T00:00:00.000Z' }
  const noSite = { ...looked, policyEvidence: `${NO_SITE}: none is on file. Add their website address to check it.` }
  const down = { ...looked, policyEvidence: `${UNREACHABLE} friends.example. It will be tried again in a few days.` }

  it('is its own state, so a card never says a site was read that never was', () => {
    expect(termsState(looked)).toBe('silent')
    expect(termsState(noSite)).toBe('unreadable')
    expect(termsState(down)).toBe('unreadable')
  })

  it('says which it was, and what to do about it', () => {
    expect(termsOf(noSite)).toMatchObject({ label: 'No website to check' })
    expect(termsOf(noSite).summary).toMatch(/Add their website/)
    expect(termsOf(down)).toMatchObject({ label: 'Site did not open' })
    expect(termsOf(down).summary).toMatch(/try again/)
    for (const row of [noSite, down]) {
      expect(termsOf(row).summary).not.toMatch(/Nothing on their site/)
      expect(termsOf(row).summary).not.toContain('—')
    }
  })

  it('is held back from a bulk draft like a site nobody looked at, and does not block a single pitch', () => {
    expect(bulkSkipReason(noSite)).toBe('terms not checked yet')
    expect(bulkSkipReason(down)).toBe('terms not checked yet')
    expect(pitchGate(noSite).blocked).toBe(false)
    expect(termsSentence(down)).toMatch(/Nobody could read/)
  })

  it('does not outrank a verdict the row already has', () => {
    expect(termsState({ ...down, submissionPolicy: 'open' })).toBe('open')
    expect(termsState({ ...down, submissionPolicy: 'closed' })).toBe('closed')
  })
})

describe('writing a finding down', () => {
  const NOW = '2026-10-07T09:00:00.000Z'
  const closed = { policy: 'closed' as const, quote: 'NO unsolicited material please.', url: 'http://friends.example/about.html', note: '' }
  const nothing = { policy: null, quote: null, url: 'https://friends.example/', note: 'Read 6 pages on friends.example. None says whether they take pitches from people they do not know.' }

  it('closes a target that was open, since automation only moves toward caution', () => {
    const open = { ...EMPTY_TERMS, submissionPolicy: 'open', policyEvidence: 'We welcome submissions.', policyCheckedAt: 'then' }
    const next = foldFinding(open, closed, NOW)
    expect(next).toMatchObject({ submissionPolicy: 'closed', policyEvidence: closed.quote, policyUrl: closed.url, policyCheckedAt: NOW })
  })

  it('does not let an invitation outrank a refusal', () => {
    const refused = { ...EMPTY_TERMS, submissionPolicy: 'closed', policyEvidence: 'No demos please.' }
    const next = foldFinding(refused, { policy: 'open', quote: 'Submit your music.', url: 'https://x.example/', note: '' }, NOW)
    expect(next.submissionPolicy).toBe('closed')
    expect(next.policyEvidence).toBe('No demos please.')
  })

  it('fills an empty policy from an invitation', () => {
    const next = foldFinding(EMPTY_TERMS, { policy: 'open', quote: 'We welcome demos.', url: 'https://x.example/submit', note: '' }, NOW)
    expect(next).toMatchObject({ submissionPolicy: 'open', policyEvidence: 'We welcome demos.' })
  })

  it('records what was read when nothing was found, and does not invent a verdict', () => {
    const next = foldFinding(EMPTY_TERMS, nothing, NOW)
    expect(next.submissionPolicy).toBeNull()
    expect(next.policyEvidence).toContain('Read 6 pages')
    expect(termsState(next)).toBe('silent')
  })

  it('keeps an existing verdict and its quote when a later read finds nothing', () => {
    const open = { ...EMPTY_TERMS, submissionPolicy: 'open', policyEvidence: 'We welcome submissions.' }
    const next = foldFinding(open, nothing, NOW)
    expect(next.submissionPolicy).toBe('open')
    expect(next.policyEvidence).toBe('We welcome submissions.')
    expect(next.policyCheckedAt).toBe(NOW)
  })

  it('never touches the artist\'s override', () => {
    const decided = { ...EMPTY_TERMS, submissionPolicy: 'closed', policyEvidence: 'No demos.', policyOverriddenAt: 'earlier' }
    expect(foldFinding(decided, closed, NOW).policyOverriddenAt).toBe('earlier')
    expect(foldFinding(decided, nothing, NOW).policyOverriddenAt).toBe('earlier')
  })
})

describe('what a new row starts with', () => {
  const NOW = '2026-10-07T09:00:00.000Z'
  const ok = (r: ReturnType<typeof startingTerms>) => {
    if (!r.ok) throw new Error(r.error)
    return r.columns
  }

  it('refuses "open" without the sentence that says so, and says what to do instead', () => {
    const result = startingTerms({ submissionPolicy: 'open' }, null, NOW)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toMatch(/policyQuote/)
    expect(result.ok === false && result.error).toMatch(/unknown/)
  })

  it('stores an invitation with its quote and page', () => {
    const c = ok(startingTerms({ submissionPolicy: 'open', policyQuote: 'We welcome demos.', policyUrl: 'https://x.example/submit' }, null, NOW))
    expect(c).toMatchObject({ submissionPolicy: 'open', policyEvidence: 'We welcome demos.', policyUrl: 'https://x.example/submit', policyCheckedAt: NOW })
  })

  it('accepts a refusal without a quote, because the safe answer is not worth losing', () => {
    const c = ok(startingTerms({ submissionPolicy: 'closed' }, null, NOW))
    expect(c.submissionPolicy).toBe('closed')
    expect(c.policyEvidence).toMatch(/research agent/)
  })

  it('records "unknown" as looked at, and silence as not looked at', () => {
    expect(termsState(ok(startingTerms({ submissionPolicy: 'unknown' }, null, NOW)))).toBe('silent')
    expect(termsState(ok(startingTerms({}, null, NOW)))).toBe('unchecked')
  })

  it('closes a target whose own notes say it refuses, whatever the field says', () => {
    const c = ok(
      startingTerms(
        { submissionPolicy: 'open', policyQuote: 'Contact us.' },
        'LA-based library. They do not accept unsolicited submissions. Route is email.',
        NOW,
      ),
    )
    expect(c.submissionPolicy).toBe('closed')
    expect(c.policyEvidence).toBe('They do not accept unsolicited submissions.')
  })

  it('does not open a target because its notes say so', () => {
    const c = ok(startingTerms({}, 'They accept unsolicited submissions by email.', NOW))
    expect(c.submissionPolicy).toBeNull()
  })

  it('leaves the notes alone when they only doubt', () => {
    const c = ok(startingTerms({ submissionPolicy: 'unknown' }, 'Could not confirm they take unsolicited pitches.', NOW))
    expect(c.submissionPolicy).toBeNull()
  })
})

describe('which targets the nightly pass reads', () => {
  const row = (over: Record<string, unknown>) => ({ status: 'draft_ready', ...over }) as Parameters<typeof termsDue>[0]

  it('reads anything nobody has read, unless it was written off', () => {
    expect(termsDue(row({}), TODAY)).toBe('never')
    expect(termsDue(row({ status: 'pitched' }), TODAY)).toBe('never')
    expect(termsDue(row({ status: 'archived' }), TODAY)).toBeNull()
    expect(termsDue(row({ status: 'declined' }), TODAY)).toBeNull()
  })

  it('reads a target still waiting to be pitched again after two months, and nothing else', () => {
    expect(termsDue(row({ policyCheckedAt: '2026-08-07T00:00:00Z' }), TODAY)).toBe('stale')
    expect(termsDue(row({ policyCheckedAt: '2026-08-09T00:00:00Z' }), TODAY)).toBeNull()
    expect(termsDue(row({ status: 'pitched', policyCheckedAt: '2026-01-01T00:00:00Z' }), TODAY)).toBeNull()
  })

  it('retries a site that could not be opened in days, not months', () => {
    const failed = { policyCheckedAt: '2026-10-03T00:00:00Z', policyEvidence: `${UNREACHABLE} friends.example. It will be tried again.` }
    expect(termsDue(row(failed), TODAY)).toBe('retry')
    expect(termsDue(row({ ...failed, policyCheckedAt: '2026-10-05T00:00:00Z' }), TODAY)).toBeNull()
  })
})

describe('a website address', () => {
  it('adds the scheme a person leaves off', () => {
    expect(normaliseWebsite('imaginaryfriends.com')).toBe('https://imaginaryfriends.com')
    expect(normaliseWebsite(' http://friends.example/about ')).toBe('http://friends.example/about')
  })

  it('refuses what is not a plain web address', () => {
    expect(normaliseWebsite('')).toBeNull()
    expect(normaliseWebsite('ftp://friends.example')).toBeNull()
    expect(normaliseWebsite('javascript:alert(1)')).toBeNull()
    expect(normaliseWebsite('localhost')).toBeNull()
  })
})
