import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calendarDate, calendarFeedUrl, eventsFor, parseCalendarFeed, sameName } from '../shared/mmCalendar'

// Three real items from manitobamusic.com/livemusic.rss, 2026-09-24.
const FEED = readFileSync('test/fixtures/manitoba-music-calendar.rss', 'utf8')

describe('the feed address', () => {
  it('is the one the calendar’s own search form redirects to, plus .rss', () => {
    expect(calendarFeedUrl('Doug McArthur')).toBe('https://www.manitobamusic.com/livemusic/keyword:Doug+McArthur.rss')
  })

  it('encodes what would change the path', () => {
    expect(calendarFeedUrl('  Sigur Rós  ')).toBe('https://www.manitobamusic.com/livemusic/keyword:Sigur+R%C3%B3s.rss')
    expect(calendarFeedUrl('AC/DC')).toBe('https://www.manitobamusic.com/livemusic/keyword:ACDC.rss')
  })
})

describe('reading the feed', () => {
  const events = parseCalendarFeed(FEED)

  it('reads the event name, line-up, date and venue', () => {
    expect(events[0]).toMatchObject({
      url: 'https://www.manitobamusic.com/livemusic/display,event/113056/songwriter-showcase-5',
      date: '2026-10-06',
      event: 'Songwriter Showcase 5',
      lineup: ['Jana Jacobs', 'Shannon Chapman', 'Amber Rose', 'Melody Pearson-Munroe', 'Doug McArthur'],
      venue: 'The Handsome Daughter',
      city: 'Winnipeg',
    })
  })

  it('reads a title with no event name as the act itself', () => {
    const bare = events.find((e) => e.lineup[0] === 'Tyler Hilton')!
    expect(bare.event).toBeNull()
    expect(bare.lineup).toEqual(['Tyler Hilton'])
  })

  it('reads set times when the listing gives them', () => {
    const belles = events.find((e) => e.event === "Live at Belle's")!
    expect(belles.setTimes['Derek Robertson']).toBe('11:45')
    expect(belles.setTimes['The Barnyards']).toBe('17:00')
  })

  it('reads the calendar’s two-digit dates, and refuses what is not one', () => {
    expect(calendarDate('6 Oct 26')).toBe('2026-10-06')
    expect(calendarDate('24 Sep 2026')).toBe('2026-09-24')
    expect(calendarDate('Tuesday, October 6')).toBeNull()
    expect(calendarDate('6 Foo 26')).toBeNull()
  })
})

describe('which events are the artist’s', () => {
  const events = parseCalendarFeed(FEED)

  it('keeps an event whose line-up names the artist', () => {
    expect(eventsFor(events, 'Doug McArthur').map((e) => e.event)).toEqual(['Songwriter Showcase 5'])
  })

  it('drops what the keyword search matched for another reason', () => {
    // The search is a substring match: "McArthur" alone would return both.
    const other = { ...events[0], lineup: ['Mary McArthur'] }
    expect(eventsFor([other], 'Doug McArthur')).toEqual([])
    // A name in the description is prose, not billing.
    const hosted = { ...events[0], lineup: ['Jana Jacobs'] }
    expect(eventsFor([hosted], 'Doug McArthur')).toEqual([])
  })

  it('takes the artist’s own set time when one is listed', () => {
    const belles = events.find((e) => e.event === "Live at Belle's")!
    expect(eventsFor([belles], 'derek robertson')[0].time).toBe('11:45')
  })

  it('compares names without case, accents or punctuation', () => {
    expect(sameName('Doug McArthur', 'doug mcarthur')).toBe(true)
    expect(sameName('Beyoncé', 'Beyonce')).toBe(true)
    expect(sameName('Simon & Garfunkel', 'Simon and Garfunkel')).toBe(true)
    expect(sameName('Doug McArthur', 'Doug McArthur Band')).toBe(false)
    expect(sameName('', '')).toBe(false)
  })
})
