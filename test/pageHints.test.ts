import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import pageHints from '../src/routes/pageHints'
import { AGENT_ROUTES, agentMayCall } from '../shared/agentRoutes'
import { HINT_PAGES, PAGE_HINTS, isHintPage, parseDismissed, withDismissed } from '../shared/pageHints'
import { pageLabel } from '../frontend/src/hooks/usePageAnnouncement'
import { sqliteD1 } from './support/sqliteD1'

/**
 * The first-visit line under a page's title.
 *
 * On a first visit it is shown outright, once; dismissed, it is the note behind
 * the title's info icon from then on, for the account and not the browser. The
 * rule it serves is that explanation is never printed by default, so these pin
 * that it is printed exactly once and then tucked away for good.
 */

const read = (f: string) => readFileSync(f, 'utf8')

describe('the lines themselves', () => {
  it('has one for every page that has the heading, and says it in a sentence or two', () => {
    for (const page of HINT_PAGES) {
      const line = PAGE_HINTS[page]
      expect(line, page).toBeTruthy()
      expect(line.length, page).toBeLessThanOrEqual(110)
      // No identifier a screen must not print, no path, no em dash.
      expect(line, page).not.toMatch(/[_/\\—]|[a-z]+[A-Z]/)
    }
  })

  it('is on the pages in the main navigation, each under the name the navigation uses', () => {
    for (const page of HINT_PAGES) expect(pageLabel(page), page).not.toBe('')
    for (const [page, file] of [
      ['overview', 'OverviewPage'], ['review', 'ReviewPage'], ['gigs', 'GigsPage'], ['artist', 'ArtistPage'],
      ['sync', 'SyncPage'], ['promo', 'PromoDraftsPage'], ['runs', 'HistoryPage'],
    ] as const) {
      expect(read(`frontend/src/pages/${file}.tsx`), page).toContain(`<PageHeading page="${page}" title="${pageLabel(page)}"`)
    }
  })
})

describe('what is stored', () => {
  it('reads anything it cannot use as nothing dismissed, which shows a line again rather than hiding one for good', () => {
    expect(parseDismissed(null)).toEqual([])
    expect(parseDismissed('')).toEqual([])
    expect(parseDismissed('not json')).toEqual([])
    expect(parseDismissed('{"gigs":true}')).toEqual([])
    expect(parseDismissed('["gigs","nowhere","gigs",3]')).toEqual(['gigs'])
  })

  it('adds a page once', () => {
    expect(withDismissed([], 'gigs')).toEqual(['gigs'])
    expect(withDismissed(['gigs'], 'gigs')).toEqual(['gigs'])
    expect(withDismissed(['gigs'], 'sync')).toEqual(['gigs', 'sync'])
    expect(isHintPage('gigs') && !isHintPage('settings')).toBe(true)
  })
})

function appFor(d1: D1Database, tenant: string, kind: 'user' | 'agent' = 'user') {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('actor' as never, { kind, tenant, tokenId: null } as never)
    await next()
  })
  app.route('/api/page-hints', pageHints)
  const call = (path: string, init?: RequestInit) => app.request(path, init, { DB: d1 } as never)
  return {
    read: async () => (await (await call('/api/page-hints')).json()) as { dismissed: string[] },
    dismiss: (body: unknown) =>
      call('/api/page-hints/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    status: async (path: string) => (await call(path)).status,
  }
}

describe('the route, against the real schema', () => {
  it('starts with nothing dismissed, and remembers what was', async () => {
    const { d1 } = sqliteD1()
    const me = appFor(d1, 'tnt_a')
    expect((await me.read()).dismissed).toEqual([])
    expect((await me.dismiss({ page: 'gigs' })).status).toBe(200)
    expect((await me.read()).dismissed).toEqual(['gigs'])
    await me.dismiss({ page: 'sync' })
    expect((await me.read()).dismissed).toEqual(['gigs', 'sync'])
  })

  it('is idempotent, so two tabs putting the same line away leave one entry', async () => {
    const { d1 } = sqliteD1()
    const me = appFor(d1, 'tnt_a')
    await me.dismiss({ page: 'review' })
    await me.dismiss({ page: 'review' })
    expect((await me.read()).dismissed).toEqual(['review'])
  })

  it('belongs to the account: another artist still sees their own first visit', async () => {
    const { d1 } = sqliteD1()
    await appFor(d1, 'tnt_a').dismiss({ page: 'gigs' })
    expect((await appFor(d1, 'tnt_b').read()).dismissed).toEqual([])
  })

  it('refuses a page it has no line for, and anything beside the page', async () => {
    const { d1 } = sqliteD1()
    const me = appFor(d1, 'tnt_a')
    expect((await me.dismiss({ page: 'settings' })).status).toBe(400)
    expect((await me.dismiss({ page: '' })).status).toBe(400)
    expect((await me.dismiss({})).status).toBe(400)
    expect((await me.dismiss({ page: 'gigs', extra: 1 })).status).toBe(400)
    expect((await me.read()).dismissed).toEqual([])
  })

  it('refuses an agent credential on both', async () => {
    const { d1 } = sqliteD1()
    const agent = appFor(d1, 'tnt_a', 'agent')
    expect(await agent.status('/api/page-hints')).toBe(403)
    expect((await agent.dismiss({ page: 'gigs' })).status).toBe(403)
  })
})

describe('where the route sits', () => {
  it('is registered under the artist surface, and is not one an agent token may call', () => {
    expect(read('src/index.ts')).toContain("app.route('/api/page-hints', pageHints)")
    expect(AGENT_ROUTES.some((r) => r.path.startsWith('/api/page-hints'))).toBe(false)
    expect(agentMayCall('GET', '/api/page-hints')).toBe(false)
    expect(agentMayCall('POST', '/api/page-hints/dismiss')).toBe(false)
  })

  it('keeps one tenant_settings row through the scoped helpers, with no passkey touch', () => {
    const route = read('src/routes/pageHints.ts')
    expect(route).toContain("'hints.dismissed'")
    expect(route).toContain('readTenantSetting(c.env, tenantOf(c)')
    expect(route).toContain('writeTenantSetting(c.env, tenant')
    expect(route).not.toMatch(/db\.(select|insert|update|delete)/)
    expect(route).not.toMatch(/elevat/i)
  })
})

describe('the heading', () => {
  const heading = read('frontend/src/components/PageHeading.tsx')

  it('shows the line outright only once the account\'s answer is in, and only while explanations are on', () => {
    expect(heading).toContain('appearance.showHints && read.data !== undefined && !read.data.dismissed.includes(page)')
  })

  it('puts it away with a button, at once, and afterwards draws it behind the info icon', () => {
    expect(heading).toContain('Got it')
    expect(heading).toContain('onMutate')
    expect(heading).toContain('<Explainer as="h1"')
  })

  it('carries the account\'s answer for every page from one request', () => {
    expect(heading).toContain("queryKey: ['page-hints']")
    expect(heading).toContain('staleTime: Infinity')
  })
})
