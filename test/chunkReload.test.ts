import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isStaleChunkError, RELOAD_WINDOW_MS, shouldReloadForStaleChunk } from '../frontend/src/chunkReload'

/**
 * Every page but the Overview is its own script, and each deploy replaces the
 * set. A tab opened before a deploy then fails to open the page it was asked
 * for, and `React.lazy` remembers the failure. These pin the two halves: the
 * decision to reload, and the wiring that keeps the split in place.
 */

const NOW = 1_800_000_000_000

describe('telling a stale page from any other error', () => {
  it('knows what Chrome, Firefox and Safari say when a script will not load', () => {
    const chrome = new TypeError('Failed to fetch dynamically imported module: https://scout.example/assets/GigsPage-abc.js')
    const firefox = new TypeError('error loading dynamically imported module: https://scout.example/assets/GigsPage-abc.js')
    const safari = new TypeError('Importing a module script failed.')
    for (const error of [chrome, firefox, safari]) expect(isStaleChunkError(error), error.message).toBe(true)
  })

  it('does not reload for an ordinary fault in a page', () => {
    // A reload cannot fix a bug, and would hide it behind a flash.
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false)
    expect(isStaleChunkError(new Error('Request failed: 500'))).toBe(false)
    expect(isStaleChunkError(undefined)).toBe(false)
  })
})

describe('reloading once, and not in a loop', () => {
  const stale = new TypeError('Failed to fetch dynamically imported module: x')

  it('reloads the first time', () => {
    expect(shouldReloadForStaleChunk({ error: stale, lastReloadAt: null, now: NOW, online: true })).toBe(true)
  })

  it('shows the error when the reload it just made did not cure it', () => {
    // The chunk is still missing: the deploy is half-switched, or the file is
    // genuinely gone. Reloading again is a loop.
    expect(shouldReloadForStaleChunk({ error: stale, lastReloadAt: NOW - 5_000, now: NOW, online: true })).toBe(false)
  })

  it('reloads again for a later deploy in the same tab', () => {
    const later = NOW - RELOAD_WINDOW_MS - 1
    expect(shouldReloadForStaleChunk({ error: stale, lastReloadAt: later, now: NOW, online: true })).toBe(true)
  })

  it('does not reload while offline, where it would land on the browser error page', () => {
    expect(shouldReloadForStaleChunk({ error: stale, lastReloadAt: null, now: NOW, online: false })).toBe(false)
  })

  it('does not reload for an error that is not a stale page', () => {
    expect(shouldReloadForStaleChunk({ error: new Error('boom'), lastReloadAt: null, now: NOW, online: true })).toBe(false)
  })
})

describe('the split stays in place', () => {
  const app = readFileSync('frontend/src/App.tsx', 'utf8')

  it('imports no page statically but the Overview', () => {
    // A static import puts the page back in the first script. It typechecks
    // and renders, and the 950 kB bundle is back.
    // Any form of import, so `import { GigsPage as G }` and a default import
    // are caught as well. A path with a further slash is a helper, not a page.
    const imported = [...app.matchAll(/^import [^\n]*from '\.\/pages\/(\w+)'/gm)].map((m) => m[1])
    expect(imported).toEqual(['OverviewPage'])
  })

  it('sends a failed page load through the reload-once rule', () => {
    expect(app).toMatch(/reloadForStaleChunk\(error\)/)
    // And throws what it does not recognise, so the error boundary still shows it.
    expect(app).toMatch(/throw error/)
  })
})
