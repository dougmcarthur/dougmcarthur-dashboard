/**
 * What a stored answer looks like, and the one place that decides whether an
 * answer is one a respondent could have given.
 *
 * The browser renders a plan and sends answers back; it is trusted with nothing.
 * Every answer is checked here against the plan the response was built from —
 * an option id the question never offered, a ranking pick from a screen that was
 * never shown, a text longer than the limit — so what lands in the database can
 * always be read back by the analysis without a second set of assumptions.
 *
 * Pure, so the same checks run in the Worker and in the tests.
 */

import { optionOf, questionOf, SCREEN_IN, type ChoiceQuestion, type TextQuestion } from './surveyInstrument'
import { screenKind, type Plan } from './surveyDesign'

export type Answer =
  /** The respondent chose not to answer this one. Distinct from "Prefer not to say", which is an answer. */
  | { skipped: true }
  /** A part introduction was read. Stored so how long it took is on record. */
  | { seen: true }
  | { value: string; other?: string }
  | { value: string[]; other?: string }
  | { text: string }
  | { best: string; worst: string }
  | { choice: 'a' | 'b' | 'none' }

export type AnswerMap = Record<string, Answer>

/** The longest a "please specify" box may be. */
export const OTHER_MAX = 100

export type Checked = { ok: true; answer: Answer } | { ok: false; error: string }

const bad = (error: string): Checked => ({ ok: false, error })

/** No control characters, no runs of blank space, and never longer than asked. */
function clean(raw: unknown, max: number, keepNewlines = false): string | null {
  if (typeof raw !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(keepNewlines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ')
  const text = (keepNewlines ? stripped.replace(/[ \t]+/g, ' ') : stripped.replace(/\s+/g, ' ')).trim()
  return text.length <= max ? text : null
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function checkAnswer(plan: Plan, screenId: string, raw: unknown): Checked {
  if (!plan.screens.includes(screenId)) return bad('That screen is not part of this survey.')
  if (!isObject(raw)) return bad('An answer is required.')

  const kind = screenKind(screenId)

  if (kind === 'intro') return { ok: true, answer: { seen: true } }

  if (raw.skipped === true) {
    // The screen-out question is how the survey knows who it is for.
    if (screenId === 'S1') return bad('Please choose one.')
    return { ok: true, answer: { skipped: true } }
  }

  if (kind === 'rank') {
    const task = plan.rank.find((t) => t.id === screenId)
    if (!task) return bad('That screen is not part of this survey.')
    const { best, worst } = raw
    if (typeof best !== 'string' || typeof worst !== 'string') return bad('Choose one most and one least.')
    if (best === worst) return bad('The most and least cannot be the same.')
    if (!task.items.includes(best) || !task.items.includes(worst)) return bad('That choice was not on this screen.')
    return { ok: true, answer: { best, worst } }
  }

  if (kind === 'choice') {
    const choice = raw.choice
    if (choice !== 'a' && choice !== 'b' && choice !== 'none') return bad('Choose A, B or Neither.')
    return { ok: true, answer: { choice } }
  }

  const question = questionOf(screenId)
  if (!question) return bad('That screen is not part of this survey.')

  if (question.kind === 'text') {
    const q = question as TextQuestion
    const text = clean(raw.text, q.maxLength, true)
    if (text === null) return bad(`Please keep it to ${q.maxLength} characters.`)
    if (text === '') return { ok: true, answer: { skipped: true } }
    return { ok: true, answer: { text } }
  }

  const q = question as ChoiceQuestion
  const other = raw.other === undefined || raw.other === null ? undefined : clean(raw.other, OTHER_MAX)
  if (other === null) return bad(`Please keep that to ${OTHER_MAX} characters.`)

  if (q.kind === 'multi') {
    const value = raw.value
    if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string')) {
      return bad('Choose at least one, or skip.')
    }
    const ids = [...new Set(value as string[])]
    const options = ids.map((id) => optionOf(q, id))
    if (options.some((o) => !o)) return bad('That is not one of the answers.')
    // An exclusive answer cannot sit beside another.
    if (options.some((o) => o!.exclusive) && ids.length > 1) {
      return bad('That answer cannot be combined with another.')
    }
    const hasOther = options.some((o) => o!.other)
    return {
      ok: true,
      answer: hasOther && other ? { value: ids, other } : { value: ids },
    }
  }

  const value = raw.value
  if (typeof value !== 'string') return bad('Choose one, or skip.')
  const option = optionOf(q, value)
  if (!option) return bad('That is not one of the answers.')
  return { ok: true, answer: option.other && other ? { value, other } : { value } }
}

// ── Reading stored answers ────────────────────────────────────────────────────

/** Whether S1 was answered with anything but the one answer that continues. */
export function isScreenedOut(answers: AnswerMap): boolean {
  const s1 = answers.S1
  return !!s1 && 'value' in s1 && typeof s1.value === 'string' && s1.value !== SCREEN_IN
}

export function isSkipped(a: Answer | undefined): boolean {
  return !a || 'skipped' in a
}

/**
 * Whether the attention check was failed: true or false once it has been
 * answered, null before. Choosing the worse card, or Neither, fails it.
 */
export function attentionFailed(plan: Plan, answers: AnswerMap): boolean | null {
  const task = plan.choice.find((t) => t.check)
  const a = task ? answers[task.id] : undefined
  if (!task || !a || !('choice' in a)) return null
  return a.choice !== task.dominant
}

/** The first screen with no answer, or null once every screen has one. */
export function firstUnanswered(plan: Plan, answers: AnswerMap): string | null {
  return plan.screens.find((id) => !(id in answers)) ?? null
}
