import { describe, it, expect } from 'vitest'
import {
  buildApplication,
  materialsChecklist,
  normaliseAnswerState,
  normalisePrepStatus,
  stageAnswer,
  uploadKind,
  type ApplicationField,
} from '../shared/application'
import { composeApplicationEmail } from '../shared/applicationEmail'
import type { ArtistAsset } from '../shared/artistAssets'

// Dated against their own TODAY, never the real clock — a suite that passes
// today and fails tomorrow fails in CI on somebody else's change.
const TODAY = '2026-09-07'

let nextId = 1
function asset(over: Partial<ArtistAsset> = {}): ArtistAsset {
  const value = over.value !== undefined ? over.value : 'A bio, at some length.'
  return {
    id: nextId++,
    kind: 'bio',
    label: 'Bio',
    value,
    questionKind: 'bio',
    variant: null,
    credit: null,
    usageRights: null,
    reviewBy: '2027-06-01',
    source: null,
    notes: null,
    sortOrder: 0,
    archived: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
    // After the spread so an override of `value` still gets measured.
    charCount: over.charCount ?? (over.value ?? value)?.length ?? null,
  }
}

let nextFieldId = 1
function field(over: Partial<ApplicationField> = {}): ApplicationField {
  return {
    id: nextFieldId++,
    gigId: 1,
    fieldKey: `f${nextFieldId}`,
    label: 'Artist bio',
    fieldType: 'textarea',
    options: null,
    required: false,
    maxLength: null,
    helpText: null,
    position: 0,
    questionKind: 'bio',
    answer: null,
    answerAssetId: null,
    answerState: 'empty',
    updatedAt: '2026-09-01T00:00:00Z',
    ...over,
  }
}

const packet = (fields: ApplicationField[], assets: ArtistAsset[] = []) =>
  buildApplication({ gigId: 1, prepStatus: 'ready', fields, assets, today: TODAY })

describe('staging an answer', () => {
  it('picks the longest answer that fits the field, and calls it a suggestion', () => {
    const short = asset({ label: 'Short bio', value: 'x'.repeat(120) })
    const long = asset({ label: 'Long bio', value: 'x'.repeat(900) })

    const staged = stageAnswer(
      { label: 'Artist bio (max 300 characters)', fieldType: 'text', maxLength: 300 },
      [short, long],
    )

    expect(staged.questionKind).toBe('bio')
    expect(staged.answerAssetId).toBe(short.id)
    // Never `approved`. Nothing here knows whether the answer is right for
    // *this* application, and marking it approved would launder a guess into
    // a decision.
    expect(staged.answerState).toBe('suggested')
  })

  it('says nothing rather than guessing when the question matches no kind', () => {
    const staged = stageAnswer({ label: 'Preferred stage left or right?' }, [asset()])
    expect(staged).toEqual({
      questionKind: null,
      answer: null,
      answerAssetId: null,
      answerState: 'empty',
    })
  })

  it('records the kind but no answer when nothing on file answers it', () => {
    const staged = stageAnswer({ label: 'Spotify link' }, [asset()])
    expect(staged.questionKind).toBe('spotify')
    expect(staged.answer).toBeNull()
    expect(staged.answerState).toBe('empty')
  })

  it('never stages an answer into a file upload', () => {
    // classifyQuestion refuses file fields: the answer is a file, not a
    // sentence, and it belongs on the materials list instead.
    expect(stageAnswer({ label: 'Press photo', fieldType: 'file' }, [asset()]).questionKind).toBeNull()
  })
})

describe('an answer longer than the form allows', () => {
  const long = field({
    label: 'Short bio',
    maxLength: 150,
    answer: 'x'.repeat(400),
    answerState: 'approved',
    required: true,
  })

  it('is a blocking problem, not a nearly-right one', () => {
    const p = packet([long])
    const problems = p.fields[0].problems.map((x) => x.id)
    expect(problems).toContain('over_length')
    expect(p.fields[0].problems.find((x) => x.id === 'over_length')!.severity).toBe('danger')
    // Approved, answered, required — and still not ready, because the form
    // will truncate it silently on paste.
    expect(p.fields[0].ready).toBe(false)
    expect(p.readiness.sendable).toBe(false)
  })

  it('says so in one sentence, and pluralises it properly', () => {
    expect(packet([long]).warnings).toContain(
      'One answer is longer than the form allows and will be cut off.',
    )
    expect(packet([long, field({ ...long, id: 99, fieldKey: 'b' })]).warnings).toContain(
      '2 answers are longer than the form allows and will be cut off.',
    )
  })
})

