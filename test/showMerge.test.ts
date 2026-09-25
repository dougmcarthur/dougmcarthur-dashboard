import { describe, expect, it } from 'vitest'
import { distinctive, mergeShows, type SourceShow } from '../shared/showMerge'

const TODAY = '2026-09-24'
const ALL = { today: TODAY, connected: ['bandsintown', 'manitoba_music'] as const }
const opts = { today: TODAY, connected: [...ALL.connected] }

// The real pair from both sources, 2026-09-24.
const BIT: SourceShow = {
  source: 'bandsintown',
  date: '2026-10-06',
  time: '19:00',
  title: 'Songwriter Showcase 5 w/ Jana Jacobs, Shannon Chapman, Amber Rose & Melody Pearson-Munroe',
  venue: 'Songwriter Showcase 5 w/ Jana Jacobs, Shannon Chapman, Amber Rose & Melody Pearson-Munroe',
  location: 'Winnipeg, MB',
  url: 'https://www.bandsintown.com/t/108877229',
  hasTickets: true,
  withArtists: ['Shannon Chapman Music'],
}
const MM: SourceShow = {
  source: 'manitoba_music',
  date: '2026-10-06',
  time: '19:00',
  title: 'Songwriter Showcase 5',
  venue: 'The Handsome Daughter',
  location: 'Winnipeg, MB',
  url: 'https://www.manitobamusic.com/livemusic/display,event/113056/songwriter-showcase-5',
}

describe('the same show from two sources', () => {
  const { upcoming } = mergeShows([BIT, MM], opts)

  it('becomes one row', () => {
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0].sources.sort()).toEqual(['bandsintown', 'manitoba_music'])
  })

  it('takes the short title, the real venue and the ticket link', () => {
    expect(upcoming[0]).toMatchObject({
      title: 'Songwriter Showcase 5',
      venue: 'The Handsome Daughter',
      location: 'Winnipeg, MB',
      time: '19:00',
      ticketUrl: 'https://www.bandsintown.com/t/108877229',
    })
  })

  it('keeps one link per source, and is missing from nothing', () => {
    expect(upcoming[0].links.map((l) => l.source).sort()).toEqual(['bandsintown', 'manitoba_music'])
    expect(upcoming[0].missingFrom).toEqual([])
  })
})

describe('what a listing is missing', () => {
  it('names the connected listing an upcoming show is not on', () => {
    const [only] = mergeShows([MM], opts).upcoming
    expect(only.missingFrom).toEqual(['bandsintown'])
  })

  it('only counts listings that are connected', () => {
    const [only] = mergeShows([MM], { today: TODAY, connected: ['manitoba_music'] }).upcoming
    expect(only.missingFrom).toEqual([])
  })

  it('never says a show is missing from Scout, and says nothing about the past', () => {
    const gig: SourceShow = { source: 'scout', date: '2026-11-01', time: null, title: 'Folk Fest', venue: null, location: 'Winnipeg, MB', url: null, gigId: 7 }
    expect(mergeShows([gig], opts).upcoming[0].missingFrom).toEqual(['bandsintown', 'manitoba_music'])
    expect(mergeShows([{ ...MM, date: '2026-01-01' }], opts).past[0].missingFrom).toEqual([])
  })
})

describe('what is not the same show', () => {
  it('keeps different dates apart', () => {
    expect(mergeShows([BIT, { ...MM, date: '2026-10-07' }], opts).upcoming).toHaveLength(2)
  })

  it('never folds two rows from one source together', () => {
    const early = { ...MM, title: 'Songwriter Showcase 5 matinee', time: '14:00', url: 'a' }
    expect(mergeShows([MM, early], opts).upcoming).toHaveLength(2)
  })

  it('matches on the city alone only when each source has one show that day', () => {
    const a: SourceShow = { ...BIT, title: 'An evening', venue: 'The Park Theatre' }
    const b: SourceShow = { ...MM, title: 'Doug McArthur', venue: 'Park Theatre' }
    // "Park" and "theatre" are shared, so this one matches on words.
    expect(mergeShows([a, b], opts).upcoming).toHaveLength(1)

    const c: SourceShow = { ...BIT, title: 'Album release', venue: 'Times Change(d)' }
    const d: SourceShow = { ...MM, title: 'Doug McArthur', venue: 'Good Will Social Club' }
    expect(mergeShows([c, d], opts).upcoming).toHaveLength(1)

    const e: SourceShow = { ...MM, title: 'Afternoon workshop', venue: 'West End Cultural Centre', url: 'x' }
    expect(mergeShows([c, d, e], opts).upcoming).toHaveLength(3)
  })

  it('does not match two cities', () => {
    const c: SourceShow = { ...BIT, title: 'Album release', venue: 'Times Change(d)' }
    const d: SourceShow = { ...MM, title: 'Doug McArthur', venue: 'Amigos', location: 'Saskatoon, SK' }
    expect(mergeShows([c, d], opts).upcoming).toHaveLength(2)
  })
})

describe('a gig booked in Scout', () => {
  it('merges with its public listing and keeps the gig id', () => {
    const gig: SourceShow = { source: 'scout', date: '2026-10-06', time: null, title: 'Songwriter Showcase 5', venue: null, location: 'Winnipeg', url: null, gigId: 12 }
    const [row] = mergeShows([gig, BIT, MM], opts).upcoming
    expect(row.sources.sort()).toEqual(['bandsintown', 'manitoba_music', 'scout'])
    expect(row.gigId).toBe(12)
    expect(row.title).toBe('Songwriter Showcase 5')
  })
})

it('orders upcoming soonest first and past most recent first, with today upcoming', () => {
  const shows: SourceShow[] = ['2026-09-01', '2026-09-20', TODAY, '2026-12-01'].map((date, i) => ({ ...MM, date, url: String(i), title: `Show ${i}`, venue: `Venue ${i}` }))
  const { upcoming, past } = mergeShows(shows, opts)
  expect(upcoming.map((s) => s.date)).toEqual([TODAY, '2026-12-01'])
  expect(past.map((s) => s.date)).toEqual(['2026-09-20', '2026-09-01'])
})

it('reads distinctive words without accents, punctuation or filler', () => {
  expect([...distinctive('Festival du Voyageur — Live at the Fort Gibraltar')]).toEqual(['festival', 'voyageur', 'fort', 'gibraltar'])
  expect([...distinctive('Showcase 5')]).toEqual(['showcase', '5'])
})

describe('the Manitoba Music calendar', () => {
  const CAL: SourceShow = {
    source: 'manitoba_calendar',
    date: '2026-10-06',
    time: null,
    title: 'Songwriter Showcase 5',
    venue: 'The Handsome Daughter',
    location: 'Winnipeg',
    url: MM.url,
  }

  it('folds into the profile listing of the same event page, with one link', () => {
    const [row] = mergeShows([BIT, MM, CAL], opts).upcoming
    expect(row.sources.sort()).toEqual(['bandsintown', 'manitoba_calendar', 'manitoba_music'])
    expect(row.links.map((l) => l.url)).toEqual([BIT.url, MM.url])
  })

  it('says a show a venue posted is missing from the artist’s own listings, never from the calendar', () => {
    const [row] = mergeShows([CAL], opts).upcoming
    expect(row.missingFrom).toEqual(['bandsintown', 'manitoba_music'])
  })
})
