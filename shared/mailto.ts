/**
 * Handing a draft to the mail client, without the app ever sending anything.
 *
 * Copy-and-paste worked but lost the recipient and the subject, so the two
 * things most easily got wrong were the two things retyped every time. A
 * pre-filled compose window keeps them and still stops exactly where this app
 * always stops: at a window with a Send button the person has to press.
 *
 * The whole reason this file exists rather than a one-line `mailto:` template
 * is **length**. A `mailto:` URL that exceeds the platform ceiling does not
 * truncate and does not error — on Windows the click simply does nothing. A
 * button that silently does nothing is the same defect as the 150-character
 * field that truncates mid-word on paste, and this repo already has a rule
 * about that: an over-long answer is worse than an empty box. So the length is
 * measured after encoding, and a draft that will not fit is not offered a
 * button that would lie about working.
 */

export type MailHandler = 'mailto' | 'gmail'

/**
 * What each handler can carry, in encoded characters.
 *
 * `mailto` hands the URL to the operating system, and Windows stops accepting
 * one somewhere around 2,000 characters — reports vary by shell and client,
 * so the budget is deliberately below the lowest credible figure rather than
 * at the average one. Being conservative costs a Copy button; being
 * optimistic costs a click that does nothing.
 *
 * `gmail` is an ordinary https URL to a web app, so it is bounded by the
 * browser rather than by a shell. Gmail's own compose accepts roughly 4,096
 * encoded characters across recipient, subject and body together.
 */
export const HANDLER_BUDGET: Record<MailHandler, number> = {
  mailto: 1800,
  gmail: 4000,
}

export const HANDLER_LABELS: Record<MailHandler, string> = {
  mailto: 'Open in email',
  gmail: 'Open in Gmail',
}

export interface MailDraft {
  to?: string | null
  subject: string
  body: string
}

export interface HandlerLink {
  handler: MailHandler
  label: string
  /** Only present when it fits. Absent means: do not offer this button. */
  href?: string
  /** Encoded length, and what the handler will take. */
  length: number
  budget: number
  fits: boolean
}

/**
 * Percent-encoding for a query value.
 *
 * `encodeURIComponent` leaves `!'()*` alone, which some mail clients treat as
 * delimiters, and it encodes a newline as `%0A` where the RFC wants `%0D%0A`.
 * Both are the sort of thing that works on the machine it was written on.
 */
function encodeValue(value: string): string {
  return encodeURIComponent(value.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

export function buildMailUrl(handler: MailHandler, draft: MailDraft): string {
  const to = draft.to?.trim() ?? ''
  const params = [`subject=${encodeValue(draft.subject)}`, `body=${encodeValue(draft.body)}`]

  if (handler === 'gmail') {
    // `view=cm` is compose, `fs=1` makes it a full window rather than a
    // docked one — a pitch is not something to review in a corner.
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeValue(to)}&${params.join('&')}`
  }
  return `mailto:${encodeValue(to)}?${params.join('&')}`
}

/**
 * Every handler, each saying whether it can carry this draft.
 *
 * Both are always returned, fitting or not, so a caller can explain *why* a
 * button is missing rather than leaving a gap where one used to be. "This
 * pitch is too long to open in your mail client" is a useful sentence; a
 * vanished button is not.
 */
export function mailLinks(draft: MailDraft): HandlerLink[] {
  return (Object.keys(HANDLER_BUDGET) as MailHandler[]).map((handler) => {
    const href = buildMailUrl(handler, draft)
    const budget = HANDLER_BUDGET[handler]
    const fits = href.length <= budget
    return { handler, label: HANDLER_LABELS[handler], length: href.length, budget, fits, ...(fits ? { href } : {}) }
  })
}

/** The plain-text fallback, which always works and is never withheld. */
export function draftAsText(draft: MailDraft): string {
  return `${draft.subject}\n\n${draft.body}`
}