describe('an answer nobody has read', () => {
  const bio = asset({ label: 'Bio', value: 'x'.repeat(200) })

  it('counts as answered but not as checked', () => {
    const p = packet(
      [field({ required: true, answer: bio.value, answerAssetId: bio.id, answerState: 'suggested' })],
      [bio],
    )
    expect(p.readiness.answered).toBe(1)
    expect(p.readiness.checked).toBe(0)
    expect(p.readiness.requiredAnswered).toBe(1)
    // The whole point of `answerState`: a required question with a suggestion
    // against it is not a finished application.
    expect(p.readiness.sendable).toBe(false)
    expect(p.warnings).toContain('One answer is a suggestion nobody has read.')
  })

  it('becomes ready once approved', () => {
    const p = packet(
      [field({ required: true, answer: bio.value, answerAssetId: bio.id, answerState: 'approved' })],
      [bio],
    )
    expect(p.readiness.checked).toBe(1)
    expect(p.readiness.sendable).toBe(true)
    expect(p.warnings).toEqual([])
  })
})

describe('answers written for another event', () => {
  it('are flagged while they are still suggestions', () => {
    const p = packet([
      field({
        label: 'Why do you want to play our festival?',
        questionKind: 'why_this_event',
        answer: 'Because the Winnipeg Folk Festival is where I first…',
        answerState: 'suggested',
      }),
    ])
    expect(p.fields[0].problems.map((x) => x.id)).toContain('retarget')
    expect(p.warnings).toContain('One answer was written for a different application.')
  })

  it('are not flagged once you have rewritten them', () => {
    const p = packet([
      field({
        questionKind: 'why_this_event',
        answer: 'Rewritten for this one.',
        answerState: 'edited',
      }),
    ])
    expect(p.fields[0].problems.map((x) => x.id)).not.toContain('retarget')
  })
})

describe('the asset an answer came from', () => {
  it('carries its staleness onto the field', () => {
    const stale = asset({ label: 'Old bio', value: 'x'.repeat(80), reviewBy: '2026-08-01' })
    const p = packet(
      [field({ answer: stale.value, answerAssetId: stale.id, answerState: 'approved' })],
      [stale],
    )
    const problem = p.fields[0].problems.find((x) => x.id === 'stale_source')
    expect(problem?.message).toContain('Old bio')
    expect(problem?.message).toContain('37 days ago')
  })

  it('carries what is broken about it, whatever the date says', () => {
    const uncredited = asset({
      kind: 'photo',
      label: 'Press shot',
      questionKind: 'epk',
      value: 'https://example.com/p.jpg',
      credit: null,
    })
    const p = packet(
      [field({ questionKind: 'epk', answer: uncredited.value, answerAssetId: uncredited.id, answerState: 'approved' })],
      [uncredited],
    )
    expect(p.fields[0].problems.map((x) => x.id)).toContain('broken_source')
  })

  it('offers the other assets answering the same question as alternatives', () => {
    const a = asset({ label: 'Short bio', value: 'x'.repeat(100) })
    const b = asset({ label: 'Long bio', value: 'x'.repeat(900) })
    const p = packet([field({ answer: a.value, answerAssetId: a.id, answerState: 'suggested' })], [a, b])
    expect(p.fields[0].alternatives.map((x) => x.label)).toEqual(['Long bio'])
  })
})

describe('the materials checklist', () => {
  const photoField = field({ label: 'Upload a press photo', fieldType: 'file', required: true })

  it('matches an upload to an asset kind rather than to a question', () => {
    expect(uploadKind('Upload a press photo')).toBe('photo')
    expect(uploadKind('Live performance video')).toBe('video')
    expect(uploadKind('Stage plot (PDF)')).toBe('document')
    expect(uploadKind('Anything else?')).toBeNull()
  })

  it('says what is on file, and what is not', () => {
    const photo = asset({ kind: 'photo', label: 'Press shot 2026', value: 'https://x/p.jpg', credit: 'A. Photographer' })
    const [item] = materialsChecklist([photoField], [photo], TODAY)
    expect(item.problem).toBeNull()
    expect(item.candidates).toHaveLength(1)

    const [empty] = materialsChecklist([photoField], [], TODAY)
    expect(empty.problem).toBe('Nothing of this kind is on file.')
  })

  it('reports a photo with no credit as unusable rather than as present', () => {
    const uncredited = asset({ kind: 'photo', label: 'Press shot', value: 'https://x/p.jpg', credit: null })
    const [item] = materialsChecklist([photoField], [uncredited], TODAY)
    expect(item.problem).toContain('credit')
  })

  it('names the entry that stays trustworthy longest', () => {
    const soon = asset({ kind: 'photo', label: 'Press shot 2023', value: 'https://x/a.jpg', credit: 'A. P.', reviewBy: '2026-11-01' })
    const later = asset({ kind: 'photo', label: 'Press shot 2026', value: 'https://x/b.jpg', credit: 'A. P.', reviewBy: '2028-02-01' })
    const [item] = materialsChecklist([photoField], [soon, later], TODAY)
    expect(item.candidates[0].label).toBe('Press shot 2026')
  })

  it('is still an application when every question is an upload', () => {
    const photo = asset({ kind: 'photo', label: 'Press shot', value: 'https://x/p.jpg', credit: 'A. P.' })
    const p = packet([photoField], [photo])
    expect(p.readiness.fields).toBe(0)
    expect(p.readiness.sendable).toBe(true)
  })

  it('keeps uploads out of the written answers, and out of sendable', () => {
    const p = packet([photoField], [])
    expect(p.readiness.fields).toBe(0)
    expect(p.readiness.uploads).toBe(1)
    expect(p.fields[0].ready).toBe(false)
    expect(p.readiness.sendable).toBe(false)
    expect(p.warnings).toContain('One thing on the materials list is missing or unusable.')
  })
})

