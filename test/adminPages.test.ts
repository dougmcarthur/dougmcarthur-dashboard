import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ADMIN_GROUPS, DEFAULT_ADMIN_SECTION, adminSectionLabel, resolveAdminRoute } from '../frontend/src/pages/admin/sections'
import { pageLabel, pageTitle } from '../frontend/src/hooks/usePageAnnouncement'

/**
 * The admin surface as a sidebar of pages.
 *
 * It was a single column eight panels long. What keeps it from growing back is
 * mostly in the source, so these read the source: a list that prints every row,
 * a button where a switch belongs, or a page that is in the menu and not in the
 * router are all things that typecheck and render, and are noticed here instead
 * of by somebody scrolling.
 */

const read = (path: string) => readFileSync(path, 'utf8')
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const sections = ADMIN_GROUPS.flatMap((g) => g.sections)

describe('the pages and the menu agree', () => {
  it('lists every page once, with a name nobody else has', () => {
    const ids = sections.map((s) => s.id)
    const labels = sections.map((s) => s.label)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('draws every page in the menu, and only those', () => {
    const router = withoutComments(read('frontend/src/pages/AdminPage.tsx'))
    const drawn = [...router.matchAll(/case '(\w+)':/g)].map((m) => m[1])
    expect(drawn.sort()).toEqual(sections.map((s) => s.id).sort())
  })

  it('opens the first page for a link it does not know', () => {
    expect(resolveAdminRoute(null, false)).toBe(DEFAULT_ADMIN_SECTION)
    expect(resolveAdminRoute('nope', false)).toBe(DEFAULT_ADMIN_SECTION)
    expect(resolveAdminRoute('', false)).toBe(DEFAULT_ADMIN_SECTION)
    for (const s of sections) expect(resolveAdminRoute(s.id, false)).toBe(s.id)
  })

  it('says which page it is in the tab, so a row of tabs tells them apart', () => {
    for (const s of sections) {
      expect(pageLabel(`admin/${s.id}`)).toBe(`${s.label} · Admin`)
      expect(pageTitle(`admin/${s.id}`)).toContain('Sun Dogs Music Scout')
    }
    // The plain route still reads as it did.
    expect(pageLabel('admin')).toBe('Admin')
    expect(pageLabel('admin/unknown')).toBe('Admin/unknown')
    expect(adminSectionLabel('unknown')).toBeNull()
  })

  it('names the external data sources as such, not by the pages they happen to be', () => {
    expect(adminSectionLabel('sources')).toBe('External data sources')
    expect(adminSectionLabel('findings')).toBe('Source findings')
    expect(adminSectionLabel('listings')).toBe('Landing page listings')
    const screens = ['ExternalSourcesPanel', 'SourceFindingsPanel', 'PublicListingsPanel'].map((n) =>
      read(`frontend/src/components/${n}.tsx`),
    )
    expect(screens.join('\n')).not.toMatch(/Pages Scout reads|title="Public listings"/)
  })
})

describe('no list prints every row', () => {
  // Each of these is a list that grows with the platform. If one stops paging,
  // the page it sits on starts getting longer again.
  const LISTS: Array<[string, string]> = [
    ['frontend/src/pages/admin/ArtistsSection.tsx', 'PagedList'],
    ['frontend/src/components/FeedbackInbox.tsx', 'PagedList'],
    ['frontend/src/components/InviteRequestsPanel.tsx', 'PagedList'],
    ['frontend/src/components/InvitesPanel.tsx', 'PagedList'],
    ['frontend/src/components/ExternalSourcesPanel.tsx', 'PagedList'],
    ['frontend/src/components/SourceFindingsPanel.tsx', '<Pager'],
    ['frontend/src/components/PublicListingsPanel.tsx', '<Pager'],
  ]

  for (const [file, pager] of LISTS) {
    it(`${file.split('/').pop()} pages its rows`, () => {
      expect(withoutComments(read(file))).toContain(pager)
    })
  }

  it('asks the Worker for a screenful, never for everything', () => {
    const api = read('frontend/src/api.ts')
    expect(api).toMatch(/listings: \(opts: \{ limit: number; offset: number/)
    expect(api).toMatch(/catalogCandidates: \(opts: \{ view: CandidateView; limit: number; offset: number/)
    const admin = withoutComments(read('src/routes/admin.ts'))
    // One route's handler: from its `admin.get(` to the next route.
    const route = (path: string) => {
      const from = admin.indexOf(`admin.get('${path}'`)
      expect(from, path).toBeGreaterThan(-1)
      const rest = admin.slice(from + 1)
      const next = rest.search(/\nadmin\.(get|patch|post|delete)\(/)
      return next < 0 ? rest : rest.slice(0, next)
    }
    for (const path of ['/listings', '/catalog/candidates']) {
      // The size comes from the allow-list, and the total from a count of the
      // same filter, so the pager's "of 212" is the database's and not the slice's.
      expect(route(path), path).toContain('parsePaging(')
      expect(route(path), path).toContain('.limit(limit)')
      expect(route(path), path).toContain('.offset(offset)')
      expect(route(path), path).toContain('count(*)')
    }
  })

  it('is the same on screen and in the Worker: three sizes, ten by default', () => {
    const pager = withoutComments(read('frontend/src/components/ui/Pager.tsx'))
    expect(pager).toContain("from '../../../../shared/pagination'")
    // The size is the one stored preference, and it is read through the
    // allow-list rather than trusted.
    expect(pager).toContain('normalisePageSize(window.localStorage.getItem(STORAGE_KEY))')
  })
})

describe('the sources page', () => {
  const panel = read('frontend/src/components/ExternalSourcesPanel.tsx')
  const code = withoutComments(panel)

  it('uses a switch, not a button that changes its own label', () => {
    expect(code).toContain('<Toggle')
    expect(code).not.toMatch(/Switch off|Switch on/)
  })

  it('lets the owner choose how often, from the set the Worker accepts', () => {
    expect(code).toContain('SOURCE_CADENCES')
    expect(code).toMatch(/updateSource\(id, \{? ?cadenceHours|patch: \{ cadenceHours \}/)
  })

  it('puts the sources that are off last and draws them quietly', () => {
    expect(code).toContain('orderSources(')
    expect(code).toMatch(/off \? 'bg-sunken\/60'/)
    // Choosing how often to read something that is not read does nothing.
    expect(code).toMatch(/disabled=\{off \|\| busy\}/)
  })

  it('shows what needs attention without counting a decision as a fault', () => {
    expect(code).toContain('needsAttention(')
    expect(code).toMatch(/s\.enabled && needsAttention\(s\.state\)/)
  })

  it('says its state in words as well as by the switch', () => {
    expect(code).toContain("stateText={{ on: 'On', off: 'Off' }}")
  })
})

describe('the sidebar', () => {
  const shell = read('frontend/src/components/ui/SidebarShell.tsx')
  const admin = read('frontend/src/pages/admin/AdminShell.tsx')

  it('is a navigation landmark of plain links, so back, bookmarks and open-in-new-tab work', () => {
    expect(shell).toContain('<nav aria-label={label}')
    expect(shell).toContain('href={hrefFor(s.id)}')
    expect(shell).toContain("aria-current={here ? 'page' : undefined}")
    expect(admin).toContain('label="Admin pages"')
    expect(admin).toContain('hrefFor={(id) => `#admin/${id}`}')
  })

  it('is one shell for the admin pages and for Settings, not two copies', () => {
    expect(read('frontend/src/pages/SettingsPage.tsx')).toContain('<SidebarShell')
    expect(admin).toContain('<SidebarShell')
    expect(admin).not.toContain('aria-current')
  })

  it('counts what needs the owner from one cheap route, and never reads a candidate to do it', () => {
    expect(admin).toContain("queryKey: ['admin', 'badges']")
    expect(admin).not.toContain("'catalog', 'sources'")
    const router = withoutComments(read('src/routes/admin.ts'))
    const from = router.indexOf("admin.get('/badges'")
    expect(from).toBeGreaterThan(-1)
    const route = router.slice(from, router.indexOf('\nadmin.', from + 1))
    // The sources page's list aggregates every candidate; the sidebar is on every admin page.
    expect(route).not.toContain('catalogCandidates')
    expect(route).toMatch(/s\.enabled === 1 && needsAttention\(/)
  })

  it('is refreshed by any write, without knowing which pages can write', () => {
    const main = read('frontend/src/main.tsx')
    expect(main).toContain('new MutationCache(')
    expect(main).toContain("invalidateQueries({ queryKey: ['admin', 'badges'] })")
  })

  it('says what a badge counts to a screen reader', () => {
    expect(shell).toContain('className="sr-only"')
  })
})

describe('search is a field, not a page', () => {
  const box = read('frontend/src/components/AdminSearch.tsx')

  it('is no longer one of the pages in the list', () => {
    expect(sections.map((s) => s.id)).not.toContain('search')
    expect(read('frontend/src/pages/AdminPage.tsx')).not.toContain('AdminSearch')
  })

  it('sits above the pages, in the sidebar and in the list a phone opens on', () => {
    expect(read('frontend/src/pages/admin/AdminShell.tsx')).toContain('top={<AdminSearch />}')
    const shell = read('frontend/src/components/ui/SidebarShell.tsx')
    expect(shell.match(/\{top\}/g)).toHaveLength(2)
  })

  it('is a search input that shows what it finds under itself, and puts it away again', () => {
    expect(box).toContain('type="search"')
    expect(box).toContain('role="region"')
    expect(box).toContain("e.key === 'Escape'")
    expect(box).toContain("document.addEventListener('mousedown'")
    // Each hit goes to the page it lives on, and choosing one clears the field.
    expect(box).toContain('href={`#admin/${g.section}`}')
    expect(box).toContain('onClick={clear}')
  })

  it('works from the keyboard: down into the results, up and down between them, Enter for the first', () => {
    expect(box).toContain("e.key === 'ArrowDown' && showing")
    expect(box).toContain("e.key === 'Enter' && showing")
    expect(box).toContain("e.key === 'ArrowUp'")
    // Escape from inside the results puts focus back in the field.
    expect(box).toMatch(/e\.key === 'Escape'\) \{\s*clear\(\)\s*field\(\)\?\.focus\(\)/)
  })

  it('announces the answer once, and does not wrap the links in a live region that reads each one', () => {
    expect(box).toContain('role="status"')
    expect(box).not.toContain('aria-live')
  })

  it('keeps what it covers behind the info icon, as every explanation is', () => {
    expect(box).toContain("useNote('search')")
    expect(box).toContain('never anybody&rsquo;s work')
  })
})

describe('the admin-mode pill in the header', () => {
  const layout = read('frontend/src/components/Layout.tsx')

  it('says which mode this is and nothing more, with the rest behind the info icon', () => {
    const pill = layout.slice(layout.indexOf('function AdminModeBadge'), layout.indexOf('interface LayoutProps'))
    expect(pill).toContain('>Admin mode</span>')
    expect(pill).toContain("useNote('Admin mode')")
    // The sentence that used to be the pill is the note now, not the pill.
    expect(pill).not.toMatch(/>\s*Admin mode\s*[—-]/)
    expect(layout).toContain('<AdminModeBadge />')
  })

  it('opens the note as a full-width row of its own, and closes it on Escape', () => {
    expect(layout).toContain("'order-last basis-full'")
    // Escape, the id that ties the button to the text, and the setting that hides every note are the hook's.
    const explainer = read('frontend/src/components/ui/Explainer.tsx')
    const hook = explainer.slice(explainer.indexOf('export function useNote'), explainer.indexOf('export interface ExplainerProps'))
    expect(hook).toMatch(/e\.key === 'Escape' && setOpen\(false\)/)
    expect(hook).toContain('appearance.showHints')
    expect(hook).toContain('useId()')
  })

  it('shares one info button with every other note in the app', () => {
    const explainer = read('frontend/src/components/ui/Explainer.tsx')
    expect(explainer).toContain('export function InfoToggle')
    expect(explainer).toContain('<InfoToggle open={open}')
    expect(explainer).toContain('<InfoToggle open={open} onClick={() => setOpen((o) => !o)} controls={id}')
  })
})
