import { describe, it, expect } from 'vitest'
import {
  answerFromDraft,
  canContinue,
  canSkip,
  chooseOption,
  draftFromAnswer,
  pickRank,
  resumeAt,
  sourceFromHash,
  taskPosition,
  toggleOption,
} from '../shared/surveyDraft'
import { checkAnswer } from '../shared/surveyAnswers'
import { buildPlan } from '../shared/surveyDesign'
import { questionOf, type ChoiceQuestion } from '../shared/surveyInstrument'

const plan = buildPlan(4242)
const e3 = questionOf('E3') as ChoiceQuestion
const b2 = questionOf('B2') as ChoiceQuestion

describe('ticking a multiple-choice list', () => {
  it('adds and removes ordinary options', () => {
    let d = toggleOption(e3, {}, 'E3.deaf')
    d = toggleOption(e3, d, 'E3.newcomer')
    expect(d.value).toEqual(['E3.deaf', 'E3.newcomer'])
    d = toggleOption(e3, d, 'E3.deaf')
    expect(d.value).toEqual(['E3.newcomer'])
  })

  it('clears everything else when "None of these" is ticked', () => {
    let d = toggleOption(e3, {}, 'E3.deaf')
    d = toggleOption(e3, d, 'E3.none')
    expect(d.value).toEqual(['E3.none'])
  })

  it('clears "Prefer not to say" when something else is ticked after it', () => {
    let d = toggleOption(e3, {}, 'E3.pnts')
    d = toggleOption(e3, d, 'E3.deaf')
    expect(d.value).toEqual(['E3.deaf'])
  })

  it('keeps "None of these" and "Prefer not to say" from being ticked together', () => {
    let d = toggleOption(e3, {}, 'E3.none')
    d = toggleOption(e3, d, 'E3.pnts')
    expect(d.value).toEqual(['E3.pnts'])
  })

  it('drops the "please specify" text when its option is unticked', () => {
    let d = toggleOption(b2, {}, 'B2.other')
    d = { ...d, other: 'Busking' }
    expect(toggleOption(b2, d, 'B2.festival').other).toBe('Busking')
    expect(toggleOption(b2, d, 'B2.other').other).toBeUndefined()
  })

  it('ignores an option the question does not have', () => {
    expect(toggleOption(e3, { value: ['E3.deaf'] }, 'E3.nonsense')).toEqual({ value: ['E3.deaf'] })
  })

  it('always produces a list the server accepts', () => {
    // Every tap sequence over a list with exclusives must end in a valid answer.
    const ids = e3.options.map((o) => o.id)
    for (let seed = 0; seed < 300; seed++) {
      let d = {}
      let x = seed * 2654435761
      for (let step = 0; step < 6; step++) {
        x = (x * 1103515245 + 12345) >>> 0
        d = toggleOption(e3, d, ids[x % ids.length])
      }
      const draft = d as { value?: string[] }
      if (!draft.value || draft.value.length === 0) continue
      const r = checkAnswer(plan, 'E3', answerFromDraft('E3', d))
      expect(r.ok, JSON.stringify(draft.value)).toBe(true)
    }
  })
})

describe('single choice', () => {
  const a3 = questionOf('A3') as ChoiceQuestion

  it('picks one, and drops the typed text when a different option is chosen', () => {
    let d = chooseOption(a3, {}, 'A3.other')
    d = { ...d, other: 'Spoken word' }
    expect(chooseOption(a3, d, 'A3.solo')).toEqual({ value: 'A3.solo', other: undefined })
    expect(chooseOption(a3, d, 'A3.other').other).toBe('Spoken word')
  })
})

describe('ranking', () => {
  it('moves an item out of Least when it is chosen as Most, and the reverse', () => {
    let d = pickRank({}, 'worst', 'f03')
    d = pickRank(d, 'best', 'f03')
    expect(d).toMatchObject({ best: 'f03' })
    expect(d.worst).toBeUndefined()
    d = pickRank(d, 'worst', 'f07')
    d = pickRank(d, 'worst', 'f03')
    expect(d.best).toBeUndefined()
    expect(d.worst).toBe('f03')
  })

  it('never produces a most and a least that are the same item', () => {
    let d = {}
    for (const [which, id] of [['best', 'a'], ['worst', 'a'], ['best', 'a'], ['worst', 'b'], ['best', 'b']] as const) {
      d = pickRank(d, which, id)
      const { best, worst } = d as { best?: string; worst?: string }
      if (best && worst) expect(best).not.toBe(worst)
    }
  })
})

