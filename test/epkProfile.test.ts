import { describe, expect, it } from 'vitest'
import { buildPublicEpk } from '../shared/publicEpk'
import { epkProfile, plain, platformOf, readGenre, readHighlights, readQuote } from '../shared/epkProfile'
import type { ArtistAsset } from '../shared/artistAssets'

const TODAY = '2026-09-25'
let n = 0
function asset(over: Partial<ArtistAsset> & Pick<ArtistAsset, 'kind' | 'label' | 'value'>): ArtistAsset {
  n++
  return {
    id: n, questionKind: null, variant: null, charCount: null, credit: null, usageRights: null,
    reviewBy: '2027-06-01', source: null, notes: null, sortOrder: 0, archived: 0,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-10T00:00:00Z',
    ...over,
  }
}

// The shapes production holds, as the artist brief wrote them.
const NAME = '**Doug McArthur**\nSinger-songwriter · Winnipeg, MB, Canada\nActive since ~2001 (bands); solo artist since 2023'
const GENRE =
  'Alt-pop / indie singer-songwriter, rooted in 90s alt-rock with modern production polish.\n\n' +
  'For Fans Of (FFO): Ben Howard, Hozier, The Paper Kites\n\n' +
  'Core influences: Oasis, Third Eye Blind, Incubus'
const QUOTE = '"Hermit Phase transcends time and space."\n— Nicole Mendes, The Other Side Reviews'
const PRESS = 'Reviews: The Other Side Reviews reviewed "Hermit Phase."\n\nRadio: Power 97 Winnipeg; CBC.'

function library(): ArtistAsset[] {
  return [
    asset({ kind: 'fact', label: 'Artist Name', value: NAME, questionKind: 'artist_name' }),
    asset({ kind: 'fact', label: 'Genre', value: GENRE, questionKind: 'genre' }),
    asset({ kind: 'fact', label: 'Press Quote', value: QUOTE, questionKind: 'press_quote' }),
    asset({ kind: 'fact', label: 'Press Coverage', value: PRESS, questionKind: 'career_highlights' }),
    asset({ kind: 'fact', label: 'Email', value: 'a@b.c', questionKind: 'email' }),
    asset({ kind: 'bio', label: 'Voice in One Sentence', value: 'Warm, direct, a little nerdy.', questionKind: 'one_liner', source: 'writing-style-guide#Voice in One Sentence' }),
    asset({ kind: 'bio', label: 'One-line description', value: 'Winnipeg singer-songwriter with a soulful voice.', questionKind: 'one_liner', source: 'written' }),
    asset({ kind: 'bio', label: 'Bio', value: 'word '.repeat(97).trim(), questionKind: 'bio' }),
    asset({ kind: 'bio', label: 'Approved Short Bio', value: 'word '.repeat(130).trim(), questionKind: 'bio', variant: '150 words — Manitoba Music / Grant Applications' }),
    asset({ kind: 'link', label: 'Spotify', value: 'https://open.spotify.com/artist/4E4h', questionKind: 'spotify' }),
    asset({ kind: 'link', label: 'YouTube', value: 'https://www.youtube.com/@DougMcArthurMusic', questionKind: 'youtube' }),
    asset({ kind: 'link', label: 'Twitter/X', value: 'https://www.twitter.com/dougmcarthur' }),
    asset({ kind: 'link', label: 'Links hub', value: 'https://links.dougmcarthur.net' }),
    asset({ kind: 'link', label: 'Website', value: 'https://dougmcarthur.net', questionKind: 'website' }),
    asset({ kind: 'link', label: 'Private demos', value: 'https://music.dougmcarthur.net' }),
    asset({ kind: 'link', label: 'Sync pitch page', value: 'https://magic.dougmcarthur.net' }),
  ]
}