describe('unanswered questions', () => {
  it('separates a required blank from one the database cannot know', () => {
    const p = packet([
      field({ required: true, label: 'Artist bio' }),
      field({ required: false, label: 'Do you need a hotel on the Sunday?', questionKind: null }),
    ])
    expect(p.fields[0].problems.map((x) => x.id)).toContain('no_answer')
    expect(p.fields[1].problems.map((x) => x.id)).toContain('unmatched')
    expect(p.warnings).toContain('One required question has no answer.')
  })
})

describe('normalising what the columns hold', () => {
  it('reads an unknown answer state as empty and an unknown prep state as unread', () => {
    expect(normaliseAnswerState('APPROVED')).toBe('approved')
    expect(normaliseAnswerState('half-done')).toBe('empty')
    expect(normaliseAnswerState(null)).toBe('empty')
    expect(normalisePrepStatus('blocked')).toBe('blocked')
    expect(normalisePrepStatus('weird')).toBe('unread')
  })
})

describe('the submission email', () => {
  const library = [
    asset({ kind: 'fact', label: 'Name', questionKind: 'artist_name', value: 'Doug McArthur' }),
    asset({ kind: 'fact', label: 'One-liner', questionKind: 'one_liner', value: 'A Winnipeg songwriter with four records behind him.' }),
    asset({ kind: 'bio', label: 'Bio', questionKind: 'bio', value: 'x'.repeat(400) }),
    asset({ kind: 'link', label: 'Site', questionKind: 'website', value: 'https://example.com' }),
    asset({ kind: 'fact', label: 'Email', questionKind: 'email', value: 'doug@example.com' }),
  ]
  const gig = { name: 'Winnipeg Folk Festival', type: 'festival', organizer: 'Programming team' }

  it('names the event and the artist in the subject', () => {
    const draft = composeApplicationEmail({ gig, assets: library })
    expect(draft.subject).toContain('Winnipeg Folk Festival')
    expect(draft.subject).toContain('Doug McArthur')
  })

  it('always leaves the paragraph it cannot write, and marks it in the body', () => {
    const draft = composeApplicationEmail({ gig, assets: library })
    const why = draft.gaps.find((g) => g.marker === '[why this one]')
    expect(why).toBeDefined()
    expect(why!.prompt).toContain('Winnipeg Folk Festival')
    // In the body verbatim, so an unedited paste is visibly unfinished.
    expect(draft.body).toContain('[why this one]')
  })

  it('says what it could not find rather than writing around it', () => {
    const draft = composeApplicationEmail({ gig, assets: [library[0]] })
    expect(draft.missing).toContain('Artist bio')
    expect(draft.missing).toContain('One-line description')
    expect(draft.body).toContain('[bio — nothing on file]')
    expect(draft.gaps.map((g) => g.marker)).toContain('[contact details — nothing on file]')
  })

  it('lower-cases a one-liner into the sentence, but not an acronym', () => {
    const withCbc = composeApplicationEmail({
      gig,
      assets: [
        library[0],
        asset({ questionKind: 'one_liner', value: 'CBC Radio 2 favourite, four records in.' }),
      ],
    })
    expect(withCbc.body).toContain('CBC Radio 2 favourite')

    const plain = composeApplicationEmail({ gig, assets: library })
    expect(plain.body).toContain('is a Winnipeg songwriter')
  })
})
