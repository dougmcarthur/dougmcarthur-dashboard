import { describe, it, expect } from 'vitest'
import {
  ATTRIBUTES,
  CONSENT,
  FACTORS,
  INTROS,
  PART_NAMES,
  QUESTIONS,
  SCREEN_IN,
  THANKS,
  questionOf,
  type ChoiceQuestion,
  type Text,
} from '../shared/surveyInstrument'

/**
 * The questionnaire's own rules, held as tests.
 *
 * `docs/artist-survey-questionnaire.md` says how the survey is built and why. A
 * rule written only in a document is one the next edit forgets, so each one
 * that can be checked mechanically is checked here: the order of a list, an
 * answer to decline with, a word the respondent must never read.
 */

const choiceQuestions = QUESTIONS.filter((q): q is ChoiceQuestion => q.kind !== 'text')

/** Every string a respondent can read, anywhere in the instrument. */
function everyString(): string[] {
  const out: string[] = []
  const take = (t: Text | undefined) => t && out.push(...Object.values(t).filter((s): s is string => typeof s === 'string'))
  for (const q of QUESTIONS) {
    take(q.prompt)
    take(q.help)
    if (q.kind !== 'text') q.options.forEach((o) => take(o.text))
  }
  FACTORS.forEach((f) => take(f.text))
  for (const a of ATTRIBUTES) {
    take(a.label)
    a.levels.forEach((l) => take(l.text))
  }
  for (const i of Object.values(INTROS)) {
    take(i.title)
    i.body.forEach(take)
  }
  take(CONSENT.title)
  take(CONSENT.lede)
  take(CONSENT.intro)
  CONSENT.points.forEach((p) => {
    take(p.lead)
    take(p.body)
  })
  take(CONSENT.confirm)
  take(CONSENT.agree)
  for (const t of Object.values(THANKS)) {
    take(t.title)
    t.body.forEach(take)
  }
  Object.values(PART_NAMES).forEach(take)
  return out
}

describe('the instrument is well formed', () => {
  it('has unique question ids, and option ids that carry their question', () => {
    const ids = QUESTIONS.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const q of choiceQuestions) {
      const optionIds = q.options.map((o) => o.id)
      expect(new Set(optionIds).size, q.id).toBe(optionIds.length)
      for (const id of optionIds) expect(id.startsWith(`${q.id}.`), `${q.id} ${id}`).toBe(true)
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(2)
    }
  })

  it('has every question the document names, and none it does not', () => {
    expect(QUESTIONS.map((q) => q.id)).toEqual([
      'S1',
      'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8',
      'B1', 'B2', 'B3', 'B4', 'B5',
      'E1', 'E2', 'E3', 'E4', 'E5',
    ])
  })

  it('stops at S1 for anybody who is not the artist', () => {
    const s1 = questionOf('S1') as ChoiceQuestion
    expect(s1.options.map((o) => o.id)).toContain(SCREEN_IN)
    expect(s1.options).toHaveLength(3)
  })

  it('keeps the thirteen factors and six attributes the design was built for', () => {
    expect(FACTORS).toHaveLength(13)
    expect(new Set(FACTORS.map((f) => f.id)).size).toBe(13)
    expect(ATTRIBUTES.map((a) => a.levels.length)).toEqual([4, 4, 4, 4, 3, 3])
    // The three measured in dollars say how many, in order, so one dollar is one dollar.
    for (const id of ['pay', 'fee', 'travel']) {
      const dollars = ATTRIBUTES.find((a) => a.id === id)!.levels.map((l) => l.dollars)
      expect(dollars.every((d) => typeof d === 'number'), id).toBe(true)
      expect([...dollars].sort((a, b) => a! - b!)).toEqual(dollars)
    }
  })
})

