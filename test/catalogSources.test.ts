import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { ASSOCIATIONS } from '../shared/musicAssociations'
import { parseFeed } from '../shared/feedParse'
import { parseListing } from '../shared/listingParse'
import {
  DEAD_FEED_DAYS,
  MAX_BACKOFF,
  STALE_DAYS,
  draftFromFeedItem,
  draftFromListingItem,
  initialStatus,
  isCallsPage,
  nextDueAt,
  refreshCandidate,
  seedSources,
  sourceState,
  type SourceHealthInput,
} from '../shared/catalogSources'

/**
 * What becomes of what a source says, and how a source is judged.
 *
 * Dates are relative to this file's own `TODAY`, never the clock; the feed
 * captures were taken on 2026-10-06, so reading them "today" is reading them
 * the day after.
 */

const TODAY = '2026-10-05'
const NOW = new Date(`${TODAY}T15:00:00Z`)
const fixture = (name: string) => readFileSync(`test/fixtures/sources/${name}`, 'utf8')

describe('the seeded registry', () => {
  const seeds = seedSources()

  it('holds every source the association registry names, once', () => {
    const named = ASSOCIATIONS.flatMap((a) => a.sources.map((s) => `${a.id}|${s.url}`)).sort()
    expect(seeds.map((s) => `${s.association}|${s.url}`).sort()).toEqual(named)
    expect(new Set(seeds.map((s) => s.key)).size).toBe(seeds.length)
  })

  it('says a source in words and keeps the key out of sight', () => {
    for (const s of seeds) {
      expect(s.label, s.key).toMatch(/ — /)
      expect(s.label, s.key).not.toContain(':')
    }
    expect(seeds.find((s) => s.association === 'musicbc' && s.kind === 'feed')?.label).toBe('Music BC — News')
  })

  it('knows which pages are lists of calls', () => {
    expect(isCallsPage('SaskMusic — Opportunities and deadlines')).toBe(true)
    expect(isCallsPage('Music PEI — Opportunities and submissions')).toBe(true)
    expect(isCallsPage('Music BC — News')).toBe(false)
  })
})

describe('what first sight makes of an item', () => {
  const base = { verdict: 'opportunity' as const, deadline: null, publishedAt: null, eventAt: null }

  it('ignores what is not a call', () => {
    expect(initialStatus({ ...base, verdict: 'not_opportunity' }, TODAY)).toBe('ignored')
  })

  it('files a call whose deadline has passed as closed, even if it is brand new', () => {
    expect(initialStatus({ ...base, deadline: '2026-10-04' }, TODAY)).toBe('closed')
    expect(initialStatus({ ...base, deadline: '2026-10-05' }, TODAY)).toBe('new')
  })

  it('sets a baseline: history on a first read is stale, not news', () => {
    const at = (daysAgo: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - daysAgo * 86_400_000).toISOString()
    expect(initialStatus({ ...base, publishedAt: at(STALE_DAYS) }, TODAY)).toBe('new')
    expect(initialStatus({ ...base, publishedAt: at(STALE_DAYS + 1) }, TODAY)).toBe('stale')
  })

  it('files a calendar event that has already happened as closed', () => {
    expect(initialStatus({ ...base, eventAt: '2026-09-01' }, TODAY)).toBe('closed')
  })
})

describe('reading SaskMusic’s page into candidates', () => {
  const items = parseListing(fixture('saskmusic-opportunities.html'), 'https://www.saskmusic.org/news/sound-opportunities')
  const drafts = items.map((i) => draftFromListingItem(i, { today: TODAY, callsPage: true }))

  it('turns a year-bearing deadline into a date and keeps nothing it was not told', () => {
    expect(drafts[0]).toMatchObject({
      title: 'Artist Opportunity - OUTER LIMITS SHOW SERIES',
      deadline: '2026-10-06',
      deadlineNote: null,
      placeText: 'Calgary, Alberta',
      verdict: 'opportunity',
      status: 'new',
      publishedAt: null,
    })
  })

  it('uses the entry’s address as its identity', () => {
    expect(drafts[0].itemKey).toBe(drafts[0].url)
  })

  it('reads the whole page the way the rules say', () => {
    // Seven carry a deadline line; the three without are an industry post, a
    // podcast and a TV-discovery offer, which are not calls for artists.
    expect(drafts.filter((d) => d.verdict === 'opportunity')).toHaveLength(7)
    expect(drafts.filter((d) => d.verdict === 'unclear')).toHaveLength(3)
    expect(drafts.every((d) => d.reason.length > 0)).toBe(true)
  })

  it('files an entry whose deadline is past as closed', () => {
    const later = items.map((i) => draftFromListingItem(i, { today: '2026-10-08', callsPage: true }))
    expect(later[0].status).toBe('closed') // closed October 6
    expect(later[0].deadline).toBe('2026-10-06')
  })

  it('keeps a year-less deadline as the words and never a date', () => {
    const [d] = [
      { title: 'Open Call: Winter Showcase', url: 'https://x.example/a', deadlineText: 'November 20', place: null, blurb: '' },
    ].map((i) => draftFromListingItem(i, { today: TODAY, callsPage: false }))
    expect(d.deadline).toBeNull()
    expect(d.deadlineNote).toBe('November 20')
    expect(d.status).toBe('new')
  })
})

