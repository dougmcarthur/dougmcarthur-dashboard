import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AGENT_ROUTES, agentMayCall } from '../shared/agentRoutes'
import {
  DEFAULT_BASE_URL,
  createGig,
  createPromoDraft,
  createSyncTarget,
  listGigs,
  listReferenceDocs,
  listSyncTargets,
  logRun,
  resolveBaseUrl,
  type ApiConfig,
} from '../scripts/agents/api'
import { TOOL_SPECS, inputProblem } from '../scripts/agents/tools'

/**
 * An issued agent token reaches seven routes and nothing else.
 *
 * The routines that hold one are Claude Code sessions with a shell, and the
 * proxy attaches their credential to any request for the host — so the list in
 * shared/agentRoutes.ts, not the tool list, is what stands between a festival
 * page and `DELETE /api/gigs/12`.
 */
describe('what an issued agent token may call', () => {
  it('admits the research routes, with or without a trailing slash', () => {
    for (const route of AGENT_ROUTES) {
      expect(agentMayCall(route.method, route.path), `${route.method} ${route.path}`).toBe(true)
      expect(agentMayCall(route.method.toLowerCase(), `${route.path}/`)).toBe(true)
    }
  })

  it('refuses anything that edits, deletes, or reaches past a listed path', () => {
    const refused: Array<[string, string]> = [
      ['DELETE', '/api/gigs/12'],
      ['PATCH', '/api/gigs/12'],
      ['GET', '/api/gigs/12'],
      ['PUT', '/api/gigs'],
      ['POST', '/api/gigs/12/application'],
      ['POST', '/api/sync/reconcile'],
      ['DELETE', '/api/sync/3'],
      ['GET', '/api/task-runs'],
      ['GET', '/api/agent-tokens'],
      ['POST', '/api/agent-tokens'],
      ['GET', '/api/artist'],
      ['POST', '/api/backfill/notes'],
      ['GET', '/api/admin/artists'],
      ['GET', '/api//gigs'],
    ]
    for (const [method, path] of refused) {
      expect(agentMayCall(method, path), `${method} ${path}`).toBe(false)
    }
  })

  it('is applied by the middleware to issued tokens', () => {
    // Source-level, because the middleware looks the token up in D1 and the
    // test environment has none. What must not happen is the check existing
    // here and being called nowhere.
    const src = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
    expect(src).toMatch(/agent\.tokenId !== null && !agentMayCall\(c\.req\.method, path\)/)
  })
})

describe('the agent runners ask only for what the Worker allows', () => {
  afterEach(() => vi.unstubAllGlobals())

  function recordRequests() {
    const seen: Array<{ method: string; path: string; headers: Record<string, string> }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        seen.push({ method, path: new URL(url).pathname, headers: (init?.headers ?? {}) as Record<string, string> })
        return new Response(JSON.stringify(method === 'POST' ? { id: 1 } : []), { status: 200 })
      }),
    )
    return seen
  }

  it('makes no request an issued token would be refused', async () => {
    const seen = recordRequests()
    const cfg: ApiConfig = { baseUrl: 'https://scout.test', token: 't', apply: true }
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await listReferenceDocs(cfg)
    await listGigs(cfg)
    await listSyncTargets(cfg)
    await createGig(cfg, { name: 'x' })
    await createSyncTarget(cfg, { name: 'x' })
    await createPromoDraft(cfg, { title: 'x' })
    await logRun(cfg, { taskId: 'gig-festival-scan', status: 'ok', summary: 's', itemsAdded: 0 })

    expect(seen).toHaveLength(7)
    for (const { method, path } of seen) expect(agentMayCall(method, path), `${method} ${path}`).toBe(true)
  })

  it('sends no Authorization header when it holds no token', async () => {
    // In a routine the proxy adds the credential. `Bearer ` with nothing after
    // it would be a header the Worker refuses, sitting where that one goes.
    const seen = recordRequests()
    await listGigs({ baseUrl: 'https://scout.test', token: '', apply: false })
    expect(seen[0].headers).not.toHaveProperty('Authorization')
  })

  it('falls back to production when SCOUT_API_URL is empty, not only when it is missing', () => {
    expect(resolveBaseUrl('')).toBe(DEFAULT_BASE_URL)
    expect(resolveBaseUrl(undefined)).toBe(DEFAULT_BASE_URL)
    expect(resolveBaseUrl('https://scout.test/')).toBe('https://scout.test')
  })
})

describe('tool input, checked before a command line sends it', () => {
  const gig = TOOL_SPECS.create_gig_opportunity

  it('accepts an input that fits', () => {
    expect(inputProblem(gig, { name: 'Folk Fest', type: 'festival', fitRationale: 'Fits.', paid: false })).toBeNull()
    expect(inputProblem(TOOL_SPECS.list_existing_gigs, {})).toBeNull()
  })

  it('names the field it does not know, and the ones it does', () => {
    const problem = inputProblem(gig, { name: 'x', type: 'festival', fitRationale: 'y', status: 'invited' })
    expect(problem).toContain('"status"')
    expect(problem).toContain('fitRationale')
  })

  it('says what is missing', () => {
    expect(inputProblem(gig, { name: 'x' })).toContain('type, fitRationale')
  })

  it('refuses the wrong type, including null', () => {
    expect(inputProblem(gig, { name: 'x', type: 'festival', fitRationale: 'y', paid: 'yes' })).toContain('paid')
    expect(inputProblem(gig, { name: 'x', type: 'festival', fitRationale: 'y', url: null })).toContain('null')
  })

  it('refuses something that is not an object', () => {
    expect(inputProblem(gig, ['x'])).toContain('one JSON object')
  })
})
