/**
 * Phase 3 — apply & track. What the app can prepare without pretending to be
 * you.
 *
 * The form parser (src/lib/formParser.ts) says what an application asks for;
 * the artist database (shared/artistAssets.ts) holds what you would answer
 * with; `shared/questionKinds.ts` is the join between them. This module is
 * what falls out of putting the three together: a staged answer per field,
 * a checklist of what has to be gathered by hand, and an honest account of
 * what is not ready.
 *
 * The rule the whole module is built on: **it drafts, it never submits.** An
 * application filed by automation is a good way to be blacklisted, so the
 * output is text to copy and a list of what is missing — never a POST to
 * somebody's form.
 *
 * Pure, like everything in shared/. `today` is an argument, for the same
 * reason the review queue takes one.
 */

import {
  assetHealth,
  normaliseAssetKind,
  pickForLength,
  type ArtistAsset,
  type AssetHealth,
  type AssetKind,
} from './artistAssets'
import { classifyQuestion, kindByKey, targetLength } from './questionKinds'

/**
 * How far an answer has got.
 *
 * `suggested` is separate from `edited`/`approved` for the same reason
 * `unreviewed` is separate from `overdue` in the artist database: "the app
 * proposed this" and "you looked at it and said yes" are different claims, and
 * a screen that counts them together reports an application as finished when
 * nothing in it has been read.
 */
export type AnswerState = 'empty' | 'suggested' | 'edited' | 'approved'

export const ANSWER_STATES: AnswerState[] = ['empty', 'suggested', 'edited', 'approved']

export function normaliseAnswerState(raw: string | null | undefined): AnswerState {
  const v = (raw ?? '').trim().toLowerCase()
  return (ANSWER_STATES as string[]).includes(v) ? (v as AnswerState) : 'empty'
}

/** A field of somebody's application form, with whatever is staged against it. */
export interface ApplicationField {
  id: number
  gigId: number
  fieldKey: string
  label: string
  fieldType: string
  options: string[] | null
  required: boolean
  maxLength: number | null
  helpText: string | null
  position: number
  questionKind: string | null
  answer: string | null
  answerAssetId: number | null
  answerState: string
  updatedAt: string
}

/** Whether the form behind this gig has been read, and if not, why. */
export type PrepStatus = 'unread' | 'ready' | 'blocked' | 'failed'

export function normalisePrepStatus(raw: string | null | undefined): PrepStatus {
  const v = (raw ?? '').trim().toLowerCase()
  return v === 'ready' || v === 'blocked' || v === 'failed' ? v : 'unread'
}

// ── What is wrong with one answer ─────────────────────────────────────────────

export type FieldProblemId =
  | 'over_length'
  | 'retarget'
  | 'stale_source'
  | 'broken_source'
  | 'no_answer'
  | 'unmatched'
  | 'upload'

export interface FieldProblem {
  id: FieldProblemId
  /** One line, shown against the field. */
  message: string
  /** `danger` blocks the application; `warn` wants a look; `info` is a state. */
  severity: 'danger' | 'warn' | 'info'
}

export interface PreparedField extends ApplicationField {
  state: AnswerState
  /** The asset the answer came from, with its freshness. Null if hand-written. */
  source: (ArtistAsset & { health: AssetHealth }) | null
  /** Other assets on file answering the same question, for a one-click swap. */
  alternatives: Array<{ id: number; label: string; charCount: number }>
  problems: FieldProblem[]
  /** Characters staged, so a field can show 148/150 without recounting. */
  length: number
  /** Nothing left to do here: answered, within its limit, and looked at. */
  ready: boolean
}

/**
 * The one thing an over-long answer is not is "nearly right".
 *
 * A form with a 150-character limit truncates on paste, silently, mid-word —
 * so a 400-character bio staged against it is worse than an empty box, which
 * at least looks unfinished. It is the only field problem rated `danger`
 * without anything else being wrong.
 */
