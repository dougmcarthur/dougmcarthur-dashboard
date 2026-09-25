import { describe, expect, it } from 'vitest'
import { errorNote, eventsUrl, parseEvents, splitShows, verdictFor } from '../shared/bandsintown'

const TODAY = '2026-09-24'

// Trimmed from the shape rest.bandsintown.com returns.
const EVENT = {
  id: '1034567890',
  datetime: '2026-10-03T20:00:00',
  title: '',
  url: 'https://www.bandsintown.com/e/1034567890',
  free: false,
  lineup: ['Doug McArthur', 'Opening Act'],
  offers: [{ type: 'Tickets', url: 'https://www.bandsintown.com/t/1034567890', status: 'available' }],
  venue: { name: 'The Park Theatre', city: 'Winnipeg', region: 'MB', country: 'Canada', location: 'Winnipeg, MB' },
}

describe('the events URL', () => {
  it('carries the artist and the key, and asks for upcoming by default', () => {
    const url = new URL(eventsUrl('Doug McArthur', 'KEY', 'upcoming', TODAY))
    expect(url.pathname).toBe('/artists/Doug%20McArthur/events')
    expect(url.searchParams.get('app_id')).toBe('KEY')
    expect(url.searchParams.get('date')).toBe('upcoming')
  })

  it('bounds the past to the year before today, ending yesterday', () => {
    const url = new URL(eventsUrl('Doug McArthur', 'KEY', 'past', TODAY))
    expect(url.searchParams.get('date')).toBe('2025-09-24,2026-09-23')
  })

  it('encodes a name that would otherwise change the path', () => {
    expect(eventsUrl('AC/DC', 'k', 'upcoming', TODAY)).toContain('/artists/AC%2FDC/events')
  })
})

describe('reading events', () => {
  it('reads the date off the string, whatever the reader’s zone', () => {
    const [show] = parseEvents([{ ...EVENT, datetime: '2026-10-03T23:30:00' }])
    expect(show.date).toBe('2026-10-03')
    expect(show.time).toBe('23:30')
  })

  it('shapes a show for a screen', () => {
    expect(parseEvents([EVENT], 'Doug McArthur')).toEqual([
      {
        id: '1034567890',
        date: '2026-10-03',
        time: '20:00',
        venue: 'The Park Theatre',
        location: 'Winnipeg, MB',
        country: 'Canada',
        withArtists: ['Opening Act'],
        url: 'https://www.bandsintown.com/t/1034567890',
        hasTickets: true,
        free: false,
        title: null,
      },
    ])
  })

  it('falls back to the event page without an offer, and says there are no tickets', () => {
    const [show] = parseEvents([{ ...EVENT, offers: [] }])
    expect(show.url).toBe('https://www.bandsintown.com/e/1034567890')
    expect(show.hasTickets).toBe(false)
  })

  it('refuses a link that is not https', () => {
    const [show] = parseEvents([{ ...EVENT, offers: [{ url: 'javascript:alert(1)' }], url: 'http://x' }])
    expect(show.url).toBeNull()
  })

  it('takes the key out of every link Bandsintown returns', () => {
    // Real shape: Bandsintown echoes the caller's app_id into its event URLs.
    const [show] = parseEvents([
      {
        ...EVENT,
        offers: [],
        url: 'https://www.bandsintown.com/e/108877229?app_id=SECRET&came_from=267&utm_medium=api&utm_source=public_api&utm_campaign=event',
      },
    ])
    expect(show.url).toBe('https://www.bandsintown.com/e/108877229')
    const [ticket] = parseEvents([{ ...EVENT, offers: [{ url: 'https://www.bandsintown.com/t/1?app_id=SECRET&x=1' }] }])
    expect(ticket.url).toBe('https://www.bandsintown.com/t/1?x=1')
  })

  it('treats midnight as no stated time', () => {
    expect(parseEvents([{ ...EVENT, datetime: '2026-10-03T00:00:00' }])[0].time).toBeNull()
  })

  it('drops what it cannot date, and anything that is not a list', () => {
    expect(parseEvents([{ ...EVENT, datetime: 'soon' }, null, 'x'])).toEqual([])
    expect(parseEvents({ errorMessage: 'nope' })).toEqual([])
  })

  it('never stitches "TBA" into a location', () => {
    const [show] = parseEvents([{ ...EVENT, venue: { name: '', city: '', region: '' } }])
    expect(show.venue).toBe('Venue to be announced')
    expect(show.location).toBe('')
  })
})

describe('upcoming and past', () => {
  it('counts today as upcoming, and lists the past most recent first', () => {
    const shows = parseEvents([
      { ...EVENT, id: 'a', datetime: '2026-09-01T20:00:00' },
      { ...EVENT, id: 'b', datetime: '2026-09-20T20:00:00' },
      { ...EVENT, id: 'c', datetime: `${TODAY}T20:00:00` },
      { ...EVENT, id: 'd', datetime: '2026-12-01T20:00:00' },
    ])
    const { upcoming, past } = splitShows(shows, TODAY)
    expect(upcoming.map((s) => s.id)).toEqual(['c', 'd'])
    expect(past.map((s) => s.id)).toEqual(['b', 'a'])
  })
})

describe('what a response says about the key', () => {
  it('rates a refusal and an unknown artist as yours to fix, and a 5xx as no verdict', () => {
    expect(verdictFor(200)).toBe('working')
    expect(verdictFor(403)).toBe('rejected')
    expect(verdictFor(404)).toBe('rejected')
    expect(verdictFor(503)).toBe('unreachable')
    expect(verdictFor(429)).toBe('unreachable')
  })

  it('keeps Bandsintown’s own sentence, without its bracketed code', () => {
    expect(errorNote({ errorMessage: '[NotFound] The artist was not found' })).toBe('The artist was not found')
    expect(errorNote({ Message: 'User is not authorized to access this resource' })).toBe(
      'User is not authorized to access this resource',
    )
    expect(errorNote('x')).toBeNull()
  })
})
