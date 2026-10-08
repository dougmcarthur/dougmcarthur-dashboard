import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import appearance from '../src/routes/appearance'
import { AGENT_ROUTES, agentMayCall } from '../shared/agentRoutes'

/**
 * The colour theme follows the account (docs/themes-plan.md). There is no D1 in
 * the test environment, so what runs is the validation and the refusals that
 * come before the database, and the rest is held at source level.
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

function appAs(kind: 'user' | 'agent') {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('actor' as never, { kind, tenant: 'ten_test', tokenId: null } as never)
    await next()
  })
  app.route('/api/appearance', appearance)
  return app
}
const put = (app: Hono, body: unknown) =>
  app.request('/api/appearance', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('PUT /api/appearance validates before it touches anything', () => {
  it('refuses an id that is not a colour theme', async () => {
    expect((await put(appAs('user'), { palette: 'neon' })).status).toBe(400)
    expect((await put(appAs('user'), { palette: '' })).status).toBe(400)
    expect((await put(appAs('user'), { palette: 3 })).status).toBe(400)
  })

  it('refuses a body with no palette, or with anything else beside it', async () => {
    expect((await put(appAs('user'), {})).status).toBe(400)
    expect((await put(appAs('user'), { palette: 'opal', theme: 'dark' })).status).toBe(400)
  })

  it('refuses an agent credential on both verbs', async () => {
    expect((await put(appAs('agent'), { palette: 'opal' })).status).toBe(403)
    expect((await appAs('agent').request('/api/appearance')).status).toBe(403)
  })
})

describe('where the route sits', () => {
  const index = read('src/index.ts')

  it('is registered under the artist surface, so admin mode (which has no tenant) never reaches it', () => {
    expect(index).toContain("app.route('/api/appearance', appearance)")
    expect('/api/appearance').not.toMatch(/^\/api\/admin\//)
  })

  it('is not one of the routes an issued agent token may call', () => {
    expect(AGENT_ROUTES.some((r) => r.path.startsWith('/api/appearance'))).toBe(false)
    expect(agentMayCall('GET', '/api/appearance')).toBe(false)
    expect(agentMayCall('PUT', '/api/appearance')).toBe(false)
  })

  it('stores one tenant_settings row through the scoped helpers and needs no passkey touch', () => {
    const route = read('src/routes/appearance.ts')
    expect(route).toContain("'appearance.palette'")
    expect(route).toContain('readTenantSetting(c.env, tenantOf(c)')
    expect(route).toContain('writeTenantSetting(c.env, tenantOf(c)')
    expect(route).not.toMatch(/db\.(select|insert|update|delete)/)
    expect(route).not.toMatch(/elevat/i)
  })

  it('stores only the colour theme, never light or dark, size, typeface or the rest', () => {
    const route = read('src/routes/appearance.ts')
    for (const word of ['textSize', 'customFont', 'highContrast', 'reduceMotion', 'underlineLinks']) expect(route).not.toContain(word)
  })
})

describe('the client', () => {
  const hook = read('frontend/src/hooks/useAppearance.tsx')
  const app = read('frontend/src/App.tsx')

  it('reads the account once, only while signed in as an artist, and never writes what it read back', () => {
    expect(hook).toContain('api.appearance')
    expect(hook).toMatch(/adoptPalette/)
    // Mounted on the artist surface only: the admin branch returns before it.
    expect(app.indexOf('<AccountAppearance />')).toBeGreaterThan(app.indexOf("session?.mode === 'admin'"))
  })

  it('applies a choice on this device first and sends it in the background, ignoring a failure', () => {
    expect(hook).toContain('setAppearance((prev) => ({ ...prev, ...patch }))')
    expect(hook).toMatch(/api\.appearance\.save\(palette\)\)\.catch\(\(\) => undefined\)/)
  })

  it('keeps the device value as the first paint, with no wait on the network', () => {
    expect(read('frontend/src/main.tsx')).toContain('applyAppearance(loadAppearance())')
  })
})
