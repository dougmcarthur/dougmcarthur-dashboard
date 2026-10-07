import { describe, it, expect } from 'vitest'
import { buildAnswers, filterAnswers, MISSING_SHOWN, type AnswersFeed } from '../shared/answersAtHand'
import type { ArtistAsset } from '../shared/artistAssets'

/**
 * The library, cut for the moment a form is open.
 *
 * Dates are relative to the fixture's own TODAY, never the clock, and the same
 * entry is read on two different days to prove nothing here asks what day it is.
 */

const TODAY = '2026-10-07'
const dayOffset = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

let nextId = 1
function asset(o: Partial<ArtistAsset> & { label: string; kind: string }): ArtistAsset {
  return {
    id: nextId++,
    value: 'A value',
    questionKind: null,
    variant: null,
    charCount: null,
    credit: null,
    usageRights: null,
    reviewBy: dayOffset(200),
    source: 'manual',
    notes: null,
    sortOrder: 0,
    archived: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...o,
  }
}

const build = (assets: ArtistAsset[], asked: Record<string, number> = {}, today = TODAY) =>
  buildAnswers({ assets, asked, today })

const find = (feed: AnswersFeed, label: string) =>
  feed.groups.flatMap((g) => g.answers).find((a) => a.label === label)!

const groupOf = (feed: AnswersFeed, label: string) =>
  feed.groups.find((g) => g.answers.some((a) => a.label === label))?.id

describe('which group an entry is filed under', () => {
  it('files by what it is, and falls back on what its label asks', () => {
    const feed = build([
      asset({ kind: 'bio', label: 'Short bio', questionKind: 'bio' }),
      asset({ kind: 'photo', label: 'Barn photo', value: 'https://example.test/a.jpg', credit: 'A. Person' }),
      asset({ kind: 'document', label: 'Stage plot', value: 'https://example.test/plot.pdf' }),
      asset({ kind: 'video', label: 'Live session', value: 'https://example.test/v' }),
      asset({ kind: 'audio', label: 'Title track', value: 'https://example.test/a.mp3' }),
      asset({ kind: 'link', label: 'Website', value: 'https://example.test' }),
      asset({ kind: 'fact', label: 'Artist name', questionKind: 'artist_name' }),
      asset({ kind: 'fact', label: 'Press quote', questionKind: 'press_quote' }),
      asset({ kind: 'fact', label: 'Set length', questionKind: 'set_length' }),
      // Filed under a key the vocabulary does not know, as the seeded and
      // hand-typed entries are. The label still says what it is.
      asset({ kind: 'fact', label: 'Monthly listeners', questionKind: 'stat' }),
      asset({ kind: 'fact', label: 'Streams last year', questionKind: null }),
      asset({ kind: 'fact', label: 'Favourite colour', questionKind: null }),
    ])
    expect(groupOf(feed, 'Short bio')).toBe('story')
    expect(groupOf(feed, 'Barn photo')).toBe('photos')
    expect(groupOf(feed, 'Stage plot')).toBe('documents')
    expect(groupOf(feed, 'Live session')).toBe('links')
    expect(groupOf(feed, 'Title track')).toBe('links')
    expect(groupOf(feed, 'Website')).toBe('links')
    expect(groupOf(feed, 'Artist name')).toBe('about')
    expect(groupOf(feed, 'Press quote')).toBe('story')
    expect(groupOf(feed, 'Set length')).toBe('practical')
    expect(groupOf(feed, 'Monthly listeners')).toBe('numbers')
    expect(groupOf(feed, 'Streams last year')).toBe('numbers')
    expect(groupOf(feed, 'Favourite colour')).toBe('practical')
  })

  it('lists the groups in the order a person reaches for them, and leaves out the empty ones', () => {
    const feed = build([
      asset({ kind: 'photo', label: 'Photo', value: 'https://example.test/a.jpg', credit: 'x' }),
      asset({ kind: 'bio', label: 'Bio', questionKind: 'bio' }),
    ])
    expect(feed.groups.map((g) => g.id)).toEqual(['story', 'photos'])
  })

  it('leaves out an entry with nothing to copy, and an archived one', () => {
    const feed = build([
      asset({ kind: 'bio', label: 'Empty', value: '   ' }),
      asset({ kind: 'bio', label: 'Null', value: null }),
      asset({ kind: 'bio', label: 'Gone', archived: 1 }),
      asset({ kind: 'bio', label: 'Here' }),
    ])
    expect(feed.groups.flatMap((g) => g.answers.map((a) => a.label))).toEqual(['Here'])
    expect(feed.total).toBe(1)
  })
})

