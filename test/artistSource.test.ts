import { describe, it, expect } from 'vitest'
import { extractAssets, extractAll, splitHeading } from '../shared/artistSource'
import { EPK_BIO, ARTIST_PROFILE, STYLE_GUIDE } from './artistSource.fixtures'

const profile = { id: 'artist-profile', title: 'Artist Brief', content: ARTIST_PROFILE }
const epk = { id: 'epk-bio', title: 'EPK Bio', content: EPK_BIO }
const style = { id: 'writing-style-guide', title: 'Writing Style Guide', content: STYLE_GUIDE }

const byKind = (docs: Parameters<typeof extractAll>[0], key: string) =>
  extractAll(docs).proposals.filter((p) => p.questionKind === key)

describe('splitHeading', () => {
  it('takes the parenthetical off as the variant', () => {
    expect(splitHeading('Approved Short Bio (150 words — Manitoba Music)')).toEqual({
      label: 'Approved Short Bio',
      variant: '150 words — Manitoba Music',
    })
  })

  it('leaves a heading that is only a parenthetical alone', () => {
    // "(Draft)" as a whole heading has no label to strip it from, and a
    // label of "" would be an entry with no name.
    expect(splitHeading('(Draft)')).toEqual({ label: '(Draft)', variant: null })
  })

  it('is a no-op on an ordinary heading', () => {
    expect(splitHeading('Genre')).toEqual({ label: 'Genre', variant: null })
  })
})

describe('a heading is a question and its body is the answer', () => {
  it('files the sections whose headings name a canonical question', () => {
    const keys = extractAssets(profile).proposals.map((p) => p.questionKind)
    expect(keys).toContain('artist_name')
    expect(keys).toContain('genre')
    expect(keys).toContain('bio')
  })

  it('carries the bio variant through, which is what picks it for a field', () => {
    const [bio] = byKind([profile], 'bio')
    expect(bio.label).toBe('Approved Short Bio')
    expect(bio.variant).toBe('150 words — Manitoba Music / Grant Applications')
    expect(bio.kind).toBe('bio')
  })

  it('strips the rules and the "Last updated" line out of the answer', () => {
    const [bio] = byKind([profile], 'bio')
    expect(bio.value).not.toMatch(/---/)
    expect(bio.value).not.toMatch(/Last updated/)
    expect(bio.value.startsWith('Doug McArthur is a Winnipeg-based')).toBe(true)
  })

  it('reads level two only — a title is not a question and a subsection is body', () => {
    const headings = extractAssets(profile).proposals.map((p) => p.label)
    expect(headings).not.toContain('Doug McArthur — Artist Brief')
    expect(headings).not.toContain('Band-Era Recordings')
  })
})

describe('a labelled URL is a link', () => {
  it('takes the pipe-separated platform list apart and classifies each', () => {
    const links = extractAssets(profile).proposals.filter((p) => p.kind === 'link')
    const byQuestion = Object.fromEntries(links.map((l) => [l.questionKind, l.value]))

    expect(byQuestion.spotify).toBe('https://open.spotify.com/artist/4E4haw1H8JcjoW0LvXpGSD')
    expect(byQuestion.instagram).toBe('https://www.instagram.com/dougmcarthur')
    expect(byQuestion.website).toBe('https://dougmcarthur.net')
    expect(byQuestion.tiktok).toBe('https://www.tiktok.com/@DougMcArthurMusic')
  })

  it('leaves a release list alone, because those links are about the release', () => {
    // The discography lists a Spotify URL under each album. Mining them would
    // file six different records under the one "Spotify link" question and
    // `pickForLength` would then choose between them at random.
    const values = extractAssets(profile).proposals.map((p) => p.value)
    expect(values.some((v) => v.includes('/album/'))).toBe(false)
    expect(values).toContain('https://open.spotify.com/artist/4E4haw1H8JcjoW0LvXpGSD')
  })

  it('takes an email as a fact and not as a link', () => {
    const email = extractAssets(profile).proposals.find((p) => p.questionKind === 'email')
    expect(email?.value).toBe('dougmcarthur0@gmail.com')
    expect(email?.kind).toBe('fact')
  })

  it('ignores a labelled value that is neither', () => {
    // "SOCAN: Registered member" is a sentence, and "@dougmcarthur@mastodon.social"
    // is a handle rather than an address this app can open.
    const values = extractAssets(profile).proposals.map((p) => p.value)
    expect(values).not.toContain('Registered member')
    expect(values.some((v) => v.startsWith('@'))).toBe(false)
  })
})

