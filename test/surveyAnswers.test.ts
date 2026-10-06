import { describe, it, expect } from 'vitest'
import {
  attentionFailed,
  checkAnswer,
  firstUnanswered,
  isScreenedOut,
  OTHER_MAX,
  type AnswerMap,
} from '../shared/surveyAnswers'
import { buildPlan } from '../shared/surveyDesign'

/**
 * The one place that decides whether an answer is one a respondent could have
 * given. The browser is trusted with nothing, so each rule here is a way a
 * request that did not come from the screen is turned away.
 */

const plan = buildPlan(31337)
const ok = (screen: string, raw: unknown) => {
  const r = checkAnswer(plan, screen, raw)
  expect(r.ok, JSON.stringify(r)).toBe(true)
  return r.ok ? r.answer : null
}
const refused = (screen: string, raw: unknown) => {
  const r = checkAnswer(plan, screen, raw)
  expect(r.ok, `${screen} ${JSON.stringify(raw)}`).toBe(false)
  return r.ok ? '' : r.error
}

describe('single choice and select', () => {
  it('takes an option the question offered', () => {
    expect(ok('A2', { value: 'A2.lt2' })).toEqual({ value: 'A2.lt2' })
    expect(ok('A1', { value: 'A1.mb' })).toEqual({ value: 'A1.mb' })
  })

  it('refuses an option that belongs to another question, or does not exist', () => {
    refused('A2', { value: 'A3.solo' })
    refused('A2', { value: 'A2.nonsense' })
    refused('A2', { value: ['A2.lt2'] })
    refused('A2', { value: 3 })
  })

  it('keeps the text of "please specify" only when that option was chosen', () => {
    expect(ok('A3', { value: 'A3.other', other: '  Spoken   word  ' })).toEqual({ value: 'A3.other', other: 'Spoken word' })
    expect(ok('A3', { value: 'A3.solo', other: 'ignored' })).toEqual({ value: 'A3.solo' })
  })

  it('refuses a "please specify" that is too long, and strips control characters', () => {
    refused('A3', { value: 'A3.other', other: 'x'.repeat(OTHER_MAX + 1) })
    expect(ok('A3', { value: 'A3.other', other: 'a\u0000b\u0007c' })).toEqual({ value: 'A3.other', other: 'a b c' })
  })

  it('lets any question be skipped except the one that says who the survey is for', () => {
    expect(ok('A2', { skipped: true })).toEqual({ skipped: true })
    expect(refused('S1', { skipped: true })).toMatch(/choose one/i)
  })
})

describe('multiple choice', () => {
  it('takes several options once each', () => {
    expect(ok('B2', { value: ['B2.festival', 'B2.grant', 'B2.festival'] })).toEqual({ value: ['B2.festival', 'B2.grant'] })
  })

  it('refuses an empty list, a foreign option, or something that is not a list', () => {
    refused('B2', { value: [] })
    refused('B2', { value: ['B3.peers'] })
    refused('B2', { value: 'B2.festival' })
    refused('B2', { value: [1, 2] })
  })

  it('refuses "None of these" beside another answer, and accepts it alone', () => {
    refused('B2', { value: ['B2.none', 'B2.festival'] })
    expect(ok('B2', { value: ['B2.none'] })).toEqual({ value: ['B2.none'] })
  })

  it('keeps "None of these" and "Prefer not to say" from sitting beside the identity answers', () => {
    refused('E3', { value: ['E3.pnts', 'E3.deaf'] })
    refused('E3', { value: ['E3.none', 'E3.pnts'] })
    expect(ok('E3', { value: ['E3.deaf', 'E3.newcomer'] })).toEqual({ value: ['E3.deaf', 'E3.newcomer'] })
  })

  it('has no text box on the community catch-all, so nothing typed is kept', () => {
    expect(ok('E3', { value: ['E3.other_community'], other: 'something identifying' })).toEqual({ value: ['E3.other_community'] })
  })
})

describe('free text', () => {
  it('takes text up to its limit and keeps line breaks', () => {
    expect(ok('E5', { text: 'Cost of gas.\n\nAnd the crowd.' })).toEqual({ text: 'Cost of gas.\n\nAnd the crowd.' })
  })

  it('refuses text that is too long, and reads empty text as skipped', () => {
    refused('E5', { text: 'x'.repeat(501) })
    expect(ok('E5', { text: '   ' })).toEqual({ skipped: true })
  })
})

describe('ranking', () => {
  const task = plan.rank[0]

  it('takes one most and one least from the screen that was shown', () => {
    expect(ok(task.id, { best: task.items[0], worst: task.items[3] })).toEqual({ best: task.items[0], worst: task.items[3] })
  })

  it('refuses the same item for both, an item from another screen, or a missing pick', () => {
    refused(task.id, { best: task.items[0], worst: task.items[0] })
    const elsewhere = plan.rank[1].items.find((i) => !task.items.includes(i))!
    refused(task.id, { best: task.items[0], worst: elsewhere })
    refused(task.id, { best: task.items[0] })
  })
})

describe('paired choices', () => {
  it('takes A, B or Neither and nothing else', () => {
    for (const choice of ['a', 'b', 'none']) expect(ok('P1', { choice })).toEqual({ choice })
    refused('P1', { choice: 'c' })
    refused('P1', { choice: 'A' })
    refused('P1', {})
  })
})

describe('screens', () => {
  it('refuses a screen that is not in this respondent’s plan', () => {
    refused('R14', { best: 'f01', worst: 'f02' })
    refused('P99', { choice: 'a' })
    refused('Z9', { value: 'x' })
  })

  it('records that an introduction was read, whatever was sent with it', () => {
    expect(ok('intro:B', { anything: 1 })).toEqual({ seen: true })
  })

  it('refuses a body that is not an object', () => {
    for (const raw of [null, 'A2.lt2', 7, ['A2.lt2']]) refused('A2', raw)
  })
})

describe('reading what is stored', () => {
  it('knows who was screened out, and who was not', () => {
    expect(isScreenedOut({ S1: { value: 'S1.rep' } })).toBe(true)
    expect(isScreenedOut({ S1: { value: 'S1.neither' } })).toBe(true)
    expect(isScreenedOut({ S1: { value: 'S1.artist' } })).toBe(false)
    expect(isScreenedOut({})).toBe(false)
  })

  it('fails the attention check for the worse card or Neither, and passes the better', () => {
    const check = plan.choice.find((t) => t.check)!
    const worse = check.dominant === 'a' ? 'b' : 'a'
    expect(attentionFailed(plan, {})).toBeNull()
    expect(attentionFailed(plan, { [check.id]: { choice: check.dominant! } })).toBe(false)
    expect(attentionFailed(plan, { [check.id]: { choice: worse } })).toBe(true)
    expect(attentionFailed(plan, { [check.id]: { choice: 'none' } })).toBe(true)
    expect(attentionFailed(plan, { [check.id]: { skipped: true } })).toBeNull()
  })

  it('finds the first screen with no answer', () => {
    const answers: AnswerMap = {}
    expect(firstUnanswered(plan, answers)).toBe('S1')
    answers.S1 = { value: 'S1.artist' }
    answers.A1 = { skipped: true }
    expect(firstUnanswered(plan, answers)).toBe('A2')
    for (const s of plan.screens) answers[s] = { skipped: true }
    expect(firstUnanswered(plan, answers)).toBeNull()
  })
})
