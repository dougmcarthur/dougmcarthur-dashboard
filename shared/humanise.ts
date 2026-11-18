/**
 * A stored value, as words a person reads.
 *
 * Several columns hold identifiers that reach the screen — a gig type of
 * `house_concert`, a sync status of `draft_ready`, a task id of
 * `gig-festival-scan` — and none of them is a closed set: the research agents
 * write whatever they like, so a lookup table alone would print the next new
 * value raw. This is the fallback every such label ends in: separators become
 * spaces, and the first letter is capitalised.
 *
 * Sentence case rather than Title Case, because these sit mid-sentence and in
 * chips beside other words — "House concert", not "House Concert". The rest of
 * the value is left as written, so an acronym somebody typed survives.
 *
 * It used to be spelled by hand, `value.replace(/_/g, ' ')`, in half a dozen
 * places, most of which then leaned on CSS `capitalize` — which capitalises
 * after spaces, not after underscores, and is how "House_concert" reached the
 * Gigs table.
 */
export function humanise(raw: string | null | undefined, empty = ''): string {
  const words = (raw ?? '').trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!words) return empty
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** One run of letters and digits joined by hyphens or underscores, with no space. */
const SLUG = /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+$/

/**
 * A title an agent wrote, as a person reads it.
 *
 * The research agents name what they file, and some of them name it like a
 * file: `august-show-run-social`. A title with a space in it was written for a
 * person and is left exactly as written; only a whole value that is one slug
 * goes through `humanise`. A single plain word is not a slug either.
 */
export function titleLabel(raw: string | null | undefined): string {
  const title = (raw ?? '').trim()
  return SLUG.test(title) ? humanise(title) : title
}