function lengthProblem(answer: string, maxLength: number | null): FieldProblem | null {
  if (!maxLength || answer.length <= maxLength) return null
  return {
    id: 'over_length',
    message: `${answer.length} characters against a ${maxLength}-character limit — this will be cut off on paste.`,
    severity: 'danger',
  }
}

/**
 * Material a form asks for as a file rather than as text.
 *
 * `classifyQuestion` deliberately refuses file fields — the answer is a file,
 * not a sentence — so uploads are matched by asset *kind* instead, and land in
 * the checklist rather than in the copy-paste blocks.
 */
const UPLOAD_KINDS: Array<{ kind: AssetKind; match: RegExp }> = [
  { kind: 'photo', match: /photo|image|headshot|press ?shot|artwork/i },
  { kind: 'video', match: /video|footage|live clip|performance clip/i },
  { kind: 'audio', match: /audio|track|mp3|recording|song|demo/i },
  { kind: 'document', match: /stage ?plot|input list|rider|w-?8|contract|cv|resume|pdf|document/i },
]

export function uploadKind(label: string, helpText?: string | null): AssetKind | null {
  const haystack = `${label} ${helpText ?? ''}`
  return UPLOAD_KINDS.find((u) => u.match.test(haystack))?.kind ?? null
}

// ── Staging ───────────────────────────────────────────────────────────────────

export interface StagedAnswer {
  questionKind: string | null
  answer: string | null
  answerAssetId: number | null
  answerState: AnswerState
}

/**
 * The answer to offer for a freshly-parsed field.
 *
 * Only ever `suggested` — this function has no way to know whether the answer
 * is right for *this* application, and marking it approved would launder a
 * guess into a decision.
 */
export function stageAnswer(
  field: { label: string; helpText?: string | null; fieldKey?: string; fieldType?: string; maxLength?: number | null },
  assets: ArtistAsset[],
): StagedAnswer {
  const kind = classifyQuestion({
    label: field.label,
    helpText: field.helpText ?? null,
    fieldKey: field.fieldKey,
    fieldType: field.fieldType,
  })
  if (!kind) return { questionKind: null, answer: null, answerAssetId: null, answerState: 'empty' }

  const wanted = targetLength({ maxLength: field.maxLength ?? null, fieldType: field.fieldType })
  const picked = pickForLength(
    assets.filter((a) => a.questionKind === kind.key),
    wanted,
  )

  if (!picked?.value) {
    return { questionKind: kind.key, answer: null, answerAssetId: null, answerState: 'empty' }
  }
  return {
    questionKind: kind.key,
    answer: picked.value,
    answerAssetId: picked.id,
    answerState: 'suggested',
  }
}

// ── Reading one field ─────────────────────────────────────────────────────────

