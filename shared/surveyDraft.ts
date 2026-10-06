/**
 * What a respondent has half-done on one screen, and how it becomes an answer.
 *
 * The screens are thin: they render a draft and report taps. What a tap *means*
 * — ticking "None of these" clears the others, picking an item as most removes
 * it from least, when Next unlocks, what is sent — is decided here, where it can
 * be tested without a browser. These are the details that go wrong quietly: an
 * exclusive answer left beside another is a response the server refuses, and a
 * Next that unlocks too early is a screen somebody skips by accident.
 */

import type { Answer, AnswerMap } from './surveyAnswers'
import { screenKind, type Plan } from './surveyDesign'
import { questionOf, type ChoiceQuestion } from './surveyInstrument'

export interface Draft {
  /** A single choice's option id, or a multiple choice's option ids. */
  value?: string | string[]
  /** The text for "please specify", or the self-description. */
  other?: string
  /** Free text. */
  text?: string
  best?: string
  worst?: string
  choice?: 'a' | 'b' | 'none'
}

/** The draft a stored answer would have been made from, so going back shows what was said. */
export function draftFromAnswer(answer: Answer | undefined): Draft {
  if (!answer) return {}
  if ('skipped' in answer || 'seen' in answer) return {}
  if ('text' in answer) return { text: answer.text }
  if ('best' in answer) return { best: answer.best, worst: answer.worst }
  if ('choice' in answer) return { choice: answer.choice }
  return { value: answer.value, other: answer.other }
}

/**
 * The draft after a tap on one option of a multiple-choice question.
 *
 * An exclusive answer ("None of these", "Prefer not to say") is alone or absent:
 * ticking one clears everything else, and ticking anything else clears it.
 * Ticking an option that is already ticked unticks it.
 */
export function toggleOption(question: ChoiceQuestion, draft: Draft, optionId: string): Draft {
  const current = Array.isArray(draft.value) ? draft.value : []
  const option = question.options.find((o) => o.id === optionId)
  if (!option) return draft

  let next: string[]
  if (current.includes(optionId)) {
    next = current.filter((id) => id !== optionId)
  } else if (option.exclusive) {
    next = [optionId]
  } else {
    next = [...current.filter((id) => !question.options.find((o) => o.id === id)?.exclusive), optionId]
  }
  const keepsOther = next.some((id) => question.options.find((o) => o.id === id)?.other)
  return { ...draft, value: next, other: keepsOther ? draft.other : undefined }
}

/** The draft after choosing one option of a single-choice question or a select. */
export function chooseOption(question: ChoiceQuestion, draft: Draft, optionId: string): Draft {
  const keepsOther = question.options.find((o) => o.id === optionId)?.other
  return { ...draft, value: optionId, other: keepsOther ? draft.other : undefined }
}

/**
 * The draft after a tap on Most or Least. An item cannot be both, so choosing it
 * for one clears it from the other.
 */
export function pickRank(draft: Draft, which: 'best' | 'worst', itemId: string): Draft {
  const other = which === 'best' ? 'worst' : 'best'
  return { ...draft, [which]: itemId, ...(draft[other] === itemId ? { [other]: undefined } : {}) }
}

/** Whether Next is available: what each kind of screen needs before it can move on. */
export function canContinue(plan: Plan, screenId: string, draft: Draft): boolean {
  const kind = screenKind(screenId)
  if (kind === 'intro') return true
  if (kind === 'rank') return !!draft.best && !!draft.worst && draft.best !== draft.worst
  if (kind === 'choice') return !!draft.choice
  const q = questionOf(screenId)
  if (!q) return false
  // Free text may be left empty: that is a skip, and has its own button too.
  if (q.kind === 'text') return true
  if (q.kind === 'multi') return Array.isArray(draft.value) && draft.value.length > 0
  return typeof draft.value === 'string' && draft.value.length > 0
}

/** Whether a screen offers Skip. The one that says who the survey is for does not. */
export function canSkip(screenId: string): boolean {
  return screenKind(screenId) !== 'intro' && screenId !== 'S1'
}

/** What is sent for a screen, from its draft. */
export function answerFromDraft(screenId: string, draft: Draft): unknown {
  const kind = screenKind(screenId)
  if (kind === 'intro') return {}
  if (kind === 'rank') return { best: draft.best, worst: draft.worst }
  if (kind === 'choice') return { choice: draft.choice }
  const q = questionOf(screenId)
  if (q?.kind === 'text') return { text: draft.text ?? '' }
  const other = draft.other?.trim()
  return { value: draft.value, ...(other ? { other } : {}) }
}

/** The screen to open on: the first with no answer, or the last if everything has one. */
export function resumeAt(plan: Plan, answers: AnswerMap): string {
  return plan.screens.find((id) => !(id in answers)) ?? plan.screens[plan.screens.length - 1]
}

/** Which question out of how many, for "3 of 9" on a ranking or choice screen. */
export function taskPosition(plan: Plan, screenId: string): { n: number; of: number } | null {
  const kind = screenKind(screenId)
  if (kind === 'rank') {
    const n = plan.rank.findIndex((t) => t.id === screenId)
    return n < 0 ? null : { n: n + 1, of: plan.rank.length }
  }
  if (kind === 'choice') {
    const n = plan.choice.findIndex((t) => t.id === screenId)
    return n < 0 ? null : { n: n + 1, of: plan.choice.length }
  }
  return null
}

/** A source tag from the page's hash, `#survey?src=manitoba-music`. Plain tags only; anything else is dropped. */
export function sourceFromHash(hash: string): string | undefined {
  const query = hash.split('?')[1]
  if (!query) return undefined
  const src = new URLSearchParams(query).get('src') ?? ''
  return /^[a-zA-Z0-9._-]{1,40}$/.test(src) ? src : undefined
}
