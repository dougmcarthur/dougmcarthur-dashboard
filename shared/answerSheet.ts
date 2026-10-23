/**
 * The order an application's answers are copied in, and where "copy and next"
 * goes after one.
 *
 * Pure, and about indexes into the list the form was read in, so the window
 * that shows it can be tested without a window. The list is the application
 * panel's own (`PreparedField`, in the form's order); this decides which rows
 * have something to copy and how the highlight moves between them.
 */

export interface SheetField {
  fieldType: string
  answer: string | null
  maxLength: number | null
}

/**
 * What Copy would put on the clipboard, or null when there is nothing to put.
 *
 * An upload has no text to copy however long its label is, and a blank answer
 * is not a thing to copy either: pasting nothing over what was on the
 * clipboard is how a stale bio ends up in a form. Whitespace counts as blank
 * for deciding, and is never trimmed from what is copied.
 */
export function copyableText(field: Pick<SheetField, 'fieldType' | 'answer'>): string | null {
  if (field.fieldType === 'file') return null
  const text = field.answer ?? ''
  return text.trim() === '' ? null : text
}

/**
 * The nearest row in a direction that has something to copy, or `from` when
 * there is none. Rows with nothing to copy are stepped over, so a form with an
 * upload between two questions does not stop the highlight on the upload.
 */
export function stepTo(fields: SheetField[], from: number, direction: 1 | -1): number {
  for (let i = from + direction; i >= 0 && i < fields.length; i += direction) {
    if (copyableText(fields[i]) !== null) return i
  }
  return from
}

/** Where the highlight starts: the first answer worth copying, else the top. */
export function firstCopyable(fields: SheetField[]): number {
  const at = fields.findIndex((f) => copyableText(f) !== null)
  return at === -1 ? 0 : at
}

/** How many characters past the form's limit the answer runs, 0 when it fits or there is no limit. */
export function overBy(field: Pick<SheetField, 'answer' | 'maxLength'>): number {
  const length = (field.answer ?? '').length
  return field.maxLength && length > field.maxLength ? length - field.maxLength : 0
}

/**
 * The sentence after a copy.
 *
 * Copy is never withheld, because the one that always works is the fallback
 * for everything else. So an answer that will be cut off on paste is copied,
 * and the sentence says so, rather than the button refusing.
 */
export function copiedNote(label: string, field: SheetField, last: boolean): string {
  const over = overBy(field)
  const parts = [`Copied ${label}.`]
  if (over > 0) parts.push(`It is ${over} over the ${field.maxLength}-character limit and will be cut off.`)
  if (last) parts.push('That was the last answer.')
  return parts.join(' ')
}