describe('what crosses to the public page', () => {
  const pub = buildPublicEpk(library(), { audience: 'festival', today: TODAY })

  it('publishes the press quote and highlights, and still keeps the email', () => {
    expect(pub.facts.map((f) => f.label)).toContain('Press Quote')
    expect(pub.facts.map((f) => f.label)).toContain('Press Coverage')
    expect(pub.withheld).toContainEqual({ label: 'Email', kind: 'fact', reason: 'private' })
  })

  it('never publishes a link its own label calls private', () => {
    expect(pub.links.map((l) => l.label)).not.toContain('Private demos')
    expect(pub.withheld).toContainEqual({ label: 'Private demos', kind: 'link', reason: 'private' })
  })

  it('keeps a sync pitch page to the sync version', () => {
    expect(pub.links.map((l) => l.label)).not.toContain('Sync pitch page')
    const sync = buildPublicEpk(library(), { audience: 'sync', today: TODAY })
    expect(sync.links.map((l) => l.label)).toContain('Sync pitch page')
  })

  it('keeps the writing style guide off the page, and one-liners out of the bios', () => {
    expect(pub.withheld).toContainEqual({ label: 'Voice in One Sentence', kind: 'bio', reason: 'style_guide' })
    expect(pub.bios.map((b) => b.label)).toEqual(['Bio', 'Approved Short Bio'])
    expect(pub.taglines.map((t) => t.label)).toEqual(['One-line description'])
  })
})

describe('the page reads the library along its seams', () => {
  const p = epkProfile(buildPublicEpk(library(), { audience: 'festival', today: TODAY }), 'Doug')

  it('takes the name from the library over the account label, without the markdown', () => {
    expect(p.name).toBe('Doug McArthur')
    expect(p.descriptor).toEqual(['Singer-songwriter · Winnipeg, MB, Canada', 'Active since ~2001 (bands); solo artist since 2023'])
  })

  it('falls back to the account name when the library has none', () => {
    expect(epkProfile(buildPublicEpk([], { audience: 'festival', today: TODAY }), 'Doug').name).toBe('Doug')
  })

  it('splits the genre paragraph from the lists that ride with it', () => {
    expect(p.genre).toBe('Alt-pop / indie singer-songwriter, rooted in 90s alt-rock with modern production polish')
    expect(p.fansOf).toEqual(['Ben Howard', 'Hozier', 'The Paper Kites'])
    expect(p.influences).toEqual(['Oasis', 'Third Eye Blind', 'Incubus'])
  })

  it('leaves the headline facts out of the at-a-glance list', () => {
    expect(p.glance).toEqual([])
  })

  it('names bio lengths, and opens on the one nearest a hundred words', () => {
    expect(p.bios.map((b) => `${b.label}:${b.words}`)).toEqual(['Short:97', 'Long:130'])
    expect(p.bioIndex).toBe(0)
  })

  it('uses the hand-written one-liner as the tagline', () => {
    expect(p.tagline).toBe('Winnipeg singer-songwriter with a soulful voice.')
  })

  it('groups links by what a stranger does with them, website first among the rest', () => {
    expect(p.links.listen.map((l) => l.label)).toEqual(['Spotify'])
    expect(p.links.watch.map((l) => l.label)).toEqual(['YouTube'])
    expect(p.links.follow.map((l) => l.label)).toEqual(['X'])
    expect(p.links.more.map((l) => l.label)).toEqual(['Website', 'Links hub'])
  })

  it('reads the quote and its source, and the highlights by label', () => {
    expect(p.quotes).toEqual([{ text: 'Hermit Phase transcends time and space.', source: 'Nicole Mendes, The Other Side Reviews' }])
    expect(p.highlights.map((h) => h.label)).toEqual(['Reviews', 'Radio'])
  })
})

describe('parsers', () => {
  it('strips markdown and nothing else', () => {
    expect(plain('**Bold** and _it_ and [a link](https://x) and `code`')).toBe('Bold and it and a link and code')
    expect(plain('singer_songwriter_2024')).toBe('singer_songwriter_2024')
  })

  it('uses a value with no seams whole', () => {
    expect(readGenre('Folk')).toEqual({ genre: 'Folk', fansOf: [], influences: [] })
    expect(readQuote('"Great show."')).toEqual({ text: 'Great show.', source: null })
    expect(readQuote('"Great show." — CBC')).toEqual({ text: 'Great show.', source: 'CBC' })
    expect(readHighlights('Played Folk Fest 2024.')).toEqual([{ label: null, text: 'Played Folk Fest 2024.' }])
  })

  it('knows a platform by its host, not its label', () => {
    expect(platformOf('https://x.com/doug')?.platform).toBe('twitter')
    expect(platformOf('https://dougmcarthurmusic.bandcamp.com')?.platform).toBe('bandcamp')
    expect(platformOf('https://notspotify.com.evil.net')).toBeNull()
    expect(platformOf('nope')).toBeNull()
  })
})
