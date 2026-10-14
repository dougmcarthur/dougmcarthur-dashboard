import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const layout = read('frontend/src/components/Layout.tsx')
const passkeys = read('frontend/src/components/PasskeysCard.tsx')
const hook = read('frontend/src/hooks/useSignOut.ts')

describe('signing out', () => {
  it('is in the header menu, on every page', () => {
    expect(layout).toContain('useSignOut()')
    expect(layout).toMatch(/signOut\.mutate\(\)/)
    expect(layout).toContain('Sign out')
  })

  // The menu used to be `hidden` in admin mode, which left "leave admin mode,
  // then find Settings" as the only way out of the more privileged surface.
  it('is reachable in admin mode too, where the destinations are refused', () => {
    expect(layout).not.toMatch(/relative \$\{admin \? 'hidden'/)
    const menu = layout.slice(layout.indexOf('id="mobile-nav"'))
    const nav = menu.slice(0, menu.indexOf('</nav>'))
    // Every page in the menu sits behind `!admin`; Sign out sits outside it.
    const gated = nav.slice(nav.indexOf('{!admin && ('), nav.indexOf('Sign out'))
    expect(gated).toContain('NAV_LINKS.map')
    expect(gated).toContain('MORE_LINKS.map')
    expect(gated).toContain('</>')
  })

  it('is one mutation, shared, and does not claim to confirm', () => {
    expect(passkeys).toContain('useSignOut()')
    for (const [file, src] of [
      ['Layout.tsx', layout],
      ['PasskeysCard.tsx', passkeys],
    ] as const) {
      // `logoutEverywhere` is a different call with a different confirmation.
      expect(src, file).not.toMatch(/api\.auth\.logout\(/)
    }
    expect(hook).toContain('api.auth.logout()')
    // Reloading is what leaves no stale panel from the signed-out page.
    expect(hook).toContain('window.location.reload()')
    expect(layout).not.toMatch(/confirm\([^)]*[Ss]ign out/)
  })
})
