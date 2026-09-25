/**
 * A pre-filled link: the form, opened with your answers already typed in.
 *
 * Copy-and-paste works on every form and a phone makes it miserable — one
 * field at a time, switching apps between each. Google Forms takes answers in
 * the URL (`?usp=pp_url&entry.<id>=value`), and the form reader already keeps
 * every field's `entry.<id>`, so the whole application can arrive in one tap.
 * The person still reads the form and presses its Submit button; that is the
 * line this app stops at, and a link that fills boxes does not cross it.
 *
 * Only Google Forms, and deliberately. Every other platform that accepts
 * pre-fill wants the field's *internal* name from the form's builder, which a
 * festival will not hand over (`docs/submission-assist-research.md`).
 * Airtable keys by label and would work in principle, but its forms are drawn
 * by JavaScript, so the reader never gets the labels to key by.
 *
 * Four rules, each for a reason:
 *
 * - **Only answers you have read.** A suggestion is not an answer — the rule
 *   `answer_state` exists for. A link that typed twelve unread suggestions
 *   into a festival's form would make the unread state disappear at the exact
 *   moment it matters.
 * - **A choice must be one the form offers.** Google ignores a value that is
 *   not among a question's options, silently, so the box arrives empty and
 *   looks filled-in-by-Scout. Skipped and named instead.
 * - **An over-long answer stays out.** The form enforces its own limit, and an
 *   answer past it is the one field problem rated `danger`.
 * - **Everything left out is named, with why.** "Six of nine went in" without
 *   saying which three is a worse answer than no link.
 *
 * Nothing here reads the clock or the network; it is pure so it can be tested
 * against the shapes the reader actually produces.
 */

/** The subset of a prepared field the link needs. */
export interface PrefillField {
  fieldKey: string
  label: string
  fieldType: string
  options: string[] | null
  answer: string | null
  /** `answerState`, normalised: empty | suggested | edited | approved. */
  state: string
  /** Problem ids from `prepareField`; only `over_length` matters here. */
  problems: Array<{ id: string }>
}

export type SkipReason = 'unread' | 'over_length' | 'upload' | 'not_an_option' | 'not_a_date' | 'too_long_for_link' | 'no_field_id'

export const SKIP_REASONS: Record<SkipReason, string> = {
  unread: 'a suggestion nobody has read — approve it to include it',
  over_length: 'longer than the form allows',
  upload: 'a file — attach it on the form',
  not_an_option: 'not one of the choices the form offers',
  not_a_date: 'not a date the form can take',
  too_long_for_link: 'would make the link too long — paste this one',
  no_field_id: 'the form did not give this question an id',
}

export interface PrefillLink {
  /** Absent when nothing could go in: the blank form is not a pre-filled one. */
  href?: string
  /** Labels of the answers carried by the link, in form order. */
  included: string[]
  skipped: Array<{ label: string; reason: SkipReason }>
  /** Encoded length of `href`, against `PREFILL_BUDGET`. */
  length: number
}

/**
 * What a link may carry, in encoded characters.
 *
 * Browsers take far longer URLs than this; the limit that bites is the
 * request line a web front end will accept, commonly 8 KB. Google does not
 * publish its figure, so this sits deliberately under the common one — the
 * `mailto` reasoning in `shared/mailto.ts`: being conservative costs pasting
 * one field, being optimistic costs a link that opens an error page.
 */
export const PREFILL_BUDGET = 6000

/**
 * The form's pre-fill address, or null when this is not a Google Form.
 *
 * Accepts the shapes a reader can end up holding: `/viewform`, `/formResponse`
 * after a submission, a signed-in `/u/0/` path, and a trailing query. A
 * `forms.gle` short link is not resolved here — it has no id to build from —
 * but the form reader follows redirects and stores where it landed, so a form
 * that has been read carries the long address.
 */
export function googleFormBase(url: string | null | undefined): string | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.hostname.toLowerCase() !== 'docs.google.com') return null
  const m = parsed.pathname.match(/^\/forms\/(?:u\/\d+\/)?d\/(e\/)?([A-Za-z0-9_-]+)/)
  if (!m) return null
  return `https://docs.google.com/forms/d/${m[1] ?? ''}${m[2]}/viewform`
}

/**
 * Query-value encoding. `encodeURIComponent` leaves `!'()*` alone, which is
 * legal in a query but is what a chat app or a notes field decides ends a
 * link when somebody pastes it.
 */
function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

const CHOICE_TYPES = new Set(['radio', 'select', 'checkbox'])

/** Match typed text to an option's exact spelling, ignoring case and spacing. */
function matchOption(value: string, options: string[]): string | null {
  const squash = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
  const want = squash(value)
  return options.find((o) => squash(o) === want) ?? null
}

/**
 * The values one field contributes, or the reason it contributes none.
 *
 * A checkbox question takes several — Google reads the parameter repeated —
 * and an answer lists them one per line or separated by semicolons. Commas
 * are not a separator, because options contain them ("Folk, roots").
 */
function valuesFor(field: PrefillField, answer: string): string[] | SkipReason {
  if (field.fieldType === 'date') {
    const iso = answer.trim().match(/^\d{4}-\d{2}-\d{2}$/)
    return iso ? [iso[0]] : 'not_a_date'
  }
  if (!CHOICE_TYPES.has(field.fieldType)) return [answer]

  const options = field.options ?? []
  if (options.length === 0) return [answer]

  const parts =
    field.fieldType === 'checkbox'
      ? answer.split(/\n|;/).map((p) => p.trim()).filter(Boolean)
      : [answer]
  const matched = parts.map((p) => matchOption(p, options))
  return matched.every((m): m is string => m !== null) ? matched : 'not_an_option'
}

export function buildPrefillLink(
  formUrl: string | null | undefined,
  fields: PrefillField[],
): PrefillLink | null {
  const base = googleFormBase(formUrl)
  if (!base) return null

  let href = `${base}?usp=pp_url`
  const included: string[] = []
  const skipped: PrefillLink['skipped'] = []

  for (const field of fields) {
    const answer = field.answer ?? ''
    // An empty box is already visibly empty on the form; listing it here too
    // would bury the skips that need doing something about.
    if (field.fieldType !== 'file' && !answer.trim()) continue

    const skip = (reason: SkipReason) => skipped.push({ label: field.label, reason })

    if (field.fieldType === 'file') {
      skip('upload')
      continue
    }
    if (!/^entry\.\d+$/.test(field.fieldKey)) {
      skip('no_field_id')
      continue
    }
    if (field.state !== 'edited' && field.state !== 'approved') {
      skip('unread')
      continue
    }
    if (field.problems.some((p) => p.id === 'over_length')) {
      skip('over_length')
      continue
    }

    const values = valuesFor(field, answer)
    if (typeof values === 'string') {
      skip(values)
      continue
    }

    const params = values.map((v) => `&${field.fieldKey}=${encode(v)}`).join('')
    if (href.length + params.length > PREFILL_BUDGET) {
      skip('too_long_for_link')
      continue
    }
    href += params
    included.push(field.label)
  }

  // A link that fills nothing is the blank form under a button promising
  // otherwise — so no href, but the skips still say why.
  if (included.length === 0) return { included, skipped, length: 0 }

  return { href, included, skipped, length: href.length }
}
