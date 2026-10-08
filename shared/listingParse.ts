/**
 * Reading a listing page: a run of linked headlines, each perhaps with a
 * deadline beneath it.
 *
 * SaskMusic's "Opportunities / Deadlines" is the case this was written for, and
 * the best argument for it. It lists forty-six entries, thirty of them calls
 * Canada Council grants, showcases, a residency, delegate places at an
 * international conference, each as a headline that links to its own page, a
 * line saying `Deadline: October 6, 2026`, and a sentence. A model reading that
 * page is spending effort on something a regular expression does exactly.
 *
 * **Found by markup, not by host.** There is no rule here that says SaskMusic.
 * An entry is a heading (`h2` to `h4`) wrapping a link, and what belongs to it
 * is the text up to the next such heading. That is how a WordPress archive, a
 * news index and a hand-built opportunities page are all written, and the same
 * move `parseFestivalProForm` makes for FestivalPro: recognise the structure,
 * so a redesign that keeps the structure does not break it and a site that
 * never had it reads as empty instead of as wrong.
 *
 * A second structure is read too, because news indexes are written another way:
 * a list whose every row is a linked headline with its date beside it, as
 * MusicOntario's is (`<li><a>Title</a><span>August 19, 2026</span></li>`).
 * Navigation menus are lists of links as well, which is why the date is the
 * condition: a menu entry has none. The date is when it was posted, not when
 * anything closes. It is what lets an item first seen months after it was
 * written be filed as old and not as new.
 *
 * What it will not do is read prose. A deadline is taken only from a line that
 * says deadline (or closes, or due) beside a date; a sentence with a date
 * somewhere in it is not one. The line is handed on as written, and
 * `splitDeadline` decides whether it holds a year, so "November 20" does not,
 * and stays words, which is the rule everywhere else in this repo.
 *
 * **It costs the same on a page that is broken.** Every look-ahead is bounded
 * and every scan moves forward (`shared/safeScan.ts`), so a page that never
 * closes its tags, or ends inside a script, is read in time proportional to its
 * size. Pure: no clock, no network.
 */

import { decode } from './manitobaMusic'
import { TEXT_MAX, stripTags, tagEnd, withoutFurniture } from './safeScan'

export interface ListingItem {
  title: string
  /** Absolute. */
  url: string
  /** The words after "Deadline:", as written. Null when there was no such line. */
  deadlineText: string | null
  /** A place, when the entry names one on a line of its own ("Happening in ..."). */
  place: string | null
  /** The first sentence-length line of the entry. For classification, not storage. */
  blurb: string
  /** The date beside it on a dated list ("August 19, 2026"), as written. Null on a page of calls. */
  postedText: string | null
}

export const MAX_LISTING_ITEMS = 200

/** A page longer than this is read only as far as this. */
const MAX_PAGE_CHARS = 2_000_000

/** How many places that might start an entry are examined before the page is called read. */
const MAX_OPENERS = 20_000

/** How far past a heading an entry's own text can run before it is somebody else's. */
const BLOCK_MAX = 3500

/** The window a heading with its link is looked for in. */
const HEADLINE_WINDOW = 6000

/** The longest a list row can be and still be one. */
const ROW_MAX = 4000

/** Anchor text that is a button, not a title. */
const NOT_A_TITLE = /^(read more|learn more|more|continue reading|view|details|apply|apply now|click here|here)\W*$/i

function textOf(fragment: string): string {
  return decode(stripTags(fragment.slice(0, TEXT_MAX * 2)))
    .replace(/[\s ]+/g, ' ')
    .trim()
}

/** Lines of text, in order, with tags dropped and blocks kept apart. */
function linesOf(fragment: string): string[] {
  return decode(
    stripTags(fragment.replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/td)\b[^>]{0,200}>/gi, '\n')),
  )
    .split('\n')
    .map((l) => l.replace(/[\s ]+/g, ' ').trim())
    .filter(Boolean)
}