describe('order rules from the questionnaire', () => {
  it('never shuffles a list that has a natural order', () => {
    // Years, counts, ages, incomes, alphabetical lists and the screen-out question.
    for (const id of ['S1', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A8', 'B1', 'E1', 'E2', 'E3', 'E4']) {
      expect((questionOf(id) as ChoiceQuestion).shuffle, id).toBeFalsy()
    }
  })

  it('shuffles the lists that have none, and keeps Other, None and Prefer not to say last', () => {
    const shuffled = choiceQuestions.filter((q) => q.shuffle)
    expect(shuffled.map((q) => q.id).sort()).toEqual(['A7', 'B2', 'B3', 'B4', 'B5'])
    for (const q of shuffled) {
      const anchored = q.options.filter((o) => o.anchor)
      expect(anchored.length, q.id).toBeGreaterThan(0)
      expect(q.options.slice(-anchored.length), q.id).toEqual(anchored)
    }
  })

  it('keeps the same reasons in the pass list and the go list, so they can be set side by side', () => {
    const reasons = (id: string) =>
      (questionOf(id) as ChoiceQuestion).options.map((o) => o.id.split('.')[1]).filter((k) => !['other', 'none'].includes(k))
    const shared = ['pay', 'travel', 'time', 'audience', 'industry', 'fit', 'odds', 'repute', 'treat', 'goals']
    for (const key of shared) {
      expect(reasons('B4'), `B4 ${key}`).toContain(key)
      expect(reasons('B5'), `B5 ${key}`).toContain(key)
    }
  })
})

describe('what a respondent may decline', () => {
  it('offers "Prefer not to say" on every personal question, last, and as its own answer', () => {
    for (const id of ['E1', 'E2', 'E3', 'E4']) {
      const q = questionOf(id) as ChoiceQuestion
      expect(q.options[q.options.length - 1].id, id).toBe(`${id}.pnts`)
      // On a select-all list it must also clear whatever else was ticked.
      if (q.kind === 'multi') expect(q.options[q.options.length - 1].exclusive, id).toBe(true)
    }
  })

  it('keeps "None of these" and "Prefer not to say" as two answers on E3', () => {
    const e3 = questionOf('E3') as ChoiceQuestion
    const exclusive = e3.options.filter((o) => o.exclusive).map((o) => o.id)
    expect(exclusive).toEqual(['E3.none', 'E3.pnts'])
  })

  it('has the identity list in the order the Manitoba Arts Council form uses, and no free text on the catch-all', () => {
    const e3 = questionOf('E3') as ChoiceQuestion
    expect(e3.shuffle).toBeFalsy()
    expect(e3.options.map((o) => o.id.split('.')[1])).toEqual([
      'indigenous', 'francophone', 'black_poc', 'deaf', 'disability', '2slgbtq', 'newcomer', 'other_community', 'none', 'pnts',
    ])
    expect(e3.options.find((o) => o.id === 'E3.other_community')!.other).toBeFalsy()
  })

  it('splits Deaf from disability, and spells the 2SLGBTQ+ community out', () => {
    const e3 = questionOf('E3') as ChoiceQuestion
    const text = (key: string) => e3.options.find((o) => o.id === `E3.${key}`)!.text.en
    expect(text('deaf')).not.toMatch(/disab/i)
    expect(text('disability')).not.toMatch(/deaf/i)
    expect(text('2slgbtq')).toMatch(/Two-Spirit, lesbian, gay, bisexual, transgender, queer/)
  })

  it('says "landed within the last 5 years" for newcomers, as decided', () => {
    const e3 = questionOf('E3') as ChoiceQuestion
    expect(e3.options.find((o) => o.id === 'E3.newcomer')!.text.en).toBe('New to Canada (landed within the last 5 years)')
  })

  it('gives self-description its own option on gender, with a text box that is not required', () => {
    const e2 = questionOf('E2') as ChoiceQuestion
    expect(e2.options.find((o) => o.id === 'E2.self')!.other).toBe(true)
  })

  it('asks for no free text beyond one open question and the "please specify" boxes', () => {
    const textQuestions = QUESTIONS.filter((q) => q.kind === 'text')
    expect(textQuestions.map((q) => q.id)).toEqual(['E5'])
    expect((textQuestions[0] as { maxLength: number }).maxLength).toBe(500)
  })
})

describe('what the notice promises', () => {
  const notice = [CONSENT.intro.en, ...CONSENT.points.map((p) => `${p.lead.en} ${p.body.en}`)].join(' ')

  it('names who is asking, and does not say what the product is called', () => {
    expect(notice).toContain('Sun Dogs Music')
  })

  it('makes each promise the code has to keep', () => {
    expect(notice).toMatch(/do not store your IP address/)
    expect(notice).toMatch(/Close without saving/)
    expect(notice).toMatch(/cannot be taken back/)
    expect(notice).toMatch(/fewer than 10 people|small group/)
    expect(notice).toMatch(/no payment and no prize draw/)
  })

  it('leaves the results address to be filled from configuration', () => {
    expect(CONSENT.points.map((p) => p.body.en).join(' ')).toContain('{results}')
  })

  it('asks for confirmation that the respondent is an adult', () => {
    expect(CONSENT.agree.en).toMatch(/18 or older/)
  })
})

describe('what a respondent reads', () => {
  it('never says "Scout"; the mark this product avoids is the bare word, and the survey names no product', () => {
    for (const s of everyString()) expect(s, s).not.toMatch(/scout/i)
  })

  it('has no empty strings and no leftover template braces except the one placeholder', () => {
    for (const s of everyString()) {
      expect(s.trim().length, JSON.stringify(s)).toBeGreaterThan(0)
      const braces = s.match(/\{[^}]*\}/g) ?? []
      for (const b of braces) expect(['{results}'], s).toContain(b)
    }
  })

  it('keeps each factor to one short line', () => {
    for (const f of FACTORS) {
      expect(f.text.en.length, f.id).toBeLessThanOrEqual(100)
      expect(f.text.en, f.id).not.toMatch(/ and \w+ (and|or)/)
    }
  })
})

