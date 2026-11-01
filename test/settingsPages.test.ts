import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_SETTINGS_SECTION,
  LEGACY,
  SETTINGS_GROUPS,
  settingsGroupsFor,
  settingsSectionFromArg,
  settingsSectionLabel,
} from '../frontend/src/pages/settings/sections'
import { pageLabel } from '../frontend/src/hooks/usePageAnnouncement'

/**
 * Settings as a sidebar of pages.
 *
 * It was four tabs over a grid of a dozen cards, and "Account" was five errands
 * in a row. The things worth pinning are the ones that typecheck and render
 * either way: that an old link still lands somewhere sensible, that an artist is
 * never offered the owner's pages, and that a page's own heading is not said
 * twice. Same approach as `test/adminPages.test.ts`, whose shell this shares.
 */

const read = (path: string) => readFileSync(path, 'utf8')
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const all = SETTINGS_GROUPS.flatMap((g) => g.sections)

describe('the pages and the menu agree', () => {
  it('lists every page once, with a name nobody else has', () => {
    const ids = all.map((s) => s.id)
    const labels = all.map((s) => s.label)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('draws every page in the menu, and only those', () => {
    const page = withoutComments(read('frontend/src/pages/SettingsPage.tsx'))
    const drawn = [...page.matchAll(/case '(\w+)':/g)].map((m) => m[1])
    expect(drawn.sort()).toEqual(all.map((s) => s.id).sort())
  })

  it('says which page it is in the tab', () => {
    for (const s of all) expect(pageLabel(`settings/${s.id}`)).toBe(`${s.label} · Settings`)
    expect(pageLabel('settings')).toBe('Settings')
  })

  it('keeps every card somebody could reach before', () => {
    const page = read('frontend/src/pages/SettingsPage.tsx')
    for (const card of [
      'IntegrationsCard',
      'BandsintownCard',
      'AssociationsCard',
      'NudgeRoutingCard',
      'SuggestionsCard',
      'DigestSettingsCard',
      'ProfileCard',
      'HomeBaseCard',
      'PasskeysCard',
      'AgentTokensCard',
      'AdminModeCard',
      'NotesBackfillCard',
      'AppearanceSettings',
    ]) {
      expect(page, card).toContain(`<${card}`)
    }
  })
})

describe('an address that was valid yesterday', () => {
  it('reads the four old tabs as the pages that replaced them', () => {
    expect(settingsSectionFromArg('connections', false)).toBe('google')
    expect(settingsSectionFromArg('account', false)).toBe('profile')
    expect(settingsSectionFromArg('reminders', false)).toBe('reminders')
    expect(settingsSectionFromArg('appearance', false)).toBe('appearance')
  })

  it('lands somewhere for one that never existed, including none at all', () => {
    for (const arg of [null, undefined, '', 'nope', 'Profile', '../admin']) {
      expect(settingsSectionFromArg(arg, true)).toBe(DEFAULT_SETTINGS_SECTION)
    }
  })

  it('is one that every link in the code resolves, so none of them lands on the default by accident', () => {
    // Emails, notifications and the onboarding checklist all name a page by
    // hand. A page renamed or removed here and not there would send them to the
    // default without anything failing.
    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(full)
      }
    }
    ;['src', 'shared', 'frontend/src'].forEach(walk)

    const named = new Set<string>()
    for (const f of files) for (const m of read(f).matchAll(/#settings\/([a-z]+)/g)) named.add(m[1])
    expect(named.size).toBeGreaterThan(0)
    const known = new Set<string>([...all.map((s) => s.id), ...Object.keys(LEGACY)])
    expect([...named].filter((id) => !known.has(id))).toEqual([])
  })

  it('sends the owner-only notifications to the page that holds the way in', () => {
    expect(read('src/routes/feedback.ts')).toContain("href: '#settings/admin'")
    expect(read('src/routes/publicSite.ts')).toContain("href: '#settings/admin'")
  })
})

describe('the owner’s pages', () => {
  const ownerIds = SETTINGS_GROUPS.filter((g) => g.ownerOnly).flatMap((g) => g.sections.map((s) => s.id))

  it('are the agent tokens and the way into admin mode, and nothing else', () => {
    expect([...ownerIds].sort()).toEqual(['admin', 'tokens'])
  })

  it('are not in an artist’s sidebar and are not opened by an artist who asks', () => {
    const artist = settingsGroupsFor(false).flatMap((g) => g.sections.map((s) => s.id))
    for (const id of ownerIds) {
      expect(artist).not.toContain(id)
      expect(settingsSectionFromArg(id, false)).toBe(DEFAULT_SETTINGS_SECTION)
      expect(settingsSectionFromArg(id, true)).toBe(id)
    }
    expect(settingsGroupsFor(true).map((g) => g.label)).toContain('Owner')
    expect(settingsGroupsFor(false).map((g) => g.label)).not.toContain('Owner')
  })

  it('are drawn only for an owner, as well as being refused by the route', () => {
    const page = withoutComments(read('frontend/src/pages/SettingsPage.tsx'))
    expect(page).toMatch(/owner && <AgentTokensCard/)
    expect(page).toMatch(/owner && <AdminModeCard/)
    expect(page).toContain("const owner = session?.role === 'owner'")
  })
})

describe('a page’s heading is said once', () => {
  it('lets the page carry the title where its one card would repeat it', () => {
    const page = withoutComments(read('frontend/src/pages/SettingsPage.tsx'))
    for (const card of ['AppearanceSettings', 'AgentTokensCard', 'AdminModeCard']) {
      expect(page, card).toMatch(new RegExp(`<${card} titled=\\{false\\} />`))
    }
    // And each of them still titles itself where it is shown on its own.
    expect(read('frontend/src/components/AgentTokensCard.tsx')).toContain('titled = true')
    expect(read('frontend/src/components/AdminModeCard.tsx')).toContain('titled = true')
    expect(read('frontend/src/components/AppearanceSettings.tsx')).toContain('titled = true')
  })

  it('gives the Google card a name of its own under the page’s', () => {
    expect(settingsSectionLabel('google')).toBe('Google account')
    const card = read('frontend/src/components/IntegrationsCard.tsx')
    expect(card).toContain('>Connected services</h2>')
    expect(card).not.toContain('>Integrations</h2>')
  })
})

describe('the sidebar’s badge', () => {
  it('counts a connection that stopped working by the rule the card uses, from the same query', () => {
    const card = read('frontend/src/components/IntegrationsCard.tsx')
    const hook = card.slice(card.indexOf('export function useConnectionAttention'), card.indexOf('export function IntegrationsCard'))
    expect(hook).toContain("queryKey: ['health']")
    expect(hook).toContain('rowNeedsAttention(r.spec, r.state)')
    expect(read('frontend/src/pages/SettingsPage.tsx')).toContain('useConnectionAttention()')
  })

  it('is on Google account and nowhere else', () => {
    const page = read('frontend/src/pages/SettingsPage.tsx')
    expect(page).toMatch(/failing > 0 \? \{ google: \{ count: failing, tone: 'attention'/)
  })
})

describe('the navigation outside Settings', () => {
  it('still highlights Settings on every one of its pages', () => {
    const layout = read('frontend/src/components/Layout.tsx')
    expect(layout).toContain("const here = page.split('/')[0]")
    expect(layout).not.toMatch(/aria-current=\{page === /)
  })
})
