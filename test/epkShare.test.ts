import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The public EPK, read off the source: where its token travels and what its
 * route may return. These are properties that typecheck and render whether
 * they hold or not, so they are pinned here rather than trusted.
 */
function source(path: string): string {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('the share token', () => {
  const client = source('frontend/src/api.ts')

  it('travels in a POST body, never a path', () => {
    expect(client).toContain("apiFetch<EpkPage>('/public/epk', { method: 'POST'")
    expect(client).not.toMatch(/\/public\/epk\/\$\{/)
  })

  it('is read from the URL fragment, the invitation’s arrangement', () => {
    const gate = source('frontend/src/components/AuthGate.tsx')
    expect(gate).toContain("page === 'epk' && arg")
    expect(gate).not.toContain('location.search')
  })
})

describe('the public route', () => {
  const route = source('src/routes/epk.ts')
  const index = source('src/index.ts')

  it('is the only public prefix besides the sign-in ceremonies', () => {
    const block = index.slice(index.indexOf('const PUBLIC_API_PREFIXES'), index.indexOf(']', index.indexOf('const PUBLIC_API_PREFIXES')))
    expect([...block.matchAll(/'(\/api\/[^']+)'/g)].map((m) => m[1])).toEqual(['/api/auth/', '/api/public/'])
  })

  it('never returns what was withheld, and never a token from the list', () => {
    const pub = route.slice(route.indexOf("publicEpk.post('/epk'"))
    expect(pub).toContain('withheld: _withheld')
    const list = route.slice(route.indexOf("epk.get('/shares'"), route.indexOf("epk.post('/shares'"))
    expect(list).not.toMatch(/\btoken(Hash)?\b/)
  })
})