/**
 * Wording settled after a read-through (docs/artist-survey-questionnaire.md,
 * "Wording that was changed"). Each is a thing that reads fine alone and misleads
 * in context, so a later edit has no reason to notice it going back.
 */
describe('the wording that was settled', () => {
  const text = (qid: string, optionId: string) => {
    const q = questionOf(qid) as ChoiceQuestion
    return q.options.find((o) => o.id === `${qid}.${optionId}`)!.text.en
  }

  it('uses no word that is a verdict on an answer', () => {
    // "Exposure only" is how artists hear an unpaid offer described by somebody
    // who is not paying, and it pushes the weight on pay up.
    for (const s of everyString()) expect(s, s).not.toMatch(/exposure/i)
  })

  it('never calls what an artist is paid a fee, since fee means what it costs to apply', () => {
    for (const s of everyString()) expect(s, s).not.toMatch(/pay or fee/i)
    expect(text('B4', 'pay')).toBe('The pay was too low')
    expect(text('B5', 'pay')).toBe('The pay was good')
  })

  it('reads B5 against B4: every reason in B5 is one B4 offers, apart from being recommended', () => {
    const ids = (qid: string) => (questionOf(qid) as ChoiceQuestion).options.map((o) => o.id.split('.')[1])
    const b4 = new Set(ids('B4'))
    for (const id of ids('B5')) if (id !== 'recommended') expect(b4.has(id), id).toBe(true)
    // The cost to apply and the effort to apply are separate reasons in both.
    for (const id of ['fee', 'effort']) {
      expect(ids('B4')).toContain(id)
      expect(ids('B5')).toContain(id)
    }
  })

  it('does not ask about two things in one option', () => {
    for (const q of choiceQuestions) {
      for (const o of q.options) expect(o.text.en, o.id).not.toMatch(/, and (quick|cheap|free|fast)\b/i)
    }
  })

  it('says "few or none" about people who could hire again, as the paired choices do', () => {
    const level = ATTRIBUTES.find((a) => a.id === 'industry')!.levels[0].text.en
    expect(level).toBe('Few or none')
    expect(text('B4', 'industry')).toContain(level)
  })

  it('gives the way out of B2 in the terms B1 asked: not having applied', () => {
    expect(text('B2', 'none')).toBe('I did not apply for any')
  })

  it('lets the "please specify" box ask for the text, not the option', () => {
    for (const q of choiceQuestions) {
      for (const o of q.options) expect(o.text.en, o.id).not.toMatch(/please specify/i)
    }
  })

  it('tells people they may pick several wherever they may', () => {
    for (const q of choiceQuestions.filter((c) => c.kind === 'multi')) {
      expect(q.help?.en, q.id).toMatch(/select all that apply/i)
    }
  })

  it('puts Other before the answers that close a list, in every list', () => {
    for (const q of choiceQuestions) {
      const other = q.options.findIndex((o) => o.other)
      if (other < 0) continue
      q.options.forEach((o, i) => {
        if (o.exclusive || (o.anchor && !o.other)) expect(i, `${q.id} ${o.id}`).toBeGreaterThan(other)
      })
    }
  })
})
