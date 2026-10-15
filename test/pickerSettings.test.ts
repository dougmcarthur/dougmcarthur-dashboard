import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { app } from '../src/index'
import { createSession, setSessionMode, sha256Hex } from '../src/lib/auth'
import { SESSION_COOKIE } from '../shared/auth'
import { projectNumberOfClientId } from '../src/lib/pickerSettings'
import { sqliteD1 } from './support/sqliteD1'

/**
 * The picker's API key and project number: public values the owner types once
 * in admin mode, read per request, with no environment fallback beside them.
 * What is held here is who may change them, what shape they must have, and that
 * the Drive tab reads the same row the owner wrote.
 */

const KEY = 'AIzaSyD-0123456789abcdefghijklmnopqrstu'
const NUMBER = '123456789012'

async function setup(vars: Record<string, string> = {}) {
  const { d1, db } = sqliteD1()
  const env = { DB: d1, DASHBOARD_URL: 'http://localhost:8787', ...vars } as never

  db.exec(`INSERT INTO tenants (id, display_name, created_at) VALUES ('tnt_0002', 'Artist', '2026-01-01')`)
  db.exec(`INSERT INTO users (id, role, tenant_id, display_name, created_at) VALUES ('usr_artist', 'artist', 'tnt_0002', 'Artist', '2026-01-01')`)

  const cookieFor = async (userId: string, admin: boolean) => {
    const { token } = await createSession(env, { credentialId: null, label: 'test', userId })
    if (admin) await setSessionMode(env, await sha256Hex(token), 'admin')
    return { Cookie: `${SESSION_COOKIE}=${token}` }
  }
  const get = (path: string, headers: Record<string, string> = {}) => app.request(path, { headers }, env)
  const patch = (body: unknown, headers: Record<string, string> = {}) =>
    app.request(
      '/api/admin/drive-picker',
      { method: 'PATCH', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) },
      env,
    )
  const asOwner = () => cookieFor('usr_0001', true)
  return { env, db, get, patch, cookieFor, asOwner }
}

describe('who may change the picker settings', () => {
  it('nobody without a session', async () => {
    const t = await setup()
    expect((await t.get('/api/admin/drive-picker')).status).toBe(401)
    expect((await t.patch({ apiKey: KEY })).status).toBe(401)
  })

  it('not an artist', async () => {
    const t = await setup()
    const as = await t.cookieFor('usr_artist', false)
    expect((await t.get('/api/admin/drive-picker', as)).status).toBe(403)
    expect((await t.patch({ apiKey: KEY }, as)).status).toBe(403)
  })

  it('not the owner either, until they have switched to admin mode', async () => {
    const t = await setup()
    const as = await t.cookieFor('usr_0001', false)
    const res = await t.patch({ apiKey: KEY }, as)
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ needsMode: 'admin' })
    expect(t.db.prepare(`SELECT count(*) AS n FROM app_settings WHERE key LIKE 'drive.picker%'`).get()).toEqual({ n: 0 })
  })
})

describe('what is stored', () => {
  it('starts unset, which is the state the Drive tab explains', async () => {
    const t = await setup()
    const body = (await (await t.get('/api/admin/drive-picker', await t.asOwner())).json()) as any
    expect(body).toEqual({ available: false, apiKey: null, appId: null, clientProjectNumber: null })
  })

  it('is available only with both halves', async () => {
    const t = await setup()
    const as = await t.asOwner()
    const half = (await (await t.patch({ apiKey: KEY }, as)).json()) as any
    expect(half).toMatchObject({ available: false, apiKey: KEY, appId: null })
    const both = (await (await t.patch({ appId: NUMBER }, as)).json()) as any
    expect(both).toMatchObject({ available: true, apiKey: KEY, appId: NUMBER })
  })

  it('clears a value when told to, and leaves the other alone', async () => {
    const t = await setup()
    const as = await t.asOwner()
    await t.patch({ apiKey: KEY, appId: NUMBER }, as)
    const cleared = (await (await t.patch({ apiKey: '' }, as)).json()) as any
    expect(cleared).toMatchObject({ available: false, apiKey: null, appId: NUMBER })
    const nulled = (await (await t.patch({ appId: null }, as)).json()) as any
    expect(nulled).toMatchObject({ apiKey: null, appId: null })
  })

  it('takes the shapes Google issues, and says which half was wrong', async () => {
    const t = await setup()
    const as = await t.asOwner()
    for (const apiKey of ['has spaces in it', '<script>alert(1)</script>', 'short', 'x'.repeat(101)]) {
      expect((await t.patch({ apiKey }, as)).status, apiKey).toBe(400)
    }
    // The project's name is what people paste first. It must not be accepted as the number.
    for (const appId of ['my-project-123', 'sun-dogs-scout', '12345', '1234567890123456', '12 34 56 78']) {
      expect((await t.patch({ appId }, as)).status, appId).toBe(400)
    }
    expect((await t.patch({ apiKey: KEY, appId: NUMBER }, as)).status).toBe(200)
  })

  it('rejects anything it was not asked for', async () => {
    const t = await setup()
    expect((await t.patch({ secret: 'x' }, await t.asOwner())).status).toBe(400)
  })
})

