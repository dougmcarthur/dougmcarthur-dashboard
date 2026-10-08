import { readFileSync } from 'node:fs'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { DEFAULTS, resolveContrast, type Appearance } from '../frontend/src/appearance'
import { pageLabel, pageTitle } from '../frontend/src/hooks/usePageAnnouncement'

/**
 * The parts of the shell that decide whether somebody who cannot see the screen
 * can still use it, held at source level.
 *
 * Each of these rendered fine while being wrong: a route change that said
 * nothing, a skip link that blanked the page it skipped to, a theme chosen only
 * after a flash of the wrong one.
 */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const a = (o: Partial<Appearance> = {}): Appearance => ({ ...DEFAULTS, ...o })

afterEach(() => vi.unstubAllGlobals())

describe('page changes are announced', () => {
  it('titles the tab for every page the navigation offers', () => {
    const layout = read('frontend/src/components/Layout.tsx')
    const links = [...layout.matchAll(/\{ id: '([a-z]+)', label: '([^']+)' \}/g)]
    expect(links.length).toBeGreaterThanOrEqual(8)
    for (const [, id, label] of links) {
      expect(pageLabel(id), id).toBe(label)
      expect(pageTitle(id)).toBe(`${label} · Sun Dogs Music Scout`)
    }
  })

  it('says something sensible for a page it has not heard of', () => {
    expect(pageLabel('somewhere')).toBe('Somewhere')
    expect(pageLabel('')).toBe('Overview')
  })

  it('moves focus to the content on a page change, and the content can take it', () => {
    const layout = read('frontend/src/components/Layout.tsx')
    expect(layout).toContain('usePageAnnouncement(page, mainRef)')
    expect(layout).toMatch(/<main[^>]*\btabIndex=\{-1\}/)
    expect(read('frontend/src/hooks/usePageAnnouncement.ts')).toContain('main.current?.focus(')
  })

  // With hash routing `#main` is a route. Following the link as written sent
  // the app to a page called "main", which draws nothing.
  it('does not let the skip link navigate to a route called main', () => {
    const layout = read('frontend/src/components/Layout.tsx')
    expect(layout).toMatch(/className="skip-link"[\s\S]{0,120}onClick=\{\(e\) => \{\s*e\.preventDefault\(\)/)
  })
})

describe('the first paint is the right theme', () => {
  const html = read('frontend/index.html')

  it('writes the same default theme as the settings do', () => {
    expect(html).toContain(`a.theme || '${DEFAULTS.theme}'`)
  })

  it('reads the saved setting from the key the settings write to', () => {
    expect(html).toContain("localStorage.getItem('musichq.appearance')")
    expect(read('frontend/src/appearance.ts')).toContain("const KEY = 'musichq.appearance'")
  })

  it('sets the theme before the stylesheet is allowed to paint', () => {
    expect(html.indexOf('<script>')).toBeGreaterThan(-1)
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('/src/main.tsx'))
  })

  it('opens light, because light is the default', () => {
    expect(DEFAULTS.theme).toBe('light')
    const css = read('frontend/src/themes.css')
    expect(css).toMatch(/\n:root \{\n\s*color-scheme: light;/)
    expect(css).toMatch(/\n\[data-theme='dark'\] \{\n\s*color-scheme: dark;/)
  })
})

describe('contrast follows the device until told otherwise', () => {
  const device = (more: boolean) =>
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('prefers-contrast') ? more : false }) as unknown as MediaQueryList)

  it('takes the operating system setting when nothing has been chosen', () => {
    expect(DEFAULTS.highContrast).toBeNull()
    device(true)
    expect(resolveContrast(a())).toBe(true)
    device(false)
    expect(resolveContrast(a())).toBe(false)
  })

  it('lets a choice made here win, in either direction', () => {
    device(true)
    expect(resolveContrast(a({ highContrast: false }))).toBe(false)
    device(false)
    expect(resolveContrast(a({ highContrast: true }))).toBe(true)
  })

  it('reads the device setting before the first paint too', () => {
    expect(read('frontend/index.html')).toContain('prefers-contrast: more')
  })
})

describe('form fields have an edge you can see', () => {
  it('draws a FIELD with the field edge token, not the soft card rule', () => {
    const field = read('frontend/src/components/ui/Field.tsx')
    // The class string itself, not the comment above it that explains the choice.
    const base = field.slice(field.indexOf('const BASE'), field.indexOf('/** Fills'))
    expect(base).toContain('border border-field rounded-md')
    expect(base).not.toContain('border-line-strong')
  })

  it('declares the token to Tailwind, so a class that names it exists', () => {
    expect(read('tailwind.config.js')).toContain("field: 'rgb(var(--c-field-line) / <alpha-value>)'")
  })
})

describe('forced colours', () => {
  const css = read('frontend/src/index.css')
  const block = css.slice(css.indexOf('@media (forced-colors: active)'))

  it('keeps a selected control looking selected when fills are removed', () => {
    expect(block).toContain("[aria-pressed='true']")
    expect(block).toMatch(/outline:\s*2px solid Highlight/)
  })

  it('keeps the status dots, which are backgrounds', () => {
    expect(block).toContain('forced-color-adjust: none')
  })
})
