/**
 * Reading a feed: RSS, Atom, or an iCal calendar, into the same small item.
 *
 * Pure: text in, items out, no clock and no network. It scans the markup
 * instead of parsing XML because a Worker has no `DOMParser`, and because the
 * handful of fields wanted are named the same everywhere. The scanning is
 * `shared/safeScan.ts`, which is linear in the size of the body: a feed is
 * written by a stranger, and one that never closes its tags must cost no more
 * than one that does.
 *
 * Two things the real feeds taught, both of which this has to survive:
 *
 *  - **A feed is not always a feed.** Music PEI's calendar address answers 200
 *    with an empty body and a `text/html` type, and a site that has moved its
 *    feed often serves its homepage in its place. `feedFormat` says what a body
 *    is, and null is an answer: "this is not a feed" is a different fact from
 *    "this feed has no items".
 *  - **A feed can be enormous.** Music BC's is 1.6 MB for ten items, because
 *    each one carries the whole email newsletter in `content:encoded`. Only the
 *    first `MAX_ITEMS` are read, and the body of an item is cut to what
 *    classifying it needs before anything is stripped or decoded.
 *
 * The summary is for classifying an item and is never meant to be stored: what
 * Scout keeps about a call is facts, not copies of somebody's article.
 */

import { decode } from './manitobaMusic'
import { PLAIN_MAX, TAG_MAX, asciiLower, findElements, firstElement, stripTags, tagEnd, unwrapCdata } from './safeScan'

export type FeedFormat = 'rss' | 'atom' | 'ical'

export interface FeedItem {
  /** The guid, the Atom id, the calendar UID, or failing those the address. */
  key: string
  title: string
  url: string | null
  /** ISO datetime the item was published, when it said. */
  publishedAt: string | null
  /** ISO date an iCal event starts on. The day only: a time without a zone is a guess. */
  eventAt: string | null
  /** Plain text, cut short. For classification, not storage. */
  summary: string
  categories: string[]
  /** An iCal event's LOCATION. */
  place: string | null
}

/** More than this and the feed is an archive, not a recent-items list. */
export const MAX_ITEMS = 100

/** How much of an item's body is looked at. A call is announced early in it. */
const SUMMARY_SOURCE_MAX = 4000
export const SUMMARY_MAX = 400

/** How many categories one item can carry. */
const MAX_CATEGORIES = 20

export function feedFormat(body: string): FeedFormat | null {
  const head = body.slice(0, 4000)
  if (/BEGIN:VCALENDAR/i.test(head)) return 'ical'
  if (/<feed\b/i.test(head) && /<entry\b/i.test(body)) return 'atom'
  if (/<rss\b|<rdf:RDF\b|<channel\b/i.test(head)) return 'rss'
  return null
}

/** Items from a feed body, or null when the body is not a feed at all. */
export function parseFeed(body: string): FeedItem[] | null {
  const format = feedFormat(body)
  if (!format) return null
  return format === 'ical' ? parseIcal(body) : format === 'atom' ? parseAtom(body) : parseRss(body)
}

/* ----------------------------------------------------------------------- */
/* Text                                                                    */
/* ----------------------------------------------------------------------- */

/** Tags out, entities decoded, whitespace collapsed, and cut to a length that cannot hurt. */
function plain(s: string): string {
  return decode(stripTags(unwrapCdata(s.slice(0, PLAIN_MAX * 4))).slice(0, PLAIN_MAX))
    .replace(/[\s ]+/g, ' ')
    .trim()
}

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max).trimEnd() : s
}

function iso(raw: string | null | undefined): string | null {
  if (!raw) return null
  const ms = Date.parse(raw.trim().slice(0, 100))
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/** A field of an item, by the name of the tag. */
function field(block: string, lower: string, name: string): string | null {
  return firstElement(block, lower, name)?.inner ?? null
}

/** A summary from whichever body field the item has, read only as far as it needs. */
function summaryFrom(...sources: Array<string | null>): string {
  for (const s of sources) {
    if (!s) continue
    const text = plain(s.slice(0, SUMMARY_SOURCE_MAX))
    if (text) return clip(text, SUMMARY_MAX)
  }
  return ''
}

/* ----------------------------------------------------------------------- */
/* RSS                                                                     */
/* ----------------------------------------------------------------------- */

function parseRss(body: string): FeedItem[] {
  const items: FeedItem[] = []
  for (const el of findElements(body, asciiLower(body), 'item', MAX_ITEMS)) {
    const block = el.inner
    const lower = asciiLower(block)
    const title = plain(field(block, lower, 'title') ?? '')
    if (!title) continue
    const link = plain(field(block, lower, 'link') ?? '') || null
    const guid = plain(field(block, lower, 'guid') ?? '') || null
    items.push({
      key: guid ?? link ?? title,
      title,
      url: link,
      publishedAt: iso(plain(field(block, lower, 'pubdate') ?? field(block, lower, 'dc:date') ?? '')),
      eventAt: null,
      summary: summaryFrom(field(block, lower, 'description'), field(block, lower, 'content:encoded')),
      categories: findElements(block, lower, 'category', MAX_CATEGORIES).map((c) => plain(c.inner)).filter(Boolean),
      place: null,
    })
  }
  return items
}

/* ----------------------------------------------------------------------- */
/* Atom                                                                    */
/* ----------------------------------------------------------------------- */

/** The attribute strings of the tags called `name` that stand alone, as `<link href="…"/>` does. */
function bareTags(block: string, lower: string, name: string, limit: number): string[] {
  const out: string[] = []
  const open = `<${name}`
  let from = 0
  while (out.length < limit) {
    const i = lower.indexOf(open, from)
    if (i < 0) break
    from = i + 1
    const next = lower.charCodeAt(i + open.length)
    if (!(next === 32 || next === 47 || next === 9 || next === 10 || next === 13)) continue
    const gt = tagEnd(lower, i)
    if (gt < 0) continue
    out.push(block.slice(i + open.length, gt))
    from = gt + 1
  }
  return out
}

const ATTR = (name: string) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]{0,2000})"|'([^']{0,2000})')`, 'i')
const attr = (attrs: string, name: string): string | null => {
  const m = ATTR(name).exec(attrs.slice(0, TAG_MAX))
  return m ? (m[1] ?? m[2]) : null
}

