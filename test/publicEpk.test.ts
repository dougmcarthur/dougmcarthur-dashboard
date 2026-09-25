import { describe, expect, it } from 'vitest'
import { buildPublicEpk, wordCount, youtubeId } from '../shared/publicEpk'
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
const epk = (assets: ArtistAsset[], audience: 'festival' | 'sync' | 'press' = 'festival') =>
  buildPublicEpk(assets, { audience, today: TODAY })

describe('only what the artist has claimed goes public', () => {
  it('withholds a suggestion nobody has reviewed, and says why', () => {
    const out = epk([asset({ kind: 'bio', label: 'Bio', value: 'Imported.', reviewBy: null })])
    expect(out.bios).toEqual([])
    expect(out.withheld).toEqual([{ label: 'Bio', kind: 'bio', reason: 'unreviewed' }])
  })

  it('still shows an overdue asset — it was claimed once; the owner view flags it', () => {
    const out = epk([asset({ kind: 'bio', label: 'Bio', value: 'Old but mine.', reviewBy: '2026-01-01' })])
    expect(out.bios).toHaveLength(1)
  })

  it('withholds a photo with no credit', () => {
    const out = epk([
      asset({ kind: 'photo', label: 'Press 1', value: 'https://x/1.jpg' }),
      asset({ kind: 'photo', label: 'Press 2', value: 'https://x/2.jpg', credit: 'Jane Smith' }),
    ])
    expect(out.photos.map((p) => p.credit)).toEqual(['Jane Smith'])
    expect(out.withheld).toEqual([{ label: 'Press 1', kind: 'photo', reason: 'no_credit' }])
  })

  it('leaves archived and empty assets out without comment', () => {
    const out = epk([
      asset({ kind: 'bio', label: 'Retired', value: 'x', archived: 1 }),
      asset({ kind: 'link', label: 'Empty', value: '  ' }),
    ])
    expect(out.bios).toEqual([])
    expect(out.withheld).toEqual([])
  })
})

describe('only what is meant for strangers goes public', () => {
  it('publishes facts on the allow-list and keeps contact, fees and the unclassified private', () => {
    const out = epk([
      asset({ kind: 'fact', label: 'Genre', value: 'Folk', questionKind: 'genre' }),
      asset({ kind: 'fact', label: 'Phone', value: '204 555 0100', questionKind: 'phone' }),
      asset({ kind: 'fact', label: 'Fee', value: '$500', questionKind: 'fee' }),
      asset({ kind: 'fact', label: 'Mailing list size', value: '1,100' }),
    ])
    expect(out.facts.map((f) => f.label)).toEqual(['Genre'])
    expect(out.withheld.map((w) => `${w.label}:${w.reason}`).sort()).toEqual([
      'Fee:private',
      'Mailing list size:private',
      'Phone:private',
    ])
  })

  it('publishes the stage plot and rider, never a tax form', () => {
    const out = epk([
      asset({ kind: 'document', label: 'Stage plot (solo)', value: 'https://x/plot.pdf' }),
      asset({ kind: 'document', label: 'Tech needs', value: 'https://x/t.pdf', questionKind: 'tech_requirements' }),
      asset({ kind: 'document', label: 'W-8BEN', value: 'https://x/w8.pdf' }),
    ])
    expect(out.documents.map((d) => d.label)).toEqual(['Stage plot (solo)', 'Tech needs'])
    expect(out.withheld).toEqual([{ label: 'W-8BEN', kind: 'document', reason: 'private' }])
  })

  it('checks privacy before review, so a private fact is never listed as merely unreviewed', () => {
    const out = epk([asset({ kind: 'fact', label: 'Email', value: 'a@b.c', questionKind: 'email', reviewBy: null })])
    expect(out.withheld[0].reason).toBe('private')
  })
})

describe('shape', () => {
  it('follows the audience cut: sync carries no documents or facts', () => {
    const lib = [
      asset({ kind: 'document', label: 'Stage plot', value: 'https://x/p.pdf' }),
      asset({ kind: 'fact', label: 'Genre', value: 'Folk', questionKind: 'genre' }),
      asset({ kind: 'audio', label: 'Magic', value: 'https://x/m' }),
    ]
    const out = epk(lib, 'sync')
    expect(out.documents).toEqual([])
    expect(out.facts).toEqual([])
    expect(out.audio).toHaveLength(1)
  })

  it('orders bios shortest first, so the switch reads Short → Long', () => {
    const out = epk([
      asset({ kind: 'bio', label: 'Long', value: 'word '.repeat(300) }),
      asset({ kind: 'bio', label: 'Short', value: 'Five words is enough here.' }),
    ])
    expect(out.bios.map((b) => b.label)).toEqual(['Short', 'Long'])
  })

  it('dates each item by when it was last confirmed', () => {
    const out = epk([asset({ kind: 'fact', label: 'Monthly listeners', value: '4,200', questionKind: 'streaming_stats' })])
    expect(out.facts[0].asOf).toBe('2026-09-10')
  })

  it('finds the YouTube id for an embed', () => {
    const out = epk([asset({ kind: 'video', label: 'Live', value: 'https://www.youtube.com/watch?v=X0_3HaLBgKM' })])
    expect(out.videos[0].youtubeId).toBe('X0_3HaLBgKM')
  })
})

it('reads YouTube ids from every shape YouTube hands out, and nothing else', () => {
  expect(youtubeId('https://youtu.be/qbGJ1EPXUY8?t=3')).toBe('qbGJ1EPXUY8')
  expect(youtubeId('https://m.youtube.com/watch?v=qbGJ1EPXUY8&list=x')).toBe('qbGJ1EPXUY8')
  expect(youtubeId('https://www.youtube.com/embed/qbGJ1EPXUY8')).toBe('qbGJ1EPXUY8')
  expect(youtubeId('https://www.youtube.com/shorts/qbGJ1EPXUY8')).toBe('qbGJ1EPXUY8')
  expect(youtubeId('https://www.youtube.com/@DougMcArthurMusic')).toBeNull()
  expect(youtubeId('https://vimeo.com/123')).toBeNull()
  expect(youtubeId('not a url')).toBeNull()
})

it('counts words as a form does', () => {
  expect(wordCount('  one two\nthree  ')).toBe(3)
})