function prepareField(
  field: ApplicationField,
  assets: ArtistAsset[],
  today: string,
): PreparedField {
  const state = normaliseAnswerState(field.answerState)
  const answer = field.answer ?? ''
  const kind = field.questionKind ? kindByKey(field.questionKind) : undefined
  const source = assets.find((a) => a.id === field.answerAssetId) ?? null
  const health = source ? assetHealth(source, today) : null
  const problems: FieldProblem[] = []

  if (field.fieldType === 'file') {
    problems.push({
      id: 'upload',
      message: 'A file upload — nothing can be pasted here. See the materials list.',
      severity: 'info',
    })
  }

  const over = lengthProblem(answer, field.maxLength)
  if (over) problems.push(over)

  if (!answer && field.fieldType !== 'file') {
    problems.push({
      id: field.required ? 'no_answer' : 'unmatched',
      message: field.questionKind
        ? 'Nothing on file answers this yet.'
        : 'This question does not match anything the artist database knows — it needs you.',
      severity: field.required ? 'danger' : 'warn',
    })
  }

  // 'adapt' answers name the event they were written for. Offering one as
  // ready to paste is how an application to a folk festival ends up telling a
  // sync agency why you love their campground.
  if (answer && kind?.reuse === 'adapt' && state === 'suggested') {
    problems.push({
      id: 'retarget',
      message: `Written for another application — rewrite it for this one before sending.`,
      severity: 'warn',
    })
  }

  if (source && health) {
    if (health.problem) {
      problems.push({ id: 'broken_source', message: health.problem, severity: 'warn' })
    }
    if (health.freshness === 'overdue') {
      problems.push({
        id: 'stale_source',
        message: `"${source.label}" was due for review ${Math.abs(health.daysUntilReview ?? 0)} days ago.`,
        severity: 'warn',
      })
    }
  }

  const alternatives = field.questionKind
    ? assets
        .filter(
          (a) =>
            !a.archived &&
            a.value &&
            a.questionKind === field.questionKind &&
            a.id !== field.answerAssetId,
        )
        .map((a) => ({ id: a.id, label: a.label, charCount: a.charCount ?? a.value!.length }))
    : []

  return {
    ...field,
    state,
    source: source && health ? { ...source, health } : null,
    alternatives,
    problems,
    length: answer.length,
    // A file field is never "ready" from here — the file is gathered, not
    // staged, and the checklist is where it is answered.
    ready:
      field.fieldType !== 'file' &&
      answer.length > 0 &&
      !over &&
      (state === 'edited' || state === 'approved'),
  }
}

// ── The materials checklist ───────────────────────────────────────────────────

export interface ChecklistItem {
  /** What the form calls it. */
  label: string
  /** The asset kind it wants, where that could be worked out. */
  kind: AssetKind | null
  required: boolean
  /** Live assets of that kind, the one that stays trustworthy longest first. */
  candidates: Array<ArtistAsset & { health: AssetHealth }>
  /** Null when something usable is on file. */
  problem: string | null
}

/**
 * What has to be gathered rather than pasted.
 *
 * Every file upload the form asks for, matched against what the artist
 * database holds. This is the "here is what is missing" half of the phase-3
 * promise, and it is the half that cannot be automated away: nothing here
 * uploads anything.
 */
export function materialsChecklist(
  fields: ApplicationField[],
  assets: ArtistAsset[],
  today: string,
): ChecklistItem[] {
  return fields
    .filter((f) => f.fieldType === 'file')
    .sort((a, b) => a.position - b.position)
    .map((f) => {
      const kind = uploadKind(f.label, f.helpText)
      const candidates = (kind
        ? assets.filter((a) => !a.archived && a.value && normaliseAssetKind(a.kind) === kind)
        : []
      )
        .map((a) => ({ ...a, health: assetHealth(a, today) }))
        // Freshest first, so the one the panel names as an example is the one
        // worth attaching. A null review date sorts last: "nobody ever claimed
        // this was checked" is not a recommendation.
        .sort((x, y) => (y.reviewBy ?? '').localeCompare(x.reviewBy ?? ''))

      let problem: string | null = null
      if (!kind) {
        problem = 'Not sure what this wants — check the form.'
      } else if (candidates.length === 0) {
        problem = 'Nothing of this kind is on file.'
      } else if (candidates.every((c) => c.health.problem)) {
        problem = candidates[0].health.problem
      } else if (candidates.every((c) => c.health.freshness === 'overdue')) {
        problem = 'Everything on file for this is overdue for review.'
      }

      return { label: f.label, kind, required: f.required, candidates, problem }
    })
}

// ── The packet ────────────────────────────────────────────────────────────────

export interface Readiness {
  fields: number
  required: number
  /** Fields carrying text of any kind, whether or not anyone has read it. */
  answered: number
  /** Of the required ones. */
  requiredAnswered: number
  /**
   * Answered *and* looked at. The gap between this and `answered` is the
   * whole reason `answerState` exists — an application full of unread
   * suggestions is not an application.
   */
  checked: number
  /** Uploads, which are counted apart because they are gathered, not written. */
  uploads: number
  /** Anything rated `danger`: it would go out wrong. */
  blocking: number
  /** Nothing left that would stop this being sent. */
  sendable: boolean
}