function parseAtom(body: string): FeedItem[] {
  const items: FeedItem[] = []
  for (const el of findElements(body, asciiLower(body), 'entry', MAX_ITEMS)) {
    const block = el.inner
    const lower = asciiLower(block)
    const title = plain(field(block, lower, 'title') ?? '')
    if (!title) continue

    // The alternate link is the page; a bare `<link href>` is too. `rel="self"`
    // and `rel="edit"` are the feed's own plumbing.
    const links = bareTags(block, lower, 'link', 10)
    const pick =
      links.find((a) => attr(a, 'rel') === 'alternate') ?? links.find((a) => attr(a, 'rel') === null) ?? null
    const href = pick ? attr(pick, 'href') : null
    const id = plain(field(block, lower, 'id') ?? '') || null

    items.push({
      key: id ?? href ?? title,
      title,
      url: href ? decode(href) : null,
      publishedAt: iso(plain(field(block, lower, 'published') ?? field(block, lower, 'updated') ?? '')),
      eventAt: null,
      summary: summaryFrom(field(block, lower, 'summary'), field(block, lower, 'content')),
      categories: bareTags(block, lower, 'category', MAX_CATEGORIES)
        .map((a) => attr(a, 'term'))
        .filter((t): t is string => Boolean(t))
        .map((t) => decode(t)),
      place: null,
    })
  }
  return items
}

/* ----------------------------------------------------------------------- */
/* iCal                                                                    */
/* ----------------------------------------------------------------------- */

/** RFC 5545 section 3.3.11: `\n` `\,` `\;` `\\`. */
function unescapeIcal(s: string): string {
  return s.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? ' ' : c))
}

/** `20261015`, `20261015T190000Z`, `2026-10-15` to `2026-10-15`. */
function icalDay(raw: string): string | null {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(raw.trim())
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** `20261001T120000Z` to ISO. Without a zone it is the day only, never a guessed hour. */
function icalStamp(raw: string | undefined): string | null {
  if (!raw) return null
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(raw.trim())
  if (m) return iso(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`)
  const day = icalDay(raw)
  return day ? `${day}T00:00:00.000Z` : null
}

function parseIcal(body: string): FeedItem[] {
  // Folded lines continue on the next line behind a space or a tab.
  const text = body.replace(/\r?\n[ \t]/g, '')
  const lower = asciiLower(text)
  const items: FeedItem[] = []
  let from = 0

  while (items.length < MAX_ITEMS) {
    const a = lower.indexOf('begin:vevent', from)
    if (a < 0) break
    const b = lower.indexOf('end:vevent', a)
    if (b < 0) break
    from = b + 10

    const props = new Map<string, string>()
    for (const line of text.slice(a + 12, b).split(/\r?\n/)) {
      const colon = line.indexOf(':')
      if (colon < 1) continue
      // `DTSTART;VALUE=DATE:20261015`: the name is what precedes the first `;`.
      const name = line.slice(0, colon).split(';')[0].toUpperCase()
      if (!props.has(name)) props.set(name, line.slice(colon + 1, colon + 1 + PLAIN_MAX * 4))
    }

    const title = plain(unescapeIcal(props.get('SUMMARY') ?? ''))
    if (!title) continue
    const url = props.get('URL')?.trim().slice(0, 2000) || null

    items.push({
      key: props.get('UID')?.trim().slice(0, 500) || url || title,
      title,
      url,
      publishedAt: icalStamp(props.get('DTSTAMP') ?? props.get('CREATED')),
      eventAt: icalDay(props.get('DTSTART') ?? ''),
      summary: summaryFrom(unescapeIcal(props.get('DESCRIPTION') ?? '')),
      categories: (props.get('CATEGORIES') ?? '')
        .split(',')
        .slice(0, MAX_CATEGORIES)
        .map((c) => plain(unescapeIcal(c)))
        .filter(Boolean),
      place: plain(unescapeIcal(props.get('LOCATION') ?? '')) || null,
    })
  }
  return items
}
