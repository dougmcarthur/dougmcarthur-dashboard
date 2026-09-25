/**
 * Every show the artist has, from every place it is listed, as one list.
 *
 * Four sources, read together on request: Bandsintown (upcoming and the last
 * year), the Manitoba Music profile's Shows (upcoming only — its iCal feed is
 * broken, every event dated 1969), the province's live calendar searched for
 * the artist's name (`shared/mmCalendar.ts`), and gigs booked in Scout with a
 * performance date. `shared/showMerge.ts` folds the same night from several
 * sources into one row and says which listings an upcoming show is missing
 * from.
 *
 * A source that fails is reported beside the list rather than failing it: a
 * Bandsintown timeout should still show the Manitoba Music dates, and say the
 * list may be short. Refusals are recorded on the connector row, so Settings
 * and this screen agree.
 *
 * `today` is the viewer's date, from the browser — see `connectors.ts`.
 */

import { Hono } from 'hono'
import { and, gte, isNotNull } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities } from '../db/schema'
import { scoped, type TenantId } from '../db/scope'
import { readGigs } from '../db/gigRows'
import type { Env } from '../types'
import { tenantOf, type AppEnv } from '../context'
import { decryptToken } from '../lib/googleGrant'
import { fetchWindow, loadRow, recordProbe } from './connectors'
import { readProfile } from './manitobaMusic'
import { normaliseGigStatus } from '../../shared/gigStatus'
import { mergeShows, type ShowSource, type SourceShow } from '../../shared/showMerge'
import { calendarFeedUrl, eventsFor, parseCalendarFeed } from '../../shared/mmCalendar'

const shows = new Hono<AppEnv>()

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function yearBefore(today: string): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

interface SourceState {
  source: ShowSource
  /** working | rejected | unreachable */
  status: string
  note: string | null
}

/**
 * Every source, read and merged, for one tenant. A function rather than only
 * a route because the public EPK needs the same list — the shows a programmer
 * sees are the ones the artist sees.
 */
export async function collectShows(env: Env, tenant: TenantId, today: string) {

  const [bitRow, mmRow] = await Promise.all([loadRow(env, tenant), loadRow(env, tenant, 'manitoba_music')])
  const connected: ShowSource[] = []
  const states: SourceState[] = []
  const collected: SourceShow[] = []

  const bandsintown = async () => {
    if (!bitRow?.secret) return
    connected.push('bandsintown')
    const key = await decryptToken(env, bitRow.secret)
    const [ahead, behind] = await Promise.all([
      fetchWindow(bitRow.account, key, 'upcoming', today),
      fetchWindow(bitRow.account, key, 'past', today),
    ])
    const worst = [ahead, behind].find((p) => p.verdict === 'rejected') ?? [ahead, behind].find((p) => p.verdict === 'unreachable')
    if (worst || bitRow.status !== 'working') await recordProbe(env, tenant, worst ?? ahead)
    states.push({ source: 'bandsintown', status: worst?.verdict ?? 'working', note: worst?.note ?? null })
    for (const s of [...ahead.shows, ...behind.shows]) {
      collected.push({
        source: 'bandsintown',
        date: s.date,
        time: s.time,
        title: s.title,
        venue: s.venue,
        location: s.location,
        url: s.url,
        hasTickets: s.hasTickets,
        withArtists: s.withArtists,
      })
    }
  }

  const manitobaMusic = async () => {
    if (!mmRow) return
    connected.push('manitoba_music')
    const read = await readProfile(mmRow.account)
    if (!read.ok) {
      states.push({ source: 'manitoba_music', status: read.verdict, note: read.error })
      return
    }
    states.push({ source: 'manitoba_music', status: 'working', note: null })
    for (const s of read.profile.shows) {
      collected.push({
        source: 'manitoba_music',
        date: s.date,
        time: s.time,
        title: s.title,
        venue: s.venue,
        location: s.location,
        url: s.url,
      })
    }
    // After the profile's own rows, so an event on both is labelled as the
    // profile listing it — the one the artist keeps.
    await calendar(read.profile.name)
  }

  /**
   * Shows on the province's calendar that bill the artist by the name on
   * their profile — the name they confirmed was theirs. Upcoming only; a
   * failure is reported and costs only this source.
   */
  const calendar = async (name: string) => {
    try {
      const res = await fetch(calendarFeedUrl(name), {
        headers: { 'User-Agent': 'SunDogsMusicScout/1.0 (+https://scout.sundogsmusic.ca)', Accept: 'application/rss+xml' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        states.push({ source: 'manitoba_calendar', status: 'unreachable', note: `The calendar answered ${res.status}.` })
        return
      }
      states.push({ source: 'manitoba_calendar', status: 'working', note: null })
      for (const e of eventsFor(parseCalendarFeed(await res.text()), name)) {
        collected.push({
          source: 'manitoba_calendar',
          date: e.date!,
          time: e.time,
          title: e.event ?? e.lineup.join(', '),
          venue: e.venue,
          location: e.city,
          url: e.url,
        })
      }
    } catch (err) {
      states.push({ source: 'manitoba_calendar', status: 'unreachable', note: err instanceof Error ? err.message : 'No answer.' })
    }
  }

  const booked = async () => {
    const rows = await getDb(env.DB)
      .select()
      .from(gigOpportunities)
      .where(
        scoped(
          gigOpportunities,
          tenant,
          and(isNotNull(gigOpportunities.performanceStart), gte(gigOpportunities.performanceStart, yearBefore(today))),
        ),
      )
      .then(readGigs)
    for (const g of rows) {
      const date = (g.performanceStart ?? '').slice(0, 10)
      if (normaliseGigStatus(g.status) !== 'booked' || !ISO_DATE.test(date)) continue
      collected.push({
        source: 'scout',
        date,
        time: null,
        title: g.name,
        venue: null,
        location: g.location ?? null,
        url: null,
        gigId: g.id,
      })
    }
  }

  await Promise.all([bandsintown(), manitobaMusic(), booked()])
  const { upcoming, past } = mergeShows(collected, { today, connected })
  return { connected, sources: states, upcoming, past }
}

shows.get('/', async (c) => {
  const q = c.req.query('today') ?? ''
  const today = ISO_DATE.test(q) ? q : new Date().toISOString().slice(0, 10)
  return c.json(await collectShows(c.env, tenantOf(c), today))
})

export default shows