describe('what it will not do', () => {
  it('names the sections it could not file rather than dropping them', () => {
    const headings = extractAssets(profile).skipped.map((s) => s.heading)
    expect(headings).toContain('Sound Description')
    expect(headings).toContain('Release Catalogue')
    expect(headings).toContain('Live Performance Setup')
  })

  it('does not count a section that yielded links as skipped', () => {
    // "Current Platforms & Presence" matches no canonical question, and
    // reporting it as a gap while it produced eight links would be a lie.
    const headings = extractAssets(profile).skipped.map((s) => s.heading)
    expect(headings).not.toContain('Current Platforms & Presence')
    expect(headings).not.toContain('Contact & Links')
  })

  it('reads no sentences — a follower count in prose is not extracted', () => {
    // The counts are the fastest-staling facts here and a form asks for them
    // as numbers, so the temptation is real. Pulling them out means a regex
    // per phrasing, which is `shared/reviewParse.ts` all over again.
    const values = extractAssets(profile).proposals.map((p) => p.value).join(' ')
    expect(values).not.toMatch(/14 monthly listeners/)
  })
})

describe('everything it produces is a suggestion', () => {
  it('gives every proposal a source that names the document and the heading', () => {
    for (const p of extractAll([profile, epk]).proposals) {
      expect(p.source).toMatch(/^(artist-profile|epk-bio)#/)
      expect(p.notes).toMatch(/Nobody has confirmed it/)
    }
  })

  it('gives each proposal a distinct source, or a second run would double up', () => {
    const sources = extractAll([profile, epk, style]).proposals.map((p) => p.source)
    expect(new Set(sources).size).toBe(sources.length)
  })
})

describe('across documents', () => {
  it('keeps two bios from two documents, because they are two bios', () => {
    const bios = extractAll([profile, epk]).proposals.filter((p) => p.kind === 'bio')
    expect(bios.length).toBe(2)
    expect(bios.map((b) => b.label).sort()).toEqual(['Approved Short Bio', 'Bio'])
  })

  it('keeps one copy of an address two documents both name', () => {
    // The brief lists the website under both Platforms and Contact.
    const sites = byKind([profile, epk], 'website')
    expect(sites.length).toBe(1)
  })
})

describe('the style guide, which is the known false positive', () => {
  it('reads "Voice in One Sentence" as a one-liner, and that is wrong', () => {
    // Pinned rather than fixed. `classifyQuestion` is doing its job — that
    // heading really does look like "describe yourself in one sentence" — and
    // the guard is the one this module already relies on: the proposal lands
    // unreviewed, labelled with the document it came from, and is archived in
    // one click. A pattern here to exclude it would be the start of the prose
    // parsing this module exists to avoid.
    const [one] = byKind([style], 'one_liner')
    expect(one.label).toBe('Voice in One Sentence')
    expect(one.source).toMatch(/^writing-style-guide#/)
  })

  it('files nothing else out of it, which is the honest outcome', () => {
    const result = extractAssets(style)
    expect(result.proposals.length).toBe(1)
    expect(result.skipped.map((s) => s.heading)).toEqual(['Greetings', 'Capitalization'])
  })
})

describe('a document with nothing in it', () => {
  it('returns nothing rather than throwing', () => {
    expect(extractAssets({ id: 'x', title: 'X', content: '' })).toEqual({ proposals: [], skipped: [] })
    expect(extractAll([])).toEqual({ proposals: [], skipped: [] })
  })

  it('reports an empty section as empty rather than as unmatchable', () => {
    const { skipped } = extractAssets({ id: 'x', title: 'X', content: '## Genre\n\n' })
    expect(skipped).toEqual([{ heading: 'Genre', reason: 'Empty.' }])
  })
})
