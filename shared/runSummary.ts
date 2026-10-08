/**
 * What an agent wrote about a run, laid out so a person can read it.
 *
 * A research routine files one report per run: a paragraph on what it read, a
 * numbered list of what it filed, and a few sentences of caveats. Stored as one
 * string, it rendered as one block, and a block of that size is the wall of
 * text this module exists to take apart.
 *
 * It reads **layout, never meaning**. It looks for the markers a writer uses to
 * set a list apart (a numbered or bulleted line) and the dash or colon that
 * separates a name from what is said about it. It does not decide what a
 * sentence is *about*, and when the text carries no markers it hands the
 * paragraphs back untouched rather than guessing at a structure. That is the
 * line `shared/reviewParse.ts` crossed and this repo has been paying down.
 *
 * Nothing here is stored. The text stays exactly as the agent wrote it in
 * `task_runs.summary`, so a better reader next year improves every old run.
 */

export interface RunEntry {
  /** What the entry is called: the organisation, the target, the programme. */
  label: string
  /** What was said about it. May be empty when the line was only a name. */
  note: string
}

export interface RunReport {
  /** Paragraphs before the list, or all of them when there is no list. */
  intro: string[]
  /** The numbered or bulleted entries, in the order the agent gave them. */
  entries: RunEntry[]
  /** Paragraphs after the list: what could not be confirmed, what was not sent. */
  closing: string[]
}

export const EMPTY_REPORT: RunReport = { intro: [], entries: [], closing: [] }

/** A run that came back fine. Anything else is a run worth reading about. */
export function isOkRun(status: string): boolean {
  return status === 'ok' || status === 'success'
}

/**
 * Cuts at a word, never mid-word, and says it cut.
 *
 * The same discipline the feedback and invite-request bodies already follow
 * when they trim a stranger's message to 200 characters.
 */
export function brief(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  // When the cut lands on the end of a word the whole word is kept; otherwise
  // the half-word is dropped.
  const word = /\s/.test(flat[max - 1]) ? cut : cut.replace(/\s+\S*$/, '')
  // A single unbroken word longer than the limit is cut where it stands.
  return `${(word.length >= max * 0.5 ? word : cut).replace(/[\s,;:.–—-]+$/, '')}…`
}

/** Characters a writer reaches for to emphasise a name, which a screen should not print. */
function plain(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,;:]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Words that end in a full stop without ending a sentence. A paragraph break
 * after one of these would split a name in two, so it is not offered.
 */
const ABBREVIATIONS = /\b(?:Inc|Ltd|Co|Corp|St|Mr|Mrs|Ms|Dr|Jr|Sr|vs|etc|No|Vol|approx|e\.g|i\.e|U\.S|U\.K)\.$/i

/**
 * A long paragraph, cut into chunks of whole sentences.
 *
 * Formatting, not parsing: the words are unchanged and a chunk boundary only
 * ever falls where a sentence ends. A single run-together paragraph of 900
 * characters is the shape most agent prose arrives in once its newlines are
 * lost, and the cheapest way to make it readable is to let it breathe.
 */
