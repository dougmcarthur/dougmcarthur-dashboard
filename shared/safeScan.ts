/**
 * Reading markup written by strangers without letting it cost more than it is
 * worth.
 *
 * The readers in this folder take pages and feeds from sites Scout does not
 * control, on a Worker with a CPU budget. A lazy regex such as
 * `<item>([\s\S]*?)</item>` is fine on a page that closes its tags and
 * quadratic on one that does not: every opener scans to the end of the body
 * looking for a closer that is not there. That is not a theory. CIMA's real
 * home page, cut at the size cap, ends inside a script holding a megabyte of
 * JSON on one line, and the first version of the listing reader never came
 * back from it. A source the poller tries first, whose parse never returns
 * before anything is recorded, stops the hourly job for as long as the page
 * stays that way.
 *
 * So the rules here, which `test/parserSafety.test.ts` holds:
 *
 *  - **Every scan moves forward and never restarts.** `indexOf` from a moving
 *    cursor, never a fresh search per candidate.
 *  - **A missing closer stops the scan.** If nothing after this point closes
 *    `<item>`, nothing after a later point will either, so there is no reason
 *    to look again from the next opener.
 *  - **Every look-ahead is bounded.** A tag is at most `TAG_MAX` characters; a
 *    headline at most `TEXT_MAX`. Past that it is not one.
 *  - **Input is cut before it is read**, and what comes back is capped.
 *
 * Pure: strings in, strings out.
 */

/** The longest an opening tag is allowed to be. */
export const TAG_MAX = 1200

/** The longest a headline or a field is allowed to be. */
export const TEXT_MAX = 2500

/** The most of any one field that is looked at before it is cut. */
export const PLAIN_MAX = 8000

/** Lower-case for searching, keeping every index aligned with the original. */
export function asciiLower(s: string): string {
  const lower = s.toLowerCase()
  // A few letters change length when lower-cased, which would move every index.
  return lower.length === s.length ? lower : s.replace(/[A-Z]+/g, (m) => m.toLowerCase())
}

export interface FoundElement {
  /** What is inside the opening tag, after the name. */
  attrs: string
  inner: string
}

/** The index of the `>` that ends a tag starting at `start`, within `TAG_MAX`, or -1. */
export function tagEnd(s: string, start: number): number {
  const stop = Math.min(s.length, start + TAG_MAX)
  for (let i = start; i < stop; i++) if (s.charCodeAt(i) === 62) return i
  return -1
}

const isNameEnd = (code: number) => code === 32 || code === 62 || code === 47 || code === 9 || code === 10 || code === 13

/**
 * The elements called `name`, in order, up to `limit`.
 *
 * `lower` is `asciiLower(source)`, passed in so a caller reading many tags from
 * one body lowers it once. An element that never closes ends the search.
 */
export function findElements(source: string, lower: string, name: string, limit = Infinity): FoundElement[] {
  const out: FoundElement[] = []
  const open = `<${name}`
  const close = `</${name}`
  let from = 0
  // The nearest `>` after the last search position. Openers only move forward, so
  // one that is still before it shares it, and the search is not repeated.
  let gtCache = -2

  while (out.length < limit) {
    const i = lower.indexOf(open, from)
    if (i < 0) break
    const afterName = i + open.length
    if (!isNameEnd(lower.charCodeAt(afterName))) {
      from = i + 1
      continue
    }
    if (gtCache < afterName && gtCache !== -1) gtCache = lower.indexOf('>', afterName)
    if (gtCache < 0) break
    const gt = gtCache
    if (gt - i > TAG_MAX) {
      from = i + 1
      continue
    }
    const selfClosing = lower.charCodeAt(gt - 1) === 47
    if (selfClosing) {
      out.push({ attrs: source.slice(afterName, gt - 1), inner: '' })
      from = gt + 1
      continue
    }
    const end = lower.indexOf(close, gt + 1)
    if (end < 0) break
    out.push({ attrs: source.slice(afterName, gt), inner: source.slice(gt + 1, end) })
    from = end + close.length
  }
  return out
}

/** The first element called `name`, or null. */
export function firstElement(source: string, lower: string, name: string): FoundElement | null {
  return findElements(source, lower, name, 1)[0] ?? null
}

/**
 * The text of `<![CDATA[ ... ]]>` sections, with the wrapper taken off.
 *
 * One that never closes is a body cut short, so what follows is its content,
 * the way a browser reads the rest of an unclosed script.
 */
export function unwrapCdata(s: string): string {
  let out = ''
  let i = 0
  for (;;) {
    const a = s.indexOf('<![CDATA[', i)
    if (a < 0) return out + s.slice(i)
    const b = s.indexOf(']]>', a + 9)
    if (b < 0) return out + s.slice(i, a) + s.slice(a + 9)
    out += s.slice(i, a) + s.slice(a + 9, b)
    i = b + 3
  }
}

/**
 * Tags out, each replaced by a space. A `<` with no `>` after it is text, and
 * ends the scan: the rest has no tags in it to find.
 */
export function stripTags(s: string): string {
  let out = ''
  let i = 0
  for (;;) {
    const lt = s.indexOf('<', i)
    if (lt < 0) return out + s.slice(i)
    const gt = s.indexOf('>', lt + 1)
    if (gt < 0) return out + s.slice(i)
    out += s.slice(i, lt) + ' '
    i = gt + 1
  }
}

const FURNITURE_ALWAYS = new Set(['script', 'style', 'noscript', 'svg'])
const FURNITURE_OPENER = /<(?:(script|style|noscript|svg|nav|footer|aside)(?=[\s>/])|!--)/gi

/**
 * The page without its scripts, styles, navigation, footer, sidebars and
 * comments.
 *
 * A script, style or svg that never closes runs to the end of the page, which
 * is what a browser does with it too, so the rest is dropped. A navigation,
 * footer or sidebar that never closes is left in: it is more likely a stray
 * tag than a region.
 */
export function withoutFurniture(html: string): string {
  const lower = asciiLower(html)
  const noCloser = new Set<string>()
  let out = ''
  let i = 0
  const opener = new RegExp(FURNITURE_OPENER.source, 'gi')

  for (;;) {
    opener.lastIndex = i
    const m = opener.exec(html)
    if (!m) return out + html.slice(i)
    const start = m.index
    const after = start + m[0].length

    if (m[1] === undefined) {
      // A comment.
      const end = html.indexOf('-->', start + 4)
      out += html.slice(i, start) + ' '
      if (end < 0) return out
      i = end + 3
      continue
    }

    const tag = m[1].toLowerCase()
    const close = noCloser.has(tag) ? -1 : lower.indexOf(`</${tag}`, after)
    if (close < 0) {
      noCloser.add(tag)
      if (FURNITURE_ALWAYS.has(tag)) return out + html.slice(i, start) + ' '
      out += html.slice(i, after)
      i = after
      continue
    }
    const gt = html.indexOf('>', close)
    out += html.slice(i, start) + ' '
    if (gt < 0) return out
    i = gt + 1
  }
}
