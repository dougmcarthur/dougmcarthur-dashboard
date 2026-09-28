import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  catalogKey,
  factsFromGig,
  factsFromSync,
  fillMissing,
  gigCategory,
  normaliseUrl,
  publicListing,
  publishable,
  type CatalogRow,
} from '../shared/opportunityCatalog'
import { SCOPED_TABLES } from '../src/db/scope'

const TODAY = '2026-09-28'

describe('gigCategory', () => {
  it('reads the free-text type the research agents write', () => {
    expect(gigCategory('festival')).toBe('festival')
    expect(gigCategory('Folk Festival')).toBe('festival')
    expect(gigCategory('showcase')).toBe('showcase')
    expect(gigCategory('conference')).toBe('showcase')
    expect(gigCategory('grant')).toBe('funding')
    expect(gigCategory('Award')).toBe('funding')
    expect(gigCategory('venue')).toBe('other')
    expect(gigCategory(null)).toBe('other')
  })
})

describe('catalogKey', () => {
  it('treats the same page as the same opportunity whatever the spelling', () => {
    const a = catalogKey({ name: 'X', url: 'https://www.Example.org/Apply/?utm=1#top', category: 'festival' })
    const b = catalogKey({ name: 'Y', url: 'http://example.org/apply', category: 'festival' })
    expect(a).toBe(b)
  })

  it('prefers the form over the announcement', () => {
    expect(
      catalogKey({ name: 'X', url: 'https://news.example/post', applicationUrl: 'https://forms.example/f', category: 'festival' }),
    ).toBe('url:forms.example/f')
  })

  // An annual festival is a new opportunity each year.
  it('falls back to name and closing year, so two editions are two rows', () => {
    const y1 = catalogKey({ name: 'Winnipeg Folk Festival', deadline: '2026-11-01', category: 'festival' })
    const y2 = catalogKey({ name: 'Winnipeg Folk Festival', deadline: '2027-11-01', category: 'festival' })
    expect(y1).not.toBe(y2)
  })
})

describe('what may be published', () => {
  it('never treats somebody’s document or mail as a listing', () => {
    expect(normaliseUrl('https://docs.google.com/document/d/abc/edit')).toBeNull()
    expect(normaliseUrl('https://drive.google.com/file/d/abc')).toBeNull()
    expect(normaliseUrl('https://mail.google.com/mail/u/0/#inbox')).toBeNull()
    // A Google Form is a public call.
    expect(normaliseUrl('https://docs.google.com/forms/d/e/xyz/viewform')).toBe('docs.google.com/forms/d/e/xyz/viewform')
  })

  it('publishes a gig only with a public listing page in a shown category', () => {
    expect(publishable(factsFromGig({ name: 'F', type: 'festival', url: 'https://f.example' }))).toBe(true)
    expect(publishable(factsFromGig({ name: 'F', type: 'festival', url: null }))).toBe(false)
    expect(publishable(factsFromGig({ name: 'House show', type: 'venue', url: 'https://h.example' }))).toBe(false)
    expect(publishable(factsFromGig({ name: 'F', type: 'grant', url: 'https://docs.google.com/document/d/1' }))).toBe(false)
  })

  it('catalogues a sync organisation, never a person', () => {
    expect(factsFromSync({ name: 'Musicbed', agencyType: 'library' }).category).toBe('sync')
    expect(factsFromSync({ name: 'Jane Doe', agencyType: 'supervisor' }).category).toBe('other')
  })

  it('carries nothing about the artist’s side of a gig', () => {
    const facts = factsFromGig({
      name: 'F',
      type: 'festival',
      url: 'https://f.example',
      // Fields an artist row has that must not reach the catalog.
      ...({ status: 'passed', fitRationale: 'pending Doug’s review', notes: 'private' } as object),
    })
    expect(Object.keys(facts).sort()).toEqual(
      ['category', 'country', 'deadline', 'deadlineNote', 'kind', 'location', 'name', 'organizer', 'url'].sort(),
    )
  })
})

describe('publicListing', () => {
  const row = (n: number, over: Partial<CatalogRow> = {}): CatalogRow => ({
    id: n,
    category: 'festival',
    name: `F${n}`,
    organizer: null,
    kind: 'festival',
    url: `https://f${n}.example`,
    deadline: null,
    deadlineNote: null,
    location: null,
    country: null,
    public: true,
    firstSeenAt: `2026-09-${String(n).padStart(2, '0')}T00:00:00Z`,
    ...over,
  })

  it('shows the ten most recently found per category', () => {
    const rows = Array.from({ length: 14 }, (_, i) => row(i + 1))
    const list = publicListing(rows, TODAY).festival
    expect(list).toHaveLength(10)
    expect(list[0].name).toBe('F14')
  })

  it('leaves out closed calls and hidden entries', () => {
    const list = publicListing(
      [row(1, { deadline: '2026-09-01' }), row(2, { public: false }), row(3, { deadline: TODAY })],
      TODAY,
    ).festival
    expect(list.map((o) => o.name)).toEqual(['F3'])
  })

  it('gives a sync entry no link', () => {
    const list = publicListing([row(1, { category: 'sync', url: 'https://x.example' })], TODAY).sync
    expect(list[0].url).toBeNull()
  })
})

describe('fillMissing', () => {
  it('fills gaps from a later sighting and never overwrites', () => {
    const first = factsFromGig({ name: 'F', type: 'festival', url: 'https://f.example', location: 'Winnipeg' })
    const later = factsFromGig({ name: 'Poisoned', type: 'festival', url: 'https://evil.example', location: 'Elsewhere', deadline: '2026-12-01' })
    expect(fillMissing(first, later)).toEqual({ deadline: '2026-12-01' })
  })
})

describe('the public routes cannot reach an artist’s rows', () => {
  // Source-level, like test/tenantScope.test.ts: the landing page's route
  // reads the catalog and the request table, and names no scoped table.
  it('names none of the scoped tables', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'routes', 'publicSite.ts'), 'utf8')
    // Every table a route can query is imported from the schema by name.
    const imported = src.match(/import \{([^}]*)\} from '\.\.\/db\/schema'/)?.[1] ?? ''
    const names = imported.split(',').map((s) => s.trim()).filter(Boolean)
    expect(names.sort()).toEqual(['inviteRequests', 'opportunities'])
    for (const table of SCOPED_TABLES) expect(names, table).not.toContain(table)
  })
})
