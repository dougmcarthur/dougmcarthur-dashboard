/**
 * One list of shows from every place an artist posts them.
 *
 * Artists are inconsistent about where they list a date: one goes on
 * Bandsintown, the next only on their Manitoba Music profile, a third is a gig
 * booked through Scout that nobody listed anywhere. Showing each source in its
 * own box makes the artist do the merging in their head, and showing them
 * concatenated shows the same night twice. So they are merged here, and the
 * merge keeps two things the separate lists lose:
 *
 * - **Where each show is listed.** A show on Manitoba Music and not on
 *   Bandsintown is also missing from Spotify and Instagram, which Bandsintown
 *   feeds. `missingFrom` names the connected listings an upcoming show is not
 *   on, which is the thing worth fixing. Scout's own gigs are not a public
 *   listing, so a show can be missing *from* Bandsintown but never from Scout.
 * - **Every source's link.** The merged row keeps one link per source, so the
 *   ticket link survives whichever source had it.
 *
 * **Two shows are the same show when they are on the same date and share a
 * distinctive word** in their venue or title — "Songwriter Showcase 5" on one
 * and "Songwriter Showcase 5 w/ Jana Jacobs…" on the other. When neither
 * shares a word, the fallback is narrow on purpose: the same city, and each
 * source listing only that one show that day. A matinee and an evening show
 * in one city under two different names are the case it gets wrong, and they
 * stay two rows — a duplicate you can see is cheaper than two gigs silently
 * folded into one.
 *
 * Pure: no clock, no network. `today` is an argument.
 */

export type ShowSource = 'scout' | 'bandsintown' | 'manitoba_music'

/** The listings an artist publishes to; Scout's own gigs are not one. */
export const LISTING_SOURCES: ShowSource[] = ['bandsintown', 'manitoba_music']

export const SOURCE_LABELS: Record<ShowSource, string> = {
  scout: 'Booked in Scout',
  bandsintown: 'Bandsintown',
  manitoba_music: 'Manitoba Music',
}

export interface SourceShow {
  source: ShowSource
  /** `YYYY-MM-DD`, local to the show. */
  date: string
  time: string | null
  title: string | null
  venue: string | null
  location: string | null
  url: string | null
  /** A ticket link rather than an event page. */
  hasTickets?: boolean
  withArtists?: string[]
  /** For `scout`: the gig row, so the screen can link to it. */
  gigId?: number
}

export interface MergedShow {
  /** Stable enough for a React key: the date plus the first source's identity. */
  key: string
  date: string
  time: string | null
  title: string | null
  venue: string | null
  location: string | null
  ticketUrl: string | null
  withArtists: string[]
  sources: ShowSource[]
  links: Array<{ source: ShowSource; url: string }>
  gigId: number | null
  /** Connected listings this upcoming show is not on. Empty for past shows. */
  missingFrom: ShowSource[]
}

const STOP = new Set([
  'the', 'and', 'with', 'feat', 'featuring', 'live', 'at', 'presents', 'present', 'plus', 'guests', 'guest',
  'special', 'show', 'concert', 'night', 'tour', 'event', 'music', 'a', 'an', 'of', 'in', 'on', 'for', 'w',
])

/** Distinctive words: lower-cased, punctuation gone, stop words and one-letter scraps dropped. */
export function distinctive(text: string | null | undefined): Set<string> {
  const words = (text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => (w.length > 2 || /^\d+$/.test(w)) && !STOP.has(w))
  return new Set(words)
}

function cityOf(location: string | null): string {
  return (location ?? '').split(',')[0].trim().toLowerCase()
}

function words(s: SourceShow): Set<string> {
  return new Set([...distinctive(s.venue), ...distinctive(s.title)])
}

function sharesWord(a: Set<string>, b: Set<string>): boolean {
  for (const w of a) if (b.has(w)) return true
  return false
}

/** A venue that is only the title again says nothing about where. */
function realVenue(s: SourceShow): string | null {
  if (!s.venue) return null
  return s.title && s.venue.trim().toLowerCase() === s.title.trim().toLowerCase() ? null : s.venue
}

/**
 * Title preference: Scout's own gig name, then Manitoba Music's (they are
 * short and typed by a person), then Bandsintown's, which often carries the
 * whole bill in the title.
 */
const TITLE_ORDER: ShowSource[] = ['scout', 'manitoba_music', 'bandsintown']

export function mergeShows(
  shows: SourceShow[],
  options: { today: string; connected: ShowSource[] },
): { upcoming: MergedShow[]; past: MergedShow[] } {
  const perSourceDay = new Map<string, number>()
  for (const s of shows) {
    const k = `${s.source}|${s.date}`
    perSourceDay.set(k, (perSourceDay.get(k) ?? 0) + 1)
  }
  const alone = (s: SourceShow) => perSourceDay.get(`${s.source}|${s.date}`) === 1

  const groups: SourceShow[][] = []
  for (const s of shows) {
    const mine = words(s)
    const match = groups.find((g) => {
      if (g[0].date !== s.date) return false
      // Never fold two rows from the same source together: a source listing
      // two shows on one day means two shows.
      if (g.some((x) => x.source === s.source)) return false
      if (g.some((x) => sharesWord(words(x), mine))) return true
      const city = cityOf(s.location)
      return Boolean(city) && alone(s) && g.every((x) => alone(x) && cityOf(x.location) === city)
    })
    if (match) match.push(s)
    else groups.push([s])
  }

  const listings = LISTING_SOURCES.filter((s) => options.connected.includes(s))

  const merged = groups.map((g): MergedShow => {
    const bySource = (order: ShowSource[]) =>
      [...g].sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source))
    const titled = bySource(TITLE_ORDER)
    const venueFirst = bySource(['manitoba_music', 'bandsintown', 'scout'])
    const ticket = g.find((s) => s.hasTickets && s.url)
    const sources = [...new Set(g.map((s) => s.source))]
    const upcoming = g[0].date >= options.today
    return {
      key: `${g[0].date}|${g[0].source}|${g[0].url ?? g[0].gigId ?? g[0].title ?? ''}`,
      date: g[0].date,
      time: g.find((s) => s.time)?.time ?? null,
      title: titled.find((s) => s.title)?.title ?? null,
      venue: venueFirst.map(realVenue).find(Boolean) ?? null,
      location: venueFirst.find((s) => s.location)?.location ?? null,
      ticketUrl: ticket?.url ?? null,
      withArtists: [...new Set(g.flatMap((s) => s.withArtists ?? []))],
      sources,
      links: g.filter((s) => s.url).map((s) => ({ source: s.source, url: s.url! })),
      gigId: g.find((s) => s.gigId != null)?.gigId ?? null,
      missingFrom: upcoming ? listings.filter((l) => !sources.includes(l)) : [],
    }
  })

  const order = (a: MergedShow, b: MergedShow) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')
  return {
    upcoming: merged.filter((m) => m.date >= options.today).sort(order),
    past: merged.filter((m) => m.date < options.today).sort((a, b) => order(b, a)),
  }
}
