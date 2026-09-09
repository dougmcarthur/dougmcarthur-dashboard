import { describe, it, expect } from 'vitest'
import { recogniseAsks, composeReplyDraft } from '../shared/replyDraft'
import type { ArtistAsset } from '../shared/artistAssets'

function asset(o: Partial<ArtistAsset> & { questionKind: string; value: string }): ArtistAsset {
  return {
    id: 1, kind: 'fact', label: 'x', variant: null, charCount: o.value.length,
    credit: null, usageRights: null, reviewBy: null, source: null, notes: null,
    sortOrder: 0, archived: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01', ...o,
  }
}

const LIBRARY = [
  asset({ id: 1, kind: 'bio', questionKind: 'bio', label: 'Bio', value: 'Doug McArthur is a Winnipeg singer-songwriter.' }),
  asset({ id: 2, questionKind: 'set_length', label: 'Set length', value: '45 minutes, or 30 if that suits the slot better.' }),
  asset({ id: 3, questionKind: 'lineup', label: 'Line-up', value: 'Solo. Vocals and guitar, no band and no backing tracks.' }),
  asset({ id: 4, kind: 'link', questionKind: 'website', label: 'Website', value: 'https://dougmcarthur.net' }),
]

const draft = (body: string, assets: ArtistAsset[] = LIBRARY) =>
  composeReplyDraft({
    gig: { name: 'Folk On The Rocks', organizer: 'Andrea' },
    reply: { subject: 'Re: your application', fromName: 'Andrea', evidence: null },
    reading: recogniseAsks(body),
    assets,
  })

describe('recogniseAsks — what they asked for', () => {
  it('reads a request and names the thing asked for', () => {
    const { asks } = recogniseAsks('Could you please send a high-res press photo and your stage plot?')
    expect(asks.map((a) => a.id).sort()).toEqual(['photo', 'stage_plot'])
  })

  it('keeps the sentence it read each ask from', () => {
    const [ask] = recogniseAsks('Thanks for applying. We need your set length before we can schedule.').asks
    expect(ask.id).toBe('set_length')
    // Same rule the deciding sentence follows: a reading you cannot check is
    // a reading you should not trust.
    expect(ask.evidence).toContain('set length')
  })

  it('ignores a sentence that mentions the thing without asking for it', () => {
    // The difference between "here is the stage plot" and "send the stage
    // plot" is the whole feature.
    expect(recogniseAsks('Your stage plot looked fine, thanks.').asks).toEqual([])
    expect(recogniseAsks('We have attached a press photo of last year.').asks).toEqual([])
  })

  it('reads the whole body, not just the top post', () => {
    // Unlike classification. An ask can sit four paragraphs down, and the
    // organiser who buries it still expects an answer.
    const body = [
      'Hi Doug,',
      'Congratulations, we would love to have you.',
      'A few logistics before we confirm.',
      'Could you confirm your line-up and set length?',
    ].join('\n\n')
    expect(recogniseAsks(body).asks.map((a) => a.id).sort()).toEqual(['lineup', 'set_length'])
  })

  it('names a request it could not place rather than dropping it', () => {
    const { asks, unrecognised } = recogniseAsks('Could you send your SOCAN membership number?')
    expect(asks).toEqual([])
    expect(unrecognised).toHaveLength(1)
    expect(unrecognised[0]).toContain('SOCAN')
  })

  it('does not report the same ask twice when they ask twice', () => {
    const body = 'Please send a press photo. Also, could you provide a press photo in colour?'
    expect(recogniseAsks(body).asks.map((a) => a.id)).toEqual(['photo'])
  })
})

describe('composeReplyDraft — answering from the library', () => {
  it('fills in what is on file and says which', () => {
    const d = draft('Could you confirm your set length and line-up?')
    expect(d.answered.sort()).toEqual(['your line-up', 'your set length'])
    expect(d.missing).toEqual([])
    expect(d.body).toContain('45 minutes')
    expect(d.body).toContain('no backing tracks')
  })

  it('marks what nothing on file answers instead of inventing it', () => {
    const d = draft('Could you send your fee expectation?', [])
    expect(d.missing).toEqual(['your fee'])
    expect(d.body).toContain('[fee]')
    expect(d.gaps.some((g) => g.marker === '[fee]')).toBe(true)
  })

  it('lists a file to attach and never claims it is attached', () => {
    const d = draft('Please send a high-res press photo.')
    expect(d.attachments).toEqual(['a press photo'])
    // Not counted as answered: a photo is a thing you go and find.
    expect(d.answered).toEqual([])
    expect(d.body).toMatch(/nothing is attached to a draft/)
  })

  it('says so plainly when it recognised nothing', () => {
    const d = draft('Could you send your SOCAN membership number?')
    expect(d.asks).toEqual([])
    expect(d.body).toContain('[what they asked for]')
    expect(d.unrecognised[0]).toContain('SOCAN')
  })

  it('always leaves the sign-off to you', () => {
    const d = draft('Could you confirm your set length?')
    expect(d.gaps.some((g) => g.marker === '[sign off]')).toBe(true)
    expect(d.body.trimEnd().endsWith('[sign off]')).toBe(true)
  })

  it('never produces a body with no gap at all', () => {
    // A draft that reads as finished is the one that gets sent unfinished.
    for (const body of [
      'Could you confirm your set length and line-up?',
      'Please send a press photo.',
      'Could you send your SOCAN number?',
    ]) {
      expect(draft(body).gaps.length, body).toBeGreaterThan(0)
    }
  })

  it('collapses a thread of Re: into one', () => {
    const d = composeReplyDraft({
      gig: null,
      reply: { subject: 'Re: Re: RE: Submission', fromName: null, evidence: null },
      reading: recogniseAsks('Could you confirm your set length?'),
      assets: LIBRARY,
    })
    expect(d.subject).toBe('Re: Submission')
  })

  it('writes a subject when the mail had none', () => {
    const d = composeReplyDraft({
      gig: { name: 'Folk On The Rocks', organizer: null },
      reply: { subject: null, fromName: null, evidence: null },
      reading: recogniseAsks('Please send a bio.'),
      assets: LIBRARY,
    })
    expect(d.subject).toBe('Re: Folk On The Rocks')
  })

  it('ignores an archived asset, so an entry you retired is not sent', () => {
    const retired = [asset({ id: 9, questionKind: 'set_length', value: '20 minutes', archived: 1 })]
    const d = draft('Could you confirm your set length?', retired)
    expect(d.missing).toEqual(['your set length'])
    expect(d.body).not.toContain('20 minutes')
  })

  it('is not approximate unless it was told so', () => {
    expect(draft('Please send a bio.').approximate).toBe(false)
    const reread = composeReplyDraft({
      gig: null,
      reply: { subject: 'x', fromName: null, evidence: null },
      reading: recogniseAsks('Please send a bio.'),
      assets: LIBRARY,
      approximate: true,
    })
    expect(reread.approximate).toBe(true)
  })
})
