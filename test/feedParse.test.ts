import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { MAX_ITEMS, SUMMARY_MAX, feedFormat, parseFeed } from '../shared/feedParse'

/**
 * Reading a feed, against feeds as five associations actually serve them.
 *
 * The fixtures in `test/fixtures/sources/` are captures taken on 2026-10-06,
 * with bodies cut short. Two of them are in the suite for what is *wrong* with
 * them: Music BC's is a republished email newsletter, and its newest item is
 * from February 2025.
 */

const fixture = (name: string) => readFileSync(`test/fixtures/sources/${name}`, 'utf8')

describe('an RSS feed as WordPress writes it', () => {
  const items = parseFeed(fixture('musicpei-feed.xml'))!

  it('reads every item, newest first', () => {
    expect(items).toHaveLength(10)
    expect(items[0].title).toBe('Music PEI Announces New Board of Directors for 2026/2027')
    expect(items[0].publishedAt).toBe('2026-08-20T17:59:47.000Z')
  })

  it('takes the page from <link> and the identity from <guid>', () => {
    expect(items[0].url).toBe('https://www.musicpei.com/2026/08/music-pei-announces-new-board-of-directors-for-2026-2027/')
    // The guid, not the address, is what stays the same if a page moves.
    expect(items[0].key).toBe('https://www.musicpei.com/?p=9848')
  })

  it('reads categories, with the CDATA taken off', () => {
    expect(items[0].categories).toEqual(['Board of Directors', 'Governance'])
  })

  it('makes the summary plain text, from the description', () => {
    expect(items[0].summary.startsWith('Music PEI is pleased to welcome four newly elected members')).toBe(true)
    expect(items[0].summary).not.toMatch(/[<>]|CDATA/)
    expect(items[0].summary.length).toBeLessThanOrEqual(SUMMARY_MAX)
  })

  it('has no event date, because a post is not an event', () => {
    expect(items.every((i) => i.eventAt === null && i.place === null)).toBe(true)
  })
})