describe('what goes on the clipboard', () => {
  it('copies a bio as text, without the markdown it was written in', () => {
    const feed = build([asset({ kind: 'bio', label: 'Bio', questionKind: 'bio', value: '## About\n\n**Doug** writes *songs*.' })])
    expect(find(feed, 'Bio').copy).toBe('About\n\nDoug writes songs.')
  })

  it('copies the name from a name fact that is three lines, and offers the rest', () => {
    const feed = build([
      asset({ kind: 'fact', label: 'Artist Name', questionKind: 'artist_name', value: 'Doug McArthur\nFolk songwriter, Winnipeg\n45-minute solo set' }),
    ])
    const a = find(feed, 'Artist Name')
    expect(a.copy).toBe('Doug McArthur')
    expect(a.extras).toEqual([{ label: 'All lines', copy: 'Doug McArthur\nFolk songwriter, Winnipeg\n45-minute solo set' }])
  })

  it('offers no second button for a name that is one line', () => {
    const feed = build([asset({ kind: 'fact', label: 'Artist Name', questionKind: 'artist_name', value: 'Doug McArthur' })])
    expect(find(feed, 'Artist Name').extras).toEqual([])
  })

  it('copies the genre clause, and offers the lists that came with it', () => {
    const value = 'Folk and Americana, rooted in prairie storytelling.\n\nFor fans of: Gillian Welch, Ron Sexsmith\n\nInfluences: Gordon Lightfoot'
    const a = find(build([asset({ kind: 'fact', label: 'Genre', questionKind: 'genre', value })]), 'Genre')
    expect(a.copy).toBe('Folk and Americana, rooted in prairie storytelling')
    expect(a.extras[0].label).toBe('Everything')
    expect(a.extras[0].copy).toContain('Gillian Welch')
  })

  it('copies a link as the address, and a photo with its credit as a second thing to copy', () => {
    const feed = build([
      asset({ kind: 'link', label: 'Spotify', value: 'https://open.spotify.com/artist/abc' }),
      asset({ kind: 'photo', label: 'Barn', value: 'https://example.test/barn.jpg', credit: 'Photo by A. Photographer' }),
    ])
    expect(find(feed, 'Spotify').copy).toBe('https://open.spotify.com/artist/abc')
    expect(find(feed, 'Barn').copy).toBe('https://example.test/barn.jpg')
    expect(find(feed, 'Barn').extras).toEqual([{ label: 'Credit', copy: 'Photo by A. Photographer' }])
    expect(find(feed, 'Barn').preview).toBe('Photo by A. Photographer')
  })

  it('previews a link by where it goes, and a long text by its first lines', () => {
    const long = Array.from({ length: 80 }, () => 'word').join(' ')
    const feed = build([
      asset({ kind: 'link', label: 'Site', value: 'https://www.example.test/about/' }),
      asset({ kind: 'bio', label: 'Long', questionKind: 'bio', value: long }),
    ])
    expect(find(feed, 'Site').preview).toBe('example.test/about')
    expect(find(feed, 'Long').preview.length).toBeLessThanOrEqual(172)
    expect(find(feed, 'Long').preview.endsWith('…')).toBe(true)
    // The full text is what is copied, whatever is shown.
    expect(find(feed, 'Long').copy).toBe(long)
  })
})

