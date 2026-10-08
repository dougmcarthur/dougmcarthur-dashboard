import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { parseListing } from '../shared/listingParse'

/**
 * Reading a page of calls, against SaskMusic's "Opportunities / Deadlines" as
 * it was served on 2026-10-06 — seven dated entries and three undated ones, cut
 * from the real page with its navigation left in. The navigation is the point
 * of half of these: a reader that took every link on the page would file
 * "Meet the Board" as an opportunity.
 */

const BASE = 'https://www.saskmusic.org/news/sound-opportunities'
const html = readFileSync('test/fixtures/sources/saskmusic-opportunities.html', 'utf8')

describe('SaskMusic’s opportunities page', () => {
  const items = parseListing(html, BASE)

  it('finds the ten entries and nothing from the navigation', () => {
    expect(items).toHaveLength(10)
    const titles = items.map((i) => i.title).join('\n')
    expect(titles).not.toMatch(/About Us|Meet the Board|Membership|Live Music Listings|Read More/)
  })

  it('reads a headline, a deadline line and a place from one entry', () => {
    expect(items[0]).toMatchObject({
      title: 'Artist Opportunity - OUTER LIMITS SHOW SERIES',
      deadlineText: 'October 6, 2026',
      place: 'Calgary, Alberta',
      url: 'https://www.saskmusic.org/news/sound-opportunities/view,article/7812/artist-opportunity-outer-limits-show-series',
    })
    expect(items[0].blurb.startsWith('Outer Limits is Music Calgary')).toBe(true)
  })

  it('keeps every deadline as the words it was written in', () => {
    const dated = items.filter((i) => i.deadlineText)
    expect(dated).toHaveLength(7)
    expect(dated.map((i) => i.deadlineText).slice(0, 3)).toEqual(['October 6, 2026', 'October 7, 2026', 'October 13, 2026'])
  })

  it('reads an undated entry as undated, and not as an error', () => {
    const undated = items.filter((i) => !i.deadlineText)
    expect(undated).toHaveLength(3)
    expect(undated.every((i) => i.title.length > 4)).toBe(true)
  })

  it('makes every address absolute, once', () => {
    const urls = items.map((i) => i.url)
    expect(urls.every((u) => u.startsWith('https://www.saskmusic.org/news/sound-opportunities/view,article/'))).toBe(true)
    expect(new Set(urls).size).toBe(urls.length)
  })
})

