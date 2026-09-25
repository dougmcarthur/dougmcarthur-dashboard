/**
 * Bandsintown: where an artist's shows already live.
 *
 * Most artists keep their dates on Bandsintown because it feeds Spotify,
 * Instagram and the rest; typing them into Scout as well is a second place for
 * a date to be wrong. So Scout reads them, with the artist's own key.
 *
 * The owner's links page (`links.dougmcarthur.net`) already did this from the
 * browser with a hardcoded artist name and `app_id`. Two things change on the
 * way here:
 *
 * - **The key is per artist.** Bandsintown issues an API key per artist
 *   ("linked to a single artist unless authorized otherwise"), so a
 *   deployment-wide key would be one artist's key used for another. Each
 *   tenant pastes their own, from Bandsintown for Artists → Settings →
 *   General → Get API Key.
 * - **The Worker asks, not the browser**, so the key never reaches a page.
 *
 * Nothing here reads the clock or the network: `today` is an argument, the
 * response is a value, and the tests feed it both.
 */

export const BANDSINTOWN_API = 'https://rest.bandsintown.com'

/** One show, as a screen wants it. */
export interface Show {
  id: string
  /** `YYYY-MM-DD`, the local date of the show. */
  date: string
  /** `HH:MM` local, or null when Bandsintown has none. */
  time: string | null
  venue: string
  /** "Winnipeg, MB" — whatever parts exist, never "TBA" stitched in. */
  location: string
  country: string | null
  /** Other acts on the bill, the artist excluded. */
  withArtists: string[]
  /** Tickets when there is an offer, else the Bandsintown event page. */
  url: string | null
  hasTickets: boolean
  free: boolean
  /** Bandsintown's own title for the event, when it has one. */
  title: string | null
}

export type ShowWindow = 'upcoming' | 'past'

/**
 * The events URL for a window.
 *
 * Past is bounded to the year before `today`: an EPK wants what you have been
 * playing lately, and an unbounded history is a long response for an
 * application form that asks for "recent notable performances".
 */
export function eventsUrl(account: string, appId: string, window: ShowWindow, today: string): string {
  const base = `${BANDSINTOWN_API}/artists/${encodeURIComponent(account.trim())}/events`
  const params = new URLSearchParams({ app_id: appId })
  if (window === 'past') {
    const from = shiftYears(today, -1)
    params.set('date', `${from},${shiftDays(today, -1)}`)
  } else {
    params.set('date', 'upcoming')
  }
  return `${base}?${params.toString()}`
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function shiftYears(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().slice(0, 10)
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * An https link, with the key taken out.
 *
 * Bandsintown puts the caller's `app_id` in the query string of every event
 * and ticket link it returns. The Worker asks with the artist's key precisely
 * so the browser never holds it, and handing those links to the page as-is
 * would undo that. Its tracking parameters go too; they describe this
 * request, not the event.
 */
function safeUrl(v: unknown): string | null {
  const s = str(v)
  if (!/^https:\/\//i.test(s)) return null
  try {
    const u = new URL(s)
    for (const p of [...u.searchParams.keys()]) {
      if (p === 'app_id' || p === 'came_from' || p.startsWith('utm_')) u.searchParams.delete(p)
    }
    return u.toString()
  } catch {
    return null
  }
}

/**
 * Events from a Bandsintown response.
 *
 * `datetime` is the venue's local time with no zone (`2026-10-03T20:00:00`),
 * so the date is read off the string rather than through `Date`, which would
 * shift it by the reader's zone — the `parseRunAt` lesson. Anything that is not
 * an array, or an entry without a readable date, is dropped rather than
 * guessed at.
 */
export function parseEvents(body: unknown, artistName: string | null = null): Show[] {
  if (!Array.isArray(body)) return []
  const self = (artistName ?? '').trim().toLowerCase()
  const out: Show[] = []

  for (const e of body) {
    if (!e || typeof e !== 'object') continue
    const ev = e as Record<string, any>
    const m = str(ev.datetime).match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/)
    if (!m) continue

    const venue = ev.venue && typeof ev.venue === 'object' ? ev.venue : {}
    const location = [str(venue.city), str(venue.region)].filter(Boolean).join(', ')
    const offer = Array.isArray(ev.offers) ? ev.offers.find((o: any) => safeUrl(o?.url)) : null
    const lineup = Array.isArray(ev.lineup) ? ev.lineup.map(str).filter(Boolean) : []

    out.push({
      id: str(ev.id) || `${m[1]}-${str(venue.name)}`,
      date: m[1],
      time: m[2] && m[2] !== '00:00' ? m[2] : null,
      venue: str(venue.name) || str(venue.location) || 'Venue to be announced',
      location: location || str(venue.location),
      country: str(venue.country) || null,
      withArtists: lineup.filter((a: string) => a.toLowerCase() !== self),
      url: safeUrl(offer?.url) ?? safeUrl(ev.url),
      hasTickets: Boolean(offer),
      free: ev.free === true,
      title: str(ev.title) || null,
    })
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
}

/** Upcoming soonest first; past most recent first. */
export function splitShows(shows: Show[], today: string): { upcoming: Show[]; past: Show[] } {
  return {
    upcoming: shows.filter((s) => s.date >= today),
    past: shows.filter((s) => s.date < today).reverse(),
  }
}

/**
 * What a response says about the key, in `shared/credentialHealth.ts` terms.
 *
 * 401/403 is Bandsintown refusing the key; 404 is the artist name not being
 * one it knows, which is also yours to fix. Anything else — a 5xx, a timeout —
 * is a fact about the network and no verdict on the key.
 */
export type ProbeVerdict = 'working' | 'rejected' | 'unreachable'

export function verdictFor(status: number): ProbeVerdict {
  if (status >= 200 && status < 300) return 'working'
  if (status === 401 || status === 403 || status === 404) return 'rejected'
  return 'unreachable'
}

/** Bandsintown's own error sentence, trimmed, for the status line. */
export function errorNote(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const msg = str(b.errorMessage) || str(b.Message) || str(b.error) || str(b.message) || str(b.warn)
  return msg ? msg.replace(/^\[\w+\]\s*/, '').slice(0, 200) : null
}