describe('words', () => {
  it('counts a bio, because a form puts a limit on it', () => {
    const feed = build([asset({ kind: 'bio', label: 'Bio', questionKind: 'bio', value: 'one two three four five' })])
    expect(find(feed, 'Bio').words).toBe(5)
  })

  it('says nothing of the words in a hometown or a link', () => {
    const feed = build([
      asset({ kind: 'fact', label: 'Hometown', questionKind: 'hometown', value: 'Winnipeg, Manitoba' }),
      asset({ kind: 'link', label: 'Site', value: 'https://example.test' }),
    ])
    expect(find(feed, 'Hometown').words).toBeNull()
    expect(find(feed, 'Site').words).toBeNull()
  })

  it('drops a declared length from the name, since the count beside it is the true one', () => {
    const feed = build([
      asset({ kind: 'bio', label: 'Short bio (100 words)', questionKind: 'bio', value: 'a b c' }),
      asset({ kind: 'bio', label: 'Long bio (about 300 words, press)', questionKind: 'bio', value: 'a b c d' }),
    ])
    expect(feed.groups[0].answers.map((a) => a.label)).toEqual(['Short bio', 'Long bio'])
  })
})

describe('what is said before the paste', () => {
  it('calls a photo with no credit broken', () => {
    const a = find(build([asset({ kind: 'photo', label: 'P', value: 'https://example.test/p.jpg', credit: null })]), 'P')
    expect(a.warning).toEqual({ level: 'broken', text: 'No photographer credit, which most press use requires.' })
  })

  it('calls a link that is not a link broken', () => {
    const a = find(build([asset({ kind: 'link', label: 'L', value: 'not a url' })]), 'L')
    expect(a.warning?.level).toBe('broken')
  })

  it('says how long past its review date something is, in the coarsest true unit', () => {
    const at = (n: number) => find(build([asset({ kind: 'fact', label: 'F', reviewBy: dayOffset(-n) })]), 'F').warning
    expect(at(1)?.text).toBe('1 day past its review date. Check it before you paste it.')
    expect(at(30)?.text).toBe('30 days past its review date. Check it before you paste it.')
    expect(at(75)?.text).toBe('3 months past its review date. Check it before you paste it.')
    expect(at(800)?.text).toBe('2 years past its review date. Check it before you paste it.')
    expect(at(30)?.level).toBe('overdue')
  })

  it('reports a broken entry as broken, not merely overdue', () => {
    const a = find(build([asset({ kind: 'photo', label: 'P', value: 'https://example.test/p.jpg', reviewBy: dayOffset(-30) })]), 'P')
    expect(a.warning?.level).toBe('broken')
  })

  it('does not turn "not reviewed yet" or "review soon" into a warning', () => {
    // An unreviewed entry is an absent claim, not a fault, and a fresh library
    // sourced from documents is mostly unreviewed. A flag on every row would be
    // a flag nobody reads.
    const feed = build([
      asset({ kind: 'fact', label: 'Unreviewed', reviewBy: null }),
      asset({ kind: 'fact', label: 'Soon', reviewBy: dayOffset(20) }),
      asset({ kind: 'fact', label: 'Fine', reviewBy: dayOffset(200) }),
    ])
    expect(find(feed, 'Unreviewed')).toMatchObject({ warning: null, note: 'Not reviewed yet.' })
    expect(find(feed, 'Soon')).toMatchObject({ warning: null, note: 'Due for review in 20 days.' })
    expect(find(feed, 'Fine')).toMatchObject({ warning: null, note: null })
    expect(feed.needsLook).toBe(0)
  })

  it('counts what needs a look across every group', () => {
    const feed = build([
      asset({ kind: 'photo', label: 'P', value: 'https://example.test/p.jpg' }),
      asset({ kind: 'fact', label: 'Old', reviewBy: dayOffset(-5) }),
      asset({ kind: 'bio', label: 'Fine', questionKind: 'bio' }),
    ])
    expect(feed.needsLook).toBe(2)
  })

  it('takes today as given, so the same entry reads differently on another day', () => {
    const f = asset({ kind: 'fact', label: 'F', reviewBy: '2026-10-10' })
    expect(find(build([f], {}, '2026-10-07'), 'F').warning).toBeNull()
    expect(find(build([f], {}, '2026-10-20'), 'F').warning?.level).toBe('overdue')
  })
})