describe('when Next unlocks', () => {
  const task = plan.rank[0]

  it('needs an answer on a question, but not on free text or an introduction', () => {
    expect(canContinue(plan, 'A2', {})).toBe(false)
    expect(canContinue(plan, 'A2', { value: 'A2.lt2' })).toBe(true)
    expect(canContinue(plan, 'B2', { value: [] })).toBe(false)
    expect(canContinue(plan, 'B2', { value: ['B2.festival'] })).toBe(true)
    expect(canContinue(plan, 'E5', {})).toBe(true)
    expect(canContinue(plan, 'intro:B', {})).toBe(true)
  })

  it('needs both a Most and a Least on a ranking screen, and a choice on a paired one', () => {
    expect(canContinue(plan, task.id, { best: task.items[0] })).toBe(false)
    expect(canContinue(plan, task.id, { best: task.items[0], worst: task.items[0] })).toBe(false)
    expect(canContinue(plan, task.id, { best: task.items[0], worst: task.items[1] })).toBe(true)
    expect(canContinue(plan, 'P1', {})).toBe(false)
    expect(canContinue(plan, 'P1', { choice: 'none' })).toBe(true)
  })

  it('offers Skip everywhere but the screen-out question and the introductions', () => {
    expect(canSkip('S1')).toBe(false)
    expect(canSkip('intro:C')).toBe(false)
    expect(canSkip('A2')).toBe(true)
    expect(canSkip('R3')).toBe(true)
    expect(canSkip('P3')).toBe(true)
  })
})

describe('what is sent', () => {
  it('sends text the respondent specified only when there is some', () => {
    expect(answerFromDraft('A3', { value: 'A3.other', other: '  Spoken word ' })).toEqual({ value: 'A3.other', other: 'Spoken word' })
    expect(answerFromDraft('A3', { value: 'A3.solo' })).toEqual({ value: 'A3.solo' })
    expect(answerFromDraft('A3', { value: 'A3.other', other: '   ' })).toEqual({ value: 'A3.other' })
  })

  it('sends a ranking, a choice and free text in the shapes the server reads', () => {
    expect(answerFromDraft('R1', { best: 'f01', worst: 'f02' })).toEqual({ best: 'f01', worst: 'f02' })
    expect(answerFromDraft('P1', { choice: 'b' })).toEqual({ choice: 'b' })
    expect(answerFromDraft('E5', { text: 'hello' })).toEqual({ text: 'hello' })
    expect(answerFromDraft('E5', {})).toEqual({ text: '' })
  })

  it('makes a draft out of a stored answer, so going back shows what was said', () => {
    expect(draftFromAnswer({ value: 'A2.lt2' })).toEqual({ value: 'A2.lt2', other: undefined })
    expect(draftFromAnswer({ best: 'f01', worst: 'f02' })).toEqual({ best: 'f01', worst: 'f02' })
    expect(draftFromAnswer({ skipped: true })).toEqual({})
    expect(draftFromAnswer(undefined)).toEqual({})
  })
})

describe('finding your place', () => {
  it('resumes at the first screen with no answer, or the last when all have one', () => {
    expect(resumeAt(plan, {})).toBe('S1')
    expect(resumeAt(plan, { S1: { value: 'S1.artist' } })).toBe('A1')
    const all = Object.fromEntries(plan.screens.map((s) => [s, { skipped: true as const }]))
    expect(resumeAt(plan, all)).toBe('E5')
  })

  it('counts ranking and choice screens, and nothing else', () => {
    expect(taskPosition(plan, 'R1')).toEqual({ n: 1, of: 9 })
    expect(taskPosition(plan, 'P9')).toEqual({ n: 9, of: 9 })
    expect(taskPosition(plan, 'A1')).toBeNull()
  })
})

describe('the source tag', () => {
  it('reads a plain tag from the hash and drops anything else', () => {
    expect(sourceFromHash('#survey?src=manitoba-music-newsletter')).toBe('manitoba-music-newsletter')
    expect(sourceFromHash('#survey')).toBeUndefined()
    expect(sourceFromHash('#survey?src=a b')).toBeUndefined()
    expect(sourceFromHash('#survey?src=<script>')).toBeUndefined()
    expect(sourceFromHash(`#survey?src=${'x'.repeat(41)}`)).toBeUndefined()
  })
})