function chunk(paragraph: string, target = 300): string[] {
  if (paragraph.length <= target * 1.4) return [paragraph]

  const sentences = paragraph.split(/(?<=[.!?])\s+(?=[A-Z0-9"'“(])/)
  const out: string[] = []
  let current = ''
  for (const sentence of sentences) {
    const joinable = current !== '' && ABBREVIATIONS.test(current)
    if (current !== '' && !joinable && current.length + sentence.length + 1 > target) {
      out.push(current)
      current = sentence
    } else {
      current = current === '' ? sentence : `${current} ${sentence}`
    }
  }
  if (current) out.push(current)
  return out
}

/** The first sentence, or the whole text when there is no full stop to find. */
function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const m = /^(.+?[.!?])(?:\s+(?=[A-Z0-9"'“(])|$)/.exec(flat)
  if (!m || ABBREVIATIONS.test(m[1])) return flat
  return m[1]
}

/** `"Songtradr"`, `"A and B"`, `"A, B and C"`, `"A, B, C and 2 more"`. */
function nameList(names: string[]): string {
  const shown = names.slice(0, 3)
  const rest = names.length - shown.length
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`
  if (shown.length <= 1) return shown.join('')
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

// ── Splitting an entry into its name and what was said ────────────────────────

/** The row number a writer cites, `(#32)`. A database id is not for a screen. */
const ROW_REF = /\s*\(#\d+\)/g

const SPACED_DASH = /^(.{1,90}?)\s+[—–]\s+([\s\S]+)$/
const SPACED_HYPHEN = /^(.{1,90}?)\s+-\s+([\s\S]+)$/
const COLON = /^([^:]{1,70}):\s+([\s\S]+)$/

function entryOf(raw: string): RunEntry {
  const text = plain(raw.replace(ROW_REF, ''))

  const split = SPACED_DASH.exec(text) ?? SPACED_HYPHEN.exec(text) ?? COLON.exec(text)
  if (split) return { label: split[1].trim(), note: split[2].trim() }

  // No separator: a bare name, or a sentence. A short one is its own label.
  if (text.length <= 90) return { label: text.replace(/[.;]$/, ''), note: '' }

  const lead = firstSentence(text)
  if (lead.length <= 90 && lead.length < text.length) {
    return { label: lead.replace(/[.;]$/, ''), note: text.slice(lead.length).trim() }
  }
  return { label: brief(text, 80), note: text }
}

// ── Finding the list ──────────────────────────────────────────────────────────

/** A numbered or bulleted line. Two digits at most, so a year is never a marker. */
const LINE_MARKER = /^(?:(\d{1,2})[.)]|[-*•])\s+(\S[\s\S]*)$/

/**
 * Lists that arrive on separate lines. The reliable case: the writer's own
 * line breaks say where each entry starts and where the list stops.
 */
function fromLines(lines: string[]): RunReport | null {
  const parsed = lines.map((line) => ({ raw: line, marker: LINE_MARKER.exec(line.trim()) }))
  const lastMarked = parsed.map((p) => p.marker !== null).lastIndexOf(true)
  const firstMarked = parsed.findIndex((p) => p.marker !== null)
  if (firstMarked === -1) return null

  const intro = parsed.slice(0, firstMarked).map((p) => plain(p.raw))
  const entries: string[] = []
  const closing: string[] = []

  for (let i = firstMarked; i < parsed.length; i++) {
    const { raw, marker } = parsed[i]
    if (marker) {
      entries.push(marker[2])
    } else if (i < lastMarked || /^\s/.test(raw)) {
      // Wrapped text between two entries, or indented under the last one.
      entries[entries.length - 1] += ` ${raw.trim()}`
    } else {
      closing.push(plain(raw))
    }
  }

  return {
    intro: intro.flatMap((p) => chunk(p)),
    entries: entries.map(entryOf),
    closing: closing.flatMap((p) => chunk(p)),
  }
}

/**
 * Lists that arrived run together: "…each under 150 words: 1. Songtradr — … 2. Sync & Shiver — …".
 *
 * Stricter than the line version, because there is no line break to confirm a
 * marker: the numbers have to count up from 1 with nothing skipped, and there
 * have to be at least two, so "17.5% commission" and "28 existing targets" and
 * a lone "1." in a sentence never start a list.
 *
 * Nothing marks where the last entry ends and the closing remarks begin, so
 * the last entry keeps the tail. Splitting it by guessing which sentence stops
 * being about the entry would be the guess this module refuses to make.
 */
function fromRunTogether(text: string): RunReport | null {
  const marks: Array<{ at: number; end: number }> = []
  let expected = 1
  for (const m of text.matchAll(/(?:^|(?<=[\s:;]))(\d{1,2})[.)]\s+(?=\S)/g)) {
    if (Number(m[1]) !== expected) continue
    marks.push({ at: m.index!, end: m.index! + m[0].length })
    expected++
  }
  if (marks.length < 2) return null

  const entries = marks.map((mark, i) => text.slice(mark.end, marks[i + 1]?.at ?? text.length).trim())
  const intro = plain(text.slice(0, marks[0].at))

  return {
    intro: intro ? chunk(intro) : [],
    entries: entries.map(entryOf),
    closing: [],
  }
}

export function parseRunSummary(summary: string | null | undefined): RunReport {
  const text = (summary ?? '').replace(/\r\n?/g, '\n').trim()
  if (!text) return EMPTY_REPORT

  const lines = text.split('\n').filter((line) => line.trim() !== '')

  const byLine = lines.length > 1 ? fromLines(lines) : null
  if (byLine) return byLine

  const together = fromRunTogether(lines.join(' '))
  if (together) return together

  // No list. Whatever paragraphs the writer used, broken up if they are long.
  return { intro: lines.map(plain).flatMap((p) => chunk(p)), entries: [], closing: [] }
}

/**
 * One line saying what a run produced, for the places that have room for one.
 *
 * A run that came back fine and listed what it filed is named by that list.
 * Anything else, and every run that did not come back fine, is named by its
 * first sentence, because "Gig research finished incomplete" without the
 * reason is the title with the interesting half cut off.
 */
export function runGist(summary: string | null | undefined, status: string, max = 140): string {
  const report = parseRunSummary(summary)
  if (isOkRun(status) && report.entries.length > 0) {
    return brief(nameList(report.entries.map((e) => e.label)), max)
  }
  const first = report.intro[0] ?? report.closing[0] ?? ''
  return brief(firstSentence(first), max)
}