export interface ApplicationPacket {
  gigId: number
  prepStatus: PrepStatus
  /** Why the form could not be read, verbatim from the parser. */
  prepNote: string | null
  prepCheckedAt: string | null
  fields: PreparedField[]
  checklist: ChecklistItem[]
  readiness: Readiness
  /** Sentences for the top of the panel, worst first. */
  warnings: string[]
}

export function buildApplication(input: {
  gigId: number
  prepStatus?: string | null
  prepNote?: string | null
  prepCheckedAt?: string | null
  fields: ApplicationField[]
  assets: ArtistAsset[]
  today: string
}): ApplicationPacket {
  const { gigId, fields, assets, today } = input
  const prepared = [...fields]
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((f) => prepareField(f, assets, today))

  const writable = prepared.filter((f) => f.fieldType !== 'file')
  const required = writable.filter((f) => f.required)
  const answered = writable.filter((f) => (f.answer ?? '').length > 0)
  const checked = answered.filter((f) => f.state === 'edited' || f.state === 'approved')
  const blocking = prepared.filter((f) => f.problems.some((p) => p.severity === 'danger'))
  const checklist = materialsChecklist(fields, assets, today)

  const readiness: Readiness = {
    fields: writable.length,
    required: required.length,
    answered: answered.length,
    requiredAnswered: required.filter((f) => (f.answer ?? '').length > 0).length,
    checked: checked.length,
    uploads: prepared.length - writable.length,
    blocking: blocking.length,
    sendable:
      // A form of nothing but uploads is still an application; a form nothing
      // could read at all is not.
      prepared.length > 0 &&
      blocking.length === 0 &&
      required.every((f) => f.ready) &&
      checklist.every((c) => !c.required || !c.problem),
  }

  return {
    gigId,
    prepStatus: normalisePrepStatus(input.prepStatus),
    prepNote: input.prepNote ?? null,
    prepCheckedAt: input.prepCheckedAt ?? null,
    fields: prepared,
    checklist,
    readiness,
    warnings: applicationWarnings(prepared, checklist, readiness),
  }
}

/**
 * What is wrong with the application, in sentences.
 *
 * Written out singular and plural rather than patched with a trailing "s",
 * the same as `epkWarnings`: two of these change the verb as well as the noun.
 */
export function applicationWarnings(
  fields: PreparedField[],
  checklist: ChecklistItem[],
  readiness: Readiness,
): string[] {
  const out: string[] = []

  const tooLong = fields.filter((f) => f.problems.some((p) => p.id === 'over_length')).length
  if (tooLong === 1) out.push('One answer is longer than the form allows and will be cut off.')
  else if (tooLong > 1) out.push(`${tooLong} answers are longer than the form allows and will be cut off.`)

  const missing = readiness.required - readiness.requiredAnswered
  if (missing === 1) out.push('One required question has no answer.')
  else if (missing > 1) out.push(`${missing} required questions have no answer.`)

  const unread = readiness.answered - readiness.checked
  if (unread === 1) out.push('One answer is a suggestion nobody has read.')
  else if (unread > 1) out.push(`${unread} answers are suggestions nobody has read.`)

  const retarget = fields.filter((f) => f.problems.some((p) => p.id === 'retarget')).length
  if (retarget === 1) out.push('One answer was written for a different application.')
  else if (retarget > 1) out.push(`${retarget} answers were written for other applications.`)

  const gaps = checklist.filter((c) => c.problem).length
  if (gaps === 1) out.push('One thing on the materials list is missing or unusable.')
  else if (gaps > 1) out.push(`${gaps} things on the materials list are missing or unusable.`)

  return out
}