describe('the order within a group', () => {
  it('puts what is asked of this artist first, most often first', () => {
    const feed = build(
      [
        asset({ kind: 'link', label: 'Bandcamp', value: 'https://a.bandcamp.com', questionKind: 'bandcamp' }),
        asset({ kind: 'link', label: 'Spotify', value: 'https://open.spotify.com/artist/x', questionKind: 'spotify' }),
        asset({ kind: 'link', label: 'Website', value: 'https://example.test', questionKind: 'website' }),
      ],
      { bandcamp: 5, spotify: 2 },
    )
    expect(feed.groups[0].answers.map((a) => a.label)).toEqual(['Bandcamp', 'Spotify', 'Website'])
    expect(feed.groups[0].answers[0].asked).toBe(5)
  })

  it('falls back on a fixed order where nothing is counted', () => {
    const feed = build([
      asset({ kind: 'link', label: 'Bandcamp', value: 'https://a.bandcamp.com', questionKind: 'bandcamp' }),
      asset({ kind: 'link', label: 'Website', value: 'https://example.test', questionKind: 'website' }),
      asset({ kind: 'link', label: 'Spotify', value: 'https://open.spotify.com/artist/x', questionKind: 'spotify' }),
    ])
    expect(feed.groups[0].answers.map((a) => a.label)).toEqual(['Website', 'Spotify', 'Bandcamp'])
  })

  it('puts the shorter bio before the longer, so the one that fits a limit comes first', () => {
    const feed = build([
      asset({ kind: 'bio', label: 'Long', questionKind: 'bio', value: 'a b c d e f g h' }),
      asset({ kind: 'bio', label: 'Short', questionKind: 'bio', value: 'a b c' }),
    ])
    expect(feed.groups[0].answers.map((a) => a.label)).toEqual(['Short', 'Long'])
  })

  it('counts an entry filed under a key the vocabulary does not know by what its label asks', () => {
    const feed = build(
      [asset({ kind: 'fact', label: 'Monthly listeners', questionKind: 'stat' })],
      { streaming_stats: 4 },
    )
    expect(feed.groups[0].answers[0].asked).toBe(4)
  })
})

describe('what the applications ask and nothing on file answers', () => {
  it('names it, with how often it was asked', () => {
    const feed = build([asset({ kind: 'bio', label: 'Bio', questionKind: 'bio' })], { set_length: 3, tech_requirements: 1, bio: 6 })
    expect(feed.missing).toEqual([
      { key: 'set_length', label: 'Set length', asked: 3 },
      { key: 'tech_requirements', label: 'Technical requirements', asked: 1 },
    ])
  })

  it('does not call a question missing when its label, or the site it points at, answers it', () => {
    const feed = build(
      [
        asset({ kind: 'link', label: 'YouTube channel', value: 'https://example.test/c', questionKind: 'link' }),
        asset({ kind: 'link', label: 'Music', value: 'https://artist.bandcamp.com', questionKind: null }),
        asset({ kind: 'link', label: 'Profile', value: 'https://www.instagram.com/someone', questionKind: null }),
      ],
      { youtube: 2, bandcamp: 2, instagram: 2 },
    )
    expect(feed.missing).toEqual([])
  })

  it('does not take a document for an answer because of a word in its name', () => {
    // The classifier reads "minutes" as a set length. A set list is paperwork,
    // and believing the label would hide a gap nothing on file fills.
    const feed = build(
      [asset({ kind: 'document', label: 'Set list - 45 minutes', value: 'https://example.test/s.pdf', questionKind: 'document' })],
      { set_length: 2 },
    )
    expect(feed.missing).toEqual([{ key: 'set_length', label: 'Set length', asked: 2 }])
    expect(feed.groups[0].answers[0].asked).toBe(0)
  })

  it('does take a document for the question it was filed under', () => {
    const feed = build(
      [asset({ kind: 'document', label: 'Stage plot', value: 'https://example.test/p.pdf', questionKind: 'tech_requirements' })],
      { tech_requirements: 3 },
    )
    expect(feed.missing).toEqual([])
    expect(feed.groups[0].answers[0].asked).toBe(3)
  })

  it('counts a follower figure as the streaming question, not as the link it is named after', () => {
    const feed = build(
      [asset({ kind: 'fact', label: 'Instagram followers', questionKind: 'stat', value: '2,800' })],
      { instagram: 5, streaming_stats: 2 },
    )
    expect(feed.groups[0].answers[0].asked).toBe(2)
    // Nothing on file is an Instagram link, and the figure does not stand in for one.
    expect(feed.missing).toEqual([{ key: 'instagram', label: 'Instagram', asked: 5 }])
  })

  it('leaves out questions that name the event, which nothing on file could answer in advance', () => {
    expect(build([], { why_this_event: 9, what_sets_you_apart: 4 }).missing).toEqual([])
  })

  it('leaves out a key the vocabulary has never heard of, and a count of nothing', () => {
    expect(build([], { not_a_question: 5, set_length: 0 }).missing).toEqual([])
  })

  it('names the most asked first and no more than it can sensibly show', () => {
    const keys = ['set_length', 'fee', 'travel', 'availability', 'accessibility', 'tech_requirements', 'phone', 'email']
    const asked = Object.fromEntries(keys.map((k, i) => [k, i + 1]))
    const { missing } = build([], asked)
    expect(missing).toHaveLength(MISSING_SHOWN)
    expect(missing[0].key).toBe('email')
    expect(missing.map((m) => m.asked)).toEqual([...missing.map((m) => m.asked)].sort((a, b) => b - a))
  })

  it('does not count an archived or empty entry as an answer', () => {
    const feed = build(
      [asset({ kind: 'fact', label: 'Set length', questionKind: 'set_length', archived: 1 }), asset({ kind: 'fact', label: 'Fee', questionKind: 'fee', value: '' })],
      { set_length: 2, fee: 2 },
    )
    expect(feed.missing.map((m) => m.key).sort()).toEqual(['fee', 'set_length'])
  })
})