describe('the project number the client ID names', () => {
  it('is the digits before the first dash, and nothing else', () => {
    expect(projectNumberOfClientId('123456789012-abcdef.apps.googleusercontent.com')).toBe('123456789012')
    expect(projectNumberOfClientId('  123456789012-abcdef.apps.googleusercontent.com ')).toBe('123456789012')
    expect(projectNumberOfClientId(undefined)).toBeNull()
    expect(projectNumberOfClientId('')).toBeNull()
    expect(projectNumberOfClientId('not-a-client-id')).toBeNull()
    expect(projectNumberOfClientId('12-abc')).toBeNull()
  })

  it('is offered beside the setting and never saved on the owner’s behalf', async () => {
    const t = await setup({ GOOGLE_CLIENT_ID: `${NUMBER}-abc.apps.googleusercontent.com` })
    const as = await t.asOwner()
    const body = (await (await t.get('/api/admin/drive-picker', as)).json()) as any
    expect(body).toMatchObject({ appId: null, clientProjectNumber: NUMBER, available: false })
    expect(t.db.prepare(`SELECT count(*) AS n FROM app_settings WHERE key LIKE 'drive.picker%'`).get()).toEqual({ n: 0 })
  })
})

describe('what the Drive tab reads', () => {
  it('is the row the owner wrote, through the artist’s own status route', async () => {
    const t = await setup()
    const artist = await t.cookieFor('usr_artist', false)

    const before = (await (await t.get('/api/drive/status', artist)).json()) as any
    expect(before.picker).toEqual({ available: false, apiKey: null, appId: null })

    await t.patch({ apiKey: KEY, appId: NUMBER }, await t.asOwner())

    const after = (await (await t.get('/api/drive/status', artist)).json()) as any
    expect(after.picker).toEqual({ available: true, apiKey: KEY, appId: NUMBER })
  })

  it('does not read the environment, so a leftover variable cannot disagree with the screen', async () => {
    const t = await setup({ GOOGLE_PICKER_API_KEY: KEY, GOOGLE_CLOUD_PROJECT_NUMBER: NUMBER })
    const artist = await t.cookieFor('usr_artist', false)
    const body = (await (await t.get('/api/drive/status', artist)).json()) as any
    expect(body.picker.available).toBe(false)
  })
})

describe('there is one place for each value', () => {
  const strip = (path: string) =>
    readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('names neither old variable in the Worker, its types or the screens', () => {
    const names = /GOOGLE_PICKER_API_KEY|GOOGLE_CLOUD_PROJECT_NUMBER/
    for (const file of [
      'src/routes/drive.ts',
      'src/routes/admin.ts',
      'src/lib/pickerSettings.ts',
      'src/types.ts',
      'frontend/src/pages/artist/DriveTab.tsx',
      'frontend/src/components/DrivePickerPanel.tsx',
    ]) {
      expect(strip(file), file).not.toMatch(names)
    }
  })

  it('has no [vars] entry for either in wrangler.toml, since a second place is how the changed one is not the one read', () => {
    const toml = readFileSync('wrangler.toml', 'utf8').replace(/^\s*#.*$/gm, '')
    expect(toml).not.toMatch(/GOOGLE_PICKER_API_KEY|GOOGLE_CLOUD_PROJECT_NUMBER/)
  })

  it('asks for neither a password field nor a secret: both values are public', () => {
    const panel = strip('frontend/src/components/DrivePickerPanel.tsx')
    expect(panel).not.toMatch(/type="password"/)
  })
})