describe('reading a feed into candidates', () => {
  const items = parseFeed(fixture('musicyukon-feed.xml'))!

  it('sets a baseline on a first read, so the old items are stale', () => {
    const drafts = items.map((i) => draftFromFeedItem(i, { today: TODAY, callsPage: false }))
    const byTitle = (needle: string) => drafts.find((d) => d.title.includes(needle))!
    expect(byTitle('ICELAND AIRWAVES 2025')).toMatchObject({ verdict: 'opportunity', status: 'stale' })
    expect(byTitle('Yukon Territory at Breakout West')).toMatchObject({ verdict: 'not_opportunity', status: 'ignored' })
    expect(byTitle('Edmonton International Fringe')).toMatchObject({ verdict: 'unclear', status: 'new' })
  })

  it('does not read a deadline out of a summary', () => {
    const drafts = items.map((i) => draftFromFeedItem(i, { today: TODAY, callsPage: false }))
    expect(drafts.every((d) => d.deadline === null && d.deadlineNote === null)).toBe(true)
  })
})

describe('an item seen again', () => {
  const stored = {
    title: 'Winter Residency 2027',
    url: 'https://x.example/a',
    deadline: '2026-10-03',
    deadlineNote: null,
    placeText: null,
    verdict: 'opportunity',
    category: null,
    kind: null,
    reason: 'The listing gives it a deadline.',
    status: 'closed',
  }
  const draft = (over: Record<string, unknown> = {}) =>
    ({
      itemKey: 'https://x.example/a',
      title: stored.title,
      url: stored.url,
      publishedAt: null,
      eventAt: null,
      deadline: stored.deadline,
      deadlineNote: null,
      placeText: null,
      verdict: 'opportunity',
      category: null,
      kind: null,
      reason: stored.reason,
      status: 'closed',
      ...over,
    }) as Parameters<typeof refreshCandidate>[1]

  it('changes nothing when nothing changed', () => {
    expect(refreshCandidate(stored, draft(), TODAY)).toBeNull()
  })

  it('reopens a closed call whose deadline was extended', () => {
    const patch = refreshCandidate(stored, draft({ deadline: '2026-11-01', status: 'new' }), TODAY)
    expect(patch).toEqual({ deadline: '2026-11-01', status: 'new' })
  })

  it('closes a call whose deadline has gone', () => {
    const open = { ...stored, deadline: '2026-10-09', status: 'new' }
    const patch = refreshCandidate(open, draft({ deadline: '2026-10-09', status: 'closed' }), '2026-10-10')
    expect(patch).toEqual({ status: 'closed' })
  })

  it('re-files an item under better rules, and says what the rule now is', () => {
    const patch = refreshCandidate(
      { ...stored, status: 'new', deadline: null, verdict: 'unclear', reason: 'old reason' },
      draft({ deadline: null, status: 'new', verdict: 'opportunity', reason: 'New reason.' }),
      TODAY,
    )
    expect(patch).toEqual({ verdict: 'opportunity', reason: 'New reason.' })
  })

  it('moves an item to ignored when the rules now say it is not a call', () => {
    const patch = refreshCandidate({ ...stored, status: 'new' }, draft({ verdict: 'not_opportunity', status: 'ignored' }), TODAY)
    expect(patch?.status).toBe('ignored')
  })

  it('leaves stale where first sight put it', () => {
    const patch = refreshCandidate({ ...stored, status: 'stale', deadline: null }, draft({ deadline: null, status: 'stale' }), TODAY)
    expect(patch).toBeNull()
  })
})

describe('when to look again', () => {
  const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString()

  it('retries one failure at the usual time and then backs off to a week', () => {
    expect(nextDueAt(NOW, 24, 0)).toBe(at(24))
    expect(nextDueAt(NOW, 24, 1)).toBe(at(24))
    expect(nextDueAt(NOW, 24, 2)).toBe(at(48))
    expect(nextDueAt(NOW, 24, 3)).toBe(at(96))
    expect(nextDueAt(NOW, 24, 4)).toBe(at(24 * MAX_BACKOFF))
    expect(nextDueAt(NOW, 24, 40)).toBe(at(24 * MAX_BACKOFF))
  })
})

