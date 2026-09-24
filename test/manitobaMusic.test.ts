import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { linkLabel, parseProfile, profileUrl, proposalsFrom } from '../shared/manitobaMusic'

// A real profile, trimmed to its profile section, contact details removed.
const HTML = readFileSync('test/fixtures/manitoba-music-profile.html', 'utf8')

describe('only a profile address is accepted', () => {
  it('canonicalises what people paste', () => {
    for (const input of [
      'https://www.manitobamusic.com/profiles/view,499/dougmcarthur',
      'manitobamusic.com/profiles/view,499/dougmcarthur',
      'http://www.manitobamusic.com/profiles/view,499/DougMcArthur/',
      'https://www.manitobamusic.com/profiles/view,499/dougmcarthur?utm_source=x',
      'https://www.manitobamusic.com/profiles/view,499/dougmcarthur.rss',
      '  https://www.manitobamusic.com/profiles/view,499/dougmcarthur.ics ',
    ]) {
      expect(profileUrl(input)).toEqual({
        url: 'https://www.manitobamusic.com/profiles/view,499/dougmcarthur',
        slug: 'dougmcarthur',
      })
    }
  })

  it('refuses another site, and says so', () => {
    expect(profileUrl('https://www.manitobamusic.com.evil.test/profiles/view,499/x')).toMatchObject({
      error: expect.stringMatching(/not a Manitoba Music address/),
    })
    expect(profileUrl('https://dougmcarthur.net')).toHaveProperty('error')
  })

  it('refuses the site’s other pages, which would read as a profile wrongly', () => {
    for (const input of [
      'https://www.manitobamusic.com/news/read,article/9290/festival',
      'https://www.manitobamusic.com/profiles',
      'https://www.manitobamusic.com/profiles/view,499/',
      'https://www.manitobamusic.com/livemusic/display,event/113056/songwriter-showcase-5',
    ]) {
      expect(profileUrl(input), input).toMatchObject({ error: expect.stringMatching(/not a profile/) })
    }
  })

  it('asks for something when given nothing', () => {
    expect(profileUrl('   ')).toHaveProperty('error')
    expect(profileUrl('not a url at all ::')).toHaveProperty('error')
  })
})

describe('reading a profile', () => {
  const p = parseProfile(HTML)!

  it('finds the name, genres and primary photo', () => {
    expect(p.name).toBe('Doug McArthur')
    expect(p.genres).toEqual(['Alternative', 'Indie', 'Rock', 'Singer/songwriter'])
    expect(p.photo).toMatch(/^https:\/\/www\.manitobamusic\.com\/uploads\/organization\//)
  })

  it('reads the bio as paragraphs, with links reduced to their text and entities decoded', () => {
    expect(p.bio).toMatch(/^Doug McArthur is a prairie-born singer-songwriter/)
    expect(p.bio).toContain('“Stairway to Heaven.”')
    expect(p.bio).not.toMatch(/<a |&[a-z]+;/)
    expect(p.bio!.split('\n\n').length).toBeGreaterThan(3)
  })

  it('reads the Websites list, labelled by service', () => {
    expect(p.links.map((l) => l.label)).toEqual(['Website', 'Facebook', 'TikTok', 'Instagram', 'YouTube'])
  })

  it('reads videos by YouTube id, including the ones behind "See more"', () => {
    expect(p.videos).toHaveLength(7)
    expect(p.videos[1]).toEqual({ youtubeId: 'X0_3HaLBgKM', title: 'Magic (Choral Arrangement) | Live at The Forks' })
  })

  it('reads the discography, downloads, photos, shows and news', () => {
    expect(p.releases[0]).toMatchObject({ title: 'Lost Weekends', released: 'January 15, 2026' })
    expect(p.files.map((f) => f.label)).toEqual([
      'Stage Plot for Solo Performances - Doug McArthur',
      'Electronic Press Kit PDF - 2024',
    ])
    expect(p.photos).toHaveLength(3)
    expect(p.shows[0]).toMatchObject({ date: '2026-10-06', title: 'Songwriter Showcase 5' })
    expect(p.news.length).toBeGreaterThan(0)
  })

  it('says it cannot read a page that is not a profile, rather than an empty profile', () => {
    expect(parseProfile('<html><body><h1>Log in</h1></body></html>')).toBeNull()
    expect(parseProfile('<section class="directory-profile"><h1 class="title"></h1></section>')).toBeNull()
  })

  it('treats every section as optional', () => {
    const bare = parseProfile('<section class="directory-profile artist"><h1 class="title">Someone</h1></section>')!
    expect(bare).toMatchObject({ name: 'Someone', genres: [], bio: null, links: [], videos: [], photos: [] })
  })
})

describe('what it proposes for the library', () => {
  const { proposals, skipped } = proposalsFrom(parseProfile(HTML)!, 'dougmcarthur')

  it('files each thing once, keyed on what it is rather than where it sits', () => {
    const sources = proposals.map((p) => p.source)
    expect(new Set(sources).size).toBe(sources.length)
    expect(sources).toContain('manitoba-music:dougmcarthur#video:X0_3HaLBgKM')
    expect(sources.every((s) => s.startsWith('manitoba-music:dougmcarthur#'))).toBe(true)
  })

  it('maps each section to a kind of asset and the question it answers', () => {
    const by = (kind: string) => proposals.filter((p) => p.kind === kind)
    expect(by('bio')[0]).toMatchObject({ questionKind: 'bio', variant: 'Manitoba Music' })
    expect(by('fact')[0]).toMatchObject({ label: 'Genre', value: 'Alternative, Indie, Rock, Singer/songwriter' })
    expect(by('video')[0].value).toBe('https://www.youtube.com/watch?v=h8cfRdpyc18')
    expect(by('document').map((d) => d.questionKind)).toEqual(['tech_requirements', 'epk'])
    expect(by('audio')).toHaveLength(6)
  })

  it('files each photo once however many cache-busters it is served with, and asks for a credit', () => {
    const photos = proposals.filter((p) => p.kind === 'photo')
    expect(photos).toHaveLength(4)
    expect(photos.every((p) => /credit/.test(p.notes ?? ''))).toBe(true)
  })

  it('copies no contact details, and names what it left out', () => {
    expect(proposals.some((p) => /phone|email/i.test(p.label))).toBe(false)
    expect(skipped.map((s) => s.heading)).toEqual(['Contact', 'Shows', 'News'])
  })
})

it('labels links by service, and anything else as the artist’s website', () => {
  expect(linkLabel('https://open.spotify.com/artist/x')).toBe('Spotify')
  expect(linkLabel('https://dougmcarthurmusic.bandcamp.com/')).toBe('Bandcamp')
  expect(linkLabel('https://dougmcarthur.net/')).toBe('Website')
})