describe('finding one', () => {
  const feed = build([
    asset({ kind: 'bio', label: 'Short bio', questionKind: 'bio', value: 'Doug writes songs about Winnipeg winters.' }),
    asset({ kind: 'link', label: 'Spotify', value: 'https://open.spotify.com/artist/abc', questionKind: 'spotify' }),
    asset({ kind: 'photo', label: 'Barn', value: 'https://example.test/barn.jpg', credit: null }),
    asset({ kind: 'fact', label: 'Monthly listeners', questionKind: 'streaming_stats', reviewBy: dayOffset(-5) }),
  ])
  const labels = (query: string, needsLookOnly = false) =>
    filterAnswers(feed, { query, needsLookOnly }).flatMap((g) => g.answers.map((a) => a.label))

  it('shows everything for nothing typed', () => {
    expect(labels('')).toHaveLength(4)
    expect(labels('   ')).toHaveLength(4)
  })

  it('needs every word typed, in any order', () => {
    // The group counts as a word to find it by, so "link" finds a link; a word
    // from a different group does not.
    expect(labels('spotify link')).toEqual(['Spotify'])
    expect(labels('spotify photos')).toEqual([])
    expect(labels('bio short')).toEqual(['Short bio'])
    expect(labels('short bio')).toEqual(['Short bio'])
  })

  it('looks at what would be pasted, and at the group it is filed under', () => {
    expect(labels('winnipeg')).toEqual(['Short bio'])
    expect(labels('recordings')).toEqual(['Spotify'])
    expect(labels('photos')).toEqual(['Barn'])
  })

  it('is not case sensitive', () => {
    expect(labels('SPOTIFY')).toEqual(['Spotify'])
  })

  it('narrows to what needs a look, and to the search inside that', () => {
    expect(labels('', true).sort()).toEqual(['Barn', 'Monthly listeners'])
    expect(labels('listeners', true)).toEqual(['Monthly listeners'])
    expect(labels('spotify', true)).toEqual([])
  })

  it('drops a group with nothing left in it', () => {
    expect(filterAnswers(feed, { query: 'spotify', needsLookOnly: false }).map((g) => g.id)).toEqual(['links'])
  })
})