describe('a listing found by its markup, not its site', () => {
  it('reads a card whose link wraps the heading', () => {
    const items = parseListing(
      `<main><a href="/calls/1"><h3>Open Call: Winter Showcase</h3></a><p>Deadline: Dec 1, 2026</p>
       <a href="/calls/2"><h3>Spring Residency</h3></a><p>Closes - Jan 15, 2027</p></main>`,
      'https://x.example/',
    )
    expect(items.map((i) => [i.title, i.deadlineText])).toEqual([
      ['Open Call: Winter Showcase', 'Dec 1, 2026'],
      ['Spring Residency', 'Jan 15, 2027'],
    ])
  })

  it('takes the closing words in the shapes people write them', () => {
    const entry = (line: string) =>
      parseListing(`<h2><a href="/a">A call worth reading</a></h2><p>${line}</p>`, 'https://x.example/')[0].deadlineText
    expect(entry('Deadline: Oct 6, 2026')).toBe('Oct 6, 2026')
    expect(entry('Application deadline - November 20')).toBe('November 20')
    expect(entry('Closes: 2026-12-01')).toBe('2026-12-01')
    expect(entry('Due date: Dec 15, 2026')).toBe('Dec 15, 2026')
  })

  it('does not take a date from a sentence that merely mentions a deadline', () => {
    const [item] = parseListing(
      '<h2><a href="/a">Festival news</a></h2><p>We extended the deadline last week to October 9, 2026 for everybody.</p>',
      'https://x.example/',
    )
    expect(item.deadlineText).toBeNull()
  })

  it('ignores links that are not pages', () => {
    const items = parseListing(
      `<h2><a href="mailto:a@b.example">Email us</a></h2><h2><a href="javascript:void(0)">Do a thing</a></h2>
       <h2><a href="/real">A real entry here</a></h2>`,
      'https://x.example/',
    )
    expect(items.map((i) => i.title)).toEqual(['A real entry here'])
  })

  it('skips a button that was made a heading', () => {
    const items = parseListing('<h3><a href="/a">Read more</a></h3><h3><a href="/b">An actual title</a></h3>', 'https://x.example/')
    expect(items.map((i) => i.title)).toEqual(['An actual title'])
  })

  it('leaves out headings in the navigation, footer and sidebar', () => {
    const items = parseListing(
      `<nav><h3><a href="/menu">Menu heading</a></h3></nav>
       <aside><h3><a href="/side">Sidebar heading</a></h3></aside>
       <h2><a href="/call">The call itself</a></h2>
       <footer><h3><a href="/foot">Footer heading</a></h3></footer>`,
      'https://x.example/',
    )
    expect(items.map((i) => i.title)).toEqual(['The call itself'])
  })

  it('lists a call once when the page links it twice', () => {
    const items = parseListing(
      '<h2><a href="/call">The call itself</a></h2><h2><a href="/call#top">The call itself again</a></h2>',
      'https://x.example/',
    )
    expect(items).toHaveLength(1)
  })

  it('reads nothing from a page with no such structure, rather than guessing', () => {
    expect(parseListing('<html><body><p>Members only. Please sign in.</p><a href="/login">Log in</a></body></html>', 'https://x.example/')).toEqual([])
    expect(parseListing('', 'https://x.example/')).toEqual([])
  })
})

describe('a news list with its dates beside it', () => {
  // MusicOntario's news index as served on 2026-10-06: nine rows of
  // `<li><a>Title</a><span>August 19, 2026</span></li>`, with the site's
  // navigation — also lists of links — left in.
  const BASE_ON = 'https://music-ontario.ca/news'
  const items = parseListing(readFileSync('test/fixtures/sources/musicontario-news.html', 'utf8'), BASE_ON)

  it('reads each row as an item, and none of the navigation', () => {
    expect(items).toHaveLength(9)
    expect(items.every((i) => i.url.startsWith('https://music-ontario.ca/news/recent-news/read,article/'))).toBe(true)
  })

  it('keeps the date as the date it was posted, and not as a deadline', () => {
    expect(items[0]).toMatchObject({ title: 'Reeperbahn 2026: Check out the Ontario lineup', postedText: 'August 19, 2026', deadlineText: null })
    expect(items.map((i) => i.postedText)).toContain('July 13, 2026')
  })

  it('needs the date: a menu is a list of links too', () => {
    const items = parseListing(
      `<ul><li><a href="/about">About the association</a></li><li><a href="/news">Latest news and notices</a></li></ul>`,
      'https://x.example/',
    )
    expect(items).toEqual([])
  })

  it('needs the date beside the link, not inside it', () => {
    const items = parseListing(
      `<ul><li><a href="/a">The 2026 Awards - Submissions close June 3, 2026</a></li></ul>`,
      'https://x.example/',
    )
    expect(items).toEqual([])
  })

  it('does not take a row that holds several links', () => {
    expect(
      parseListing(
        `<ul><li><a href="/a">First thing worth reading</a> and <a href="/b">second thing worth reading</a> June 3, 2026</li></ul>`,
        'https://x.example/',
      ),
    ).toEqual([])
  })

  it('reads the other ways a page writes a date', () => {
    const date = (text: string) =>
      parseListing(`<ul><li><a href="/a">A headline long enough to count</a> <span>${text}</span></li></ul>`, 'https://x.example/')[0]?.postedText
    expect(date('19 August 2026')).toBe('19 August 2026')
    expect(date('2026-08-19')).toBe('2026-08-19')
    expect(date('Sept. 3rd, 2026')).toBe('Sept. 3rd, 2026')
    expect(date('last Tuesday')).toBeUndefined()
  })
})