function absolute(href: string, base: string): string | null {
  try {
    const u = new URL(decode(href).trim(), base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    u.hash = ''
    return u.toString()
  } catch {
    return null
  }
}

interface Heading {
  href: string
  title: string
  start: number
  end: number
}

/**
 * `<h3><a href>Title</a></h3>`, and `<a href><h3>Title</h3></a>` where a card is
 * the link. One pass over the page; each candidate is checked inside a window
 * of fixed size, so the work is the number of candidates times a constant.
 */
const HEADING_THEN_LINK =
  /^<h([2-4])\b[^>]{0,500}>\s*<a\b[^>]{0,1000}?\bhref\s*=\s*(["'])([^"'<>]{0,2000})\2[^>]{0,1000}>([\s\S]{0,2500}?)<\/a>\s*<\/h\1>/i
const LINK_THEN_HEADING =
  /^<a\b[^>]{0,1000}?\bhref\s*=\s*(["'])([^"'<>]{0,2000})\1[^>]{0,1000}>\s*<h([2-4])\b[^>]{0,500}>([\s\S]{0,2500}?)<\/h\3>\s*<\/a>/i

function headings(html: string): Heading[] {
  const found: Heading[] = []
  const opener = /<(?:h[2-4]|a)(?=[\s>])/gi
  let m: RegExpExecArray | null
  let n = 0
  while ((m = opener.exec(html)) !== null && n++ < MAX_OPENERS) {
    const start = m.index
    const window = html.slice(start, start + HEADLINE_WINDOW)
    if (m[0].charCodeAt(1) === 104 || m[0].charCodeAt(1) === 72) {
      const h = HEADING_THEN_LINK.exec(window)
      if (h) found.push({ href: h[3], title: textOf(h[4]), start, end: start + h[0].length })
    } else {
      const a = LINK_THEN_HEADING.exec(window)
      if (a) found.push({ href: a[2], title: textOf(a[4]), start, end: start + a[0].length })
    }
  }
  return found.sort((a, b) => a.start - b.start)
}

/** "Deadline: Oct 6, 2026", "Closes: ...", "Due - ...". Only a line that says so. */
const DEADLINE_LINE = /^(?:application\s+|submission\s+|entry\s+)?(?:deadline|closes?|closing(?:\s+date)?|due(?:\s+date)?)\b\s*[:\-–—]?\s*(.{3,80})$/i

/** "Happening in Calgary, Alberta." / "Location: Halifax, NS". */
const PLACE_LINE = /^(?:happening in|location|where|venue|city)\s*:?\s*(.{3,80}?)\.?$/i

export function parseListing(html: string, baseUrl: string): ListingItem[] {
  const clean = withoutFurniture(html.slice(0, MAX_PAGE_CHARS))
  const heads = headings(clean)
  const items: ListingItem[] = []
  const seen = new Set<string>()

  for (let i = 0; i < heads.length && items.length < MAX_LISTING_ITEMS; i++) {
    const h = heads[i]
    const url = absolute(h.href, baseUrl)
    if (!url || h.title.length < 4 || NOT_A_TITLE.test(h.title)) continue
    // The entry's own text: up to the next headline, never past a screenful.
    const next = heads[i + 1]?.start ?? clean.length
    const block = clean.slice(h.end, Math.min(next, h.end + BLOCK_MAX))
    const lines = linesOf(block)

    let deadlineText: string | null = null
    let place: string | null = null
    let blurb = ''
    for (const line of lines.slice(0, 40)) {
      const d = DEADLINE_LINE.exec(line.slice(0, 200))
      if (d && deadlineText === null) {
        deadlineText = d[1].trim()
        continue
      }
      const p = PLACE_LINE.exec(line.slice(0, 200))
      if (p && place === null) {
        place = p[1].trim()
        continue
      }
      if (!blurb && line.length >= 40 && !NOT_A_TITLE.test(line)) blurb = line.slice(0, 300)
    }

    // A page links to the same call from its heading and from its button; the
    // first is the entry and the second is the same entry.
    if (seen.has(url)) continue
    seen.add(url)
    items.push({ title: h.title, url, deadlineText, place, blurb, postedText: null })
  }

  for (const item of datedLinkLists(clean, baseUrl)) {
    if (items.length >= MAX_LISTING_ITEMS) break
    if (seen.has(item.url)) continue
    seen.add(item.url)
    items.push(item)
  }
  return items
}

/** A date as a page writes one on its own: "August 19, 2026", "19 August 2026", "2026-08-19". */
const POSTED_DATE =
  /\b(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]{0,8}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]{0,8}\.?,?\s+\d{4}|\d{4}-\d{2}-\d{2})\b/i

const ROW_ANCHOR = /<a\b[^>]{0,1000}?\bhref\s*=\s*(["'])([^"'<>]{0,2000})\1[^>]{0,1000}>([\s\S]{0,2500}?)<\/a>/gi

/**
 * `<li>` rows holding one link and a date. A row is its own block, so one that
 * has another row inside it, or is longer than a row can be, is a menu with a
 * submenu or something else and is not this.
 */
function datedLinkLists(html: string, baseUrl: string): ListingItem[] {
  const out: ListingItem[] = []
  const opener = /<li(?=[\s>])/gi
  let m: RegExpExecArray | null
  let n = 0
  while ((m = opener.exec(html)) !== null && n++ < MAX_OPENERS) {
    const start = m.index
    const window = html.slice(start, start + ROW_MAX + 10)
    const lower = window.toLowerCase()
    const open = tagEnd(window, 0)
    if (open < 0) continue
    const close = lower.indexOf('</li', open)
    if (close < 0 || close > ROW_MAX) continue
    if (lower.indexOf('<li', open) >= 0 && lower.indexOf('<li', open) < close) continue

    const row = window.slice(open + 1, close)
    const anchors = [...row.matchAll(ROW_ANCHOR)]
    if (anchors.length !== 1) continue
    const title = textOf(anchors[0][3])
    if (title.length < 12 || NOT_A_TITLE.test(title)) continue
    // The date has to be beside the link, not inside it.
    const posted = POSTED_DATE.exec(textOf(row.replace(anchors[0][0], ' ')))
    if (!posted) continue
    const url = absolute(anchors[0][2], baseUrl)
    if (!url) continue
    out.push({ title, url, deadlineText: null, place: null, blurb: '', postedText: posted[0] })
    if (out.length >= MAX_LISTING_ITEMS) break
  }
  return out
}