describe('what a source’s last read says about it', () => {
  const healthy: SourceHealthInput = {
    enabled: true,
    kind: 'feed',
    cadenceHours: 24,
    lastFetchedAt: '2026-10-05T03:00:00.000Z',
    lastOkAt: '2026-10-05T03:00:00.000Z',
    lastStatus: 200,
    lastError: null,
    lastItemCount: 10,
    newestItemAt: '2026-09-29T20:53:24.000Z',
  }
  const state = (over: Partial<SourceHealthInput>) => sourceState({ ...healthy, ...over }, NOW).state

  it('is working when it answered and has something recent', () => {
    expect(sourceState(healthy, NOW)).toEqual({ state: 'working', note: 'Read 10 items.' })
  })

  it('has not been read yet, or is switched off', () => {
    expect(state({ lastFetchedAt: null, lastOkAt: null })).toBe('never')
    expect(state({ enabled: false })).toBe('off')
  })

  // The three real dead sources the first reads found. A status code calls
  // every one of them fine.
  it('calls a feed whose newest item is nineteen months old stale, though it answers', () => {
    const got = sourceState({ ...healthy, newestItemAt: '2025-02-20T17:00:00.000Z' }, NOW)
    expect(got.state).toBe('stale')
    expect(got.note).toBe('Answers, but its newest item is 19 months old.')
    expect(DEAD_FEED_DAYS).toBe(180)
  })

  it('calls an address that answers with nothing empty, not unreachable', () => {
    expect(state({ kind: 'calendar', lastItemCount: 0, newestItemAt: null })).toBe('empty')
    expect(sourceState({ ...healthy, kind: 'page', lastItemCount: 0, newestItemAt: null }, NOW).note).toMatch(/no entries could be read/)
  })

  it('does not call a page stale for having no dates', () => {
    expect(state({ kind: 'page', newestItemAt: null })).toBe('working')
  })

  it('tells a refusal from a bad network, because only one of them is a verdict', () => {
    const failed = { lastFetchedAt: '2026-10-05T14:00:00.000Z', lastOkAt: '2026-10-04T14:00:00.000Z' }
    expect(sourceState({ ...healthy, ...failed, lastStatus: 403, lastError: 'The site answered 403.' }, NOW)).toEqual({
      state: 'refused',
      note: 'The site turned the request away (403).',
    })
    expect(state({ ...failed, lastStatus: 429 })).toBe('refused')
    expect(sourceState({ ...healthy, ...failed, lastStatus: 503, lastError: 'The site answered 503.' }, NOW)).toEqual({
      state: 'unreachable',
      note: 'The site answered 503.',
    })
    expect(sourceState({ ...healthy, ...failed, lastStatus: null, lastError: 'fetch failed' }, NOW).state).toBe('unreachable')
  })

  it('notices when the poller itself has stopped reading it', () => {
    expect(state({ lastFetchedAt: '2026-09-25T03:00:00.000Z', lastOkAt: '2026-09-25T03:00:00.000Z' })).toBe('overdue')
  })

  it('does not call a source overdue for being backed off', () => {
    // A weekly cadence is a source that was read nine days ago, not a stopped poller.
    expect(state({ cadenceHours: 24 * 7, lastFetchedAt: '2026-09-26T03:00:00.000Z', lastOkAt: '2026-09-26T03:00:00.000Z' })).toBe('working')
  })
})

describe('reading a news list into candidates', () => {
  const items = parseListing(fixture('musicontario-news.html'), 'https://music-ontario.ca/news')
  const drafts = items.map((i) => draftFromListingItem(i, { today: TODAY, callsPage: true }))

  it('takes the posted date as when it was published, and sets a baseline from it', () => {
    const byTitle = (needle: string) => drafts.find((d) => d.title.includes(needle))!
    expect(byTitle('Call for Showcase Submissions')).toMatchObject({ publishedAt: '2026-07-13T00:00:00.000Z', verdict: 'opportunity', status: 'new' })
    // Posted in March: history by October, however much it says "now open".
    expect(byTitle('Reeperbahn 2026 - Applications now open')).toMatchObject({ verdict: 'opportunity', status: 'stale' })
  })

  it('has no deadline of its own to give, so it says none', () => {
    expect(drafts.every((d) => d.deadline === null && d.deadlineNote === null)).toBe(true)
  })
})