describe('entities in titles', () => {
  it('decodes the numeric ones WordPress writes', () => {
    const titles = parseFeed(fixture('musicns-feed.xml'))!.map((i) => i.title)
    expect(titles).toContain('Weekly Newsletter – October 1')
    expect(titles.find((t) => t.startsWith('NOVA SCOTIA MUSIC WEEK: Full Lineup'))).toBe('NOVA SCOTIA MUSIC WEEK: Full Lineup & Schedule')
    expect(titles.join('')).not.toMatch(/&#\d+;|&amp;/)
  })
})

describe('a feed that is mostly one enormous field', () => {
  const body = fixture('musicbc-feed.xml')

  it('reads the title and date and cuts the body to what classifying needs', () => {
    const items = parseFeed(body)!
    expect(items).toHaveLength(3)
    // One headline per story, joined by pipes: the whole newsletter is the item.
    expect(items[0].title).toBe('E-News 02/20/25: Apply Now for Jumpstart Grants | 2025 JUNO Nominees & Events | WCMA Submissions')
    expect(items[0].publishedAt).toBe('2025-02-20T17:00:00.000Z')
    expect(items[0].summary.length).toBeLessThanOrEqual(SUMMARY_MAX)
  })

  it('does not slow down when the body is megabytes', () => {
    // Music BC's real feed is 1.6 MB for ten items; this is more than that.
    const huge = `<rss><channel>${Array.from({ length: 10 }, (_, i) =>
      `<item><title>Item ${i}</title><link>https://x.example/${i}</link><content:encoded><![CDATA[${'<p>word </p>'.repeat(30_000)}]]></content:encoded></item>`,
    ).join('')}</channel></rss>`
    expect(huge.length).toBeGreaterThan(3_000_000)
    const started = performance.now()
    const items = parseFeed(huge)!
    expect(items).toHaveLength(10)
    expect(items[0].summary.length).toBeLessThanOrEqual(SUMMARY_MAX)
    expect(performance.now() - started).toBeLessThan(1500)
  })
})

describe('how many items are read', () => {
  it('stops at the cap, because a feed that long is an archive', () => {
    const body = `<rss><channel>${Array.from({ length: MAX_ITEMS + 50 }, (_, i) => `<item><title>Post ${i}</title></item>`).join('')}</channel></rss>`
    expect(parseFeed(body)).toHaveLength(MAX_ITEMS)
  })

  it('skips an item with no title rather than inventing one', () => {
    const items = parseFeed('<rss><channel><item><link>https://x.example/a</link></item><item><title>Real</title></item></channel></rss>')!
    expect(items.map((i) => i.title)).toEqual(['Real'])
  })
})

describe('Atom', () => {
  const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Calls</title>
  <link rel="self" href="https://x.example/feed.atom"/>
  <entry>
    <title type="html">Call for Artists &amp;amp; Bands</title>
    <link rel="alternate" href="https://x.example/call-1"/>
    <link rel="edit" href="https://x.example/edit/1"/>
    <id>tag:x.example,2026:1</id>
    <published>2026-09-30T10:00:00-05:00</published>
    <updated>2026-10-01T00:00:00Z</updated>
    <summary>Applications close <b>November 1</b>.</summary>
    <category term="showcase"/>
  </entry>
</feed>`

  it('takes the alternate link, the id and the published date', () => {
    const [item] = parseFeed(atom)!
    expect(item.url).toBe('https://x.example/call-1')
    expect(item.key).toBe('tag:x.example,2026:1')
    expect(item.publishedAt).toBe('2026-09-30T15:00:00.000Z')
    expect(item.summary).toBe('Applications close November 1 .')
    expect(item.categories).toEqual(['showcase'])
  })

  it('is recognised, and not mistaken for RSS', () => {
    expect(feedFormat(atom)).toBe('atom')
  })
})

describe('iCal', () => {
  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:evt-1@x.example',
    'DTSTAMP:20261001T120000Z',
    'DTSTART;VALUE=DATE:20261015',
    'SUMMARY:Songwriters\\, showcase night',
    'LOCATION:The Pier\\, Charlottetown',
    'DESCRIPTION:Four acts. Doors at 7 and a very long line that',
    '  carries on over a fold.',
    'URL:https://x.example/events/1',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:evt-2@x.example',
    'DTSTART;TZID=America/Halifax:20261120T190000',
    'SUMMARY:Open mic',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  it('reads events, unescaping what iCal escapes', () => {
    const items = parseFeed(ical)!
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      key: 'evt-1@x.example',
      title: 'Songwriters, showcase night',
      url: 'https://x.example/events/1',
      place: 'The Pier, Charlottetown',
      publishedAt: '2026-10-01T12:00:00.000Z',
    })
  })

  it('joins a folded line', () => {
    expect(parseFeed(ical)![0].summary).toBe('Four acts. Doors at 7 and a very long line that carries on over a fold.')
  })

  it('gives an event the day it is on and never a guessed hour', () => {
    const items = parseFeed(ical)!
    expect(items[0].eventAt).toBe('2026-10-15')
    expect(items[1].eventAt).toBe('2026-11-20')
  })

  it('falls back to the address, then the title, for a key', () => {
    const bare = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Only a title\r\nEND:VEVENT\r\nEND:VCALENDAR'
    expect(parseFeed(bare)![0].key).toBe('Only a title')
  })
})

describe('something that is not a feed', () => {
  // Music PEI's calendar address answers 200 with nothing and a text/html type.
  it('is null for an empty body, so "not a feed" is not read as "an empty feed"', () => {
    expect(feedFormat('')).toBeNull()
    expect(parseFeed('')).toBeNull()
  })

  it('is null for a page', () => {
    expect(parseFeed('<!doctype html><html><head><title>Home</title></head><body><p>Hello</p></body></html>')).toBeNull()
  })

  it('is an empty list, and not null, for a feed with nothing in it', () => {
    expect(parseFeed('<?xml version="1.0"?><rss version="2.0"><channel><title>Quiet</title></channel></rss>')).toEqual([])
  })
})
