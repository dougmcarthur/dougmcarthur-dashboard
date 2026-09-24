/**
 * Manitoba Music's live calendar, as a source of the artist's own shows.
 *
 * A venue or promoter often puts a show on the province's calendar without
 * linking it to the artist's profile, so the profile's Shows section misses
 * it. The calendar's feed takes a keyword filter —
 * `livemusic/keyword:<words>.rss`, the URL the calendar's own search form
 * redirects to — so the artist's name finds those.
 *
 * **The keyword search matches substrings, so its results are candidates, not
 * shows.** `keyword:McArthur` would return a Mary McArthur too. An event
 * counts only when a name in its *line-up* is the artist's name exactly —
 * case, accents and punctuation aside. A name in the description ("hosted by
 * …") is prose and does not count; that is the same restraint the rest of
 * Scout keeps about reading sentences.
 *
 * The name searched for is the one on the artist's Manitoba Music profile,
 * which they confirmed was theirs when they connected it. The calendar is
 * upcoming shows only.
 *
 * Pure: regex over the feed, no clock, no network.
 */

import { decode as decodeEntities } from './manitobaMusic'

export const MM_CALENDAR = 'https://www.manitobamusic.com/livemusic'

/** The feed of calendar events matching a name. `+` for spaces, as the site's own form writes it. */
export function calendarFeedUrl(name: string): string {
  const words = name.trim().split(/\s+/).map((w) => encodeURIComponent(w).replace(/%2F/gi, ''))
  return `${MM_CALENDAR}/keyword:${words.filter(Boolean).join('+')}.rss`
}

export interface CalendarEvent {
  url: string
  /** `YYYY-MM-DD` from the description's first line; null when it cannot be read. */
  date: string | null
  /** The event's own name when the title has one ("Songwriter Showcase 5"), else null. */
  event: string | null
  /** Every act on the bill, in billing order. */
  lineup: string[]
  venue: string | null
  city: string | null
  /** `HH:MM` for a named act when the description lists set times. */
  setTimes: Record<string, string>
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

/** "6 Oct 26" → "2026-10-06". The calendar writes two-digit years; this century. */
export function calendarDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{2}|\d{4})$/)
  if (!m) return null
  const month = MONTHS[m[2].toLowerCase()]
  if (!month) return null
  const year = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${year}-${month}-${m[1].padStart(2, '0')}`
}

function strip(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/[ \t\u00a0]+/g, ' ')
    .trim()
}

function to24(h: string, m: string | undefined, ampm: string): string {
  let hour = Number(h) % 12
  if (ampm.toUpperCase() === 'PM') hour += 12
  return `${String(hour).padStart(2, '0')}:${m ?? '00'}`
}

/** Names compared as people type them: case, accents, punctuation and spacing are not differences. */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const x = norm(a)
  return x.length > 0 && x === norm(b)
}

export function parseCalendarFeed(xml: string): CalendarEvent[] {
  const out: CalendarEvent[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1]
    const title = strip(item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? '')
    const url = (item.match(/<link>([^<]+)<\/link>/)?.[1] ?? '').trim()
    const desc = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] ?? ''
    if (!title || !/^https:\/\//.test(url)) continue

    // "Event name: Act, Act, Act", or a bare act name when there is no event.
    const colon = title.indexOf(': ')
    const event = colon > 0 ? title.slice(0, colon).trim() : null
    const lineup = (colon > 0 ? title.slice(colon + 2) : title)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const first = desc.match(/<p>([^<]*)<\/p>/)?.[1] ?? ''
    const venueBlock = desc.match(/<h2>Venue<\/h2>\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? ''
    const venueLines = venueBlock.split(/<br\s*\/?>/i).map(strip).filter(Boolean)

    const setTimes: Record<string, string> = {}
    for (const st of strip(desc).matchAll(/(\d{1,2})(?::(\d{2}))?\s*([AP]M)\s*-\s*\d{1,2}(?::\d{2})?\s*[AP]M:\s*([^\n]+)/gi)) {
      setTimes[st[4].trim()] = to24(st[1], st[2], st[3])
    }

    out.push({
      url,
      date: calendarDate(strip(first)),
      event,
      lineup,
      venue: venueLines[0] ?? null,
      city: venueLines.length > 1 ? venueLines[venueLines.length - 1] : null,
      setTimes,
    })
  }
  return out
}

/**
 * The events that bill this artist by name, and the time of their set when
 * the listing gives one. Anything the keyword search returned for another
 * reason is dropped here.
 */
export function eventsFor(events: CalendarEvent[], artist: string): Array<CalendarEvent & { time: string | null }> {
  return events
    .filter((e) => e.date && e.lineup.some((n) => sameName(n, artist)))
    .map((e) => {
      const set = Object.entries(e.setTimes).find(([n]) => sameName(n, artist) || n.toLowerCase().startsWith(artist.toLowerCase()))
      return { ...e, time: set ? set[1] : null }
    })
}
