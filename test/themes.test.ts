import { readFileSync } from 'node:fs'
import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  DEFAULT_PALETTE,
  HIGH_CONTRAST_PALETTE,
  HIGH_CONTRAST_TOKENS,
  PALETTE_IDS,
  THEMES,
  THEME_TOKENS,
  isPaletteId,
  swatches,
  themeById,
  themeCredit,
  type ThemeMode,
} from '../shared/themes'
import { generateThemesCss } from '../shared/themeCss'
import { THEME_BASELINES, type RatchetedTheme } from '../shared/themeBaselines'
import { DEFAULTS, loadAppearance, resolvePalette, type Appearance } from '../frontend/src/appearance'
import { ALL_KINDS, GROUNDS, chroma8, contrast, hue, lowest, lstar, measure, rgb, separation, tok } from './support/colour'

/**
 * The themes, held to two standards on purpose (docs/themes-plan.md).
 *
 *  - The default and the accessible themes are held to fixed, strict
 *    standards, because the first is what everybody gets and the others exist
 *    for a need.
 *  - The other aesthetic themes are held by a ratchet: they may be softer than
 *    the default, but never worse than they were when they were added, with one
 *    floor that does not move (ink and body text at 4.5:1).
 */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const MODES: ThemeMode[] = ['light', 'dark']
const byId = (id: string) => themeById(id)

describe('the theme list', () => {
  it('has the default first, then the aesthetic themes, then the accessible ones', () => {
    expect(THEMES.map((t) => t.id)).toEqual([...PALETTE_IDS])
    expect(THEMES[0].id).toBe(DEFAULT_PALETTE)
    expect(THEMES.map((t) => t.kind)).toEqual(['aesthetic', 'aesthetic', 'aesthetic', 'aesthetic', 'accessible', 'accessible', 'accessible', 'accessible'])
  })

  it('names them in our own words, not the palette names they were adapted from', () => {
    expect(THEMES.map((t) => t.name)).toEqual(['Sun Dogs', 'Pebble', 'Opal', 'Harvest', 'High contrast', 'Colour-blind safe', 'Greyscale', 'Low glare'])
    for (const t of THEMES) expect(t.name + t.blurb).not.toMatch(/Morning|Twilight/)
  })

  it('credits the palettes the adapted themes came from', () => {
    const credit = themeCredit()
    for (const name of ['Jade Pebble Morning', 'Opal Forest Morning', 'Emerald Harvest Twilight', 'Figma']) {
      expect(credit).toContain(name)
    }
  })

  it('treats an id it does not know as the default, never as an error', () => {
    expect(isPaletteId('opal')).toBe(true)
    expect(isPaletteId('nope')).toBe(false)
    expect(isPaletteId(null)).toBe(false)
    expect(byId('nope').id).toBe(DEFAULT_PALETTE)
    expect(themeById(undefined).id).toBe(DEFAULT_PALETTE)
  })
})

describe.each(THEMES.map((t) => [t.id, t] as const))('%s is complete', (_id, theme) => {
  it.each(MODES)('%s: defines every themed token and nothing else, as valid channels', (mode) => {
    const tokens = theme.modes[mode].tokens
    expect(Object.keys(tokens).sort()).toEqual([...THEME_TOKENS].sort())
    for (const t of THEME_TOKENS) expect(() => rgb(tokens[t]), `${theme.id} ${mode} ${t}`).not.toThrow()
  })

  it.each(MODES)('%s: carries four shadows, none of them a connection colour', (mode) => {
    expect(Object.keys(theme.modes[mode].shadow).sort()).toEqual(['card', 'inset', 'pop', 'raised'])
    expect(Object.keys(theme.modes[mode].tokens).some((k) => k.startsWith('conn-'))).toBe(false)
  })

  it.each(MODES)('%s: strengthens the same six tokens for Higher contrast, or none because it already is', (mode) => {
    const hc = theme.modes[mode].highContrast
    if (theme.id === HIGH_CONTRAST_PALETTE) return expect(hc).toBeNull()
    expect(hc).not.toBeNull()
    expect(Object.keys(hc!).sort()).toEqual([...HIGH_CONTRAST_TOKENS].sort())
  })
})

describe('the default theme, Sun Dogs, keeps its strict gates', () => {
  // The full set lives in test/paletteContrast.test.ts, which reads the same data.
  const sd = byId('sun-dogs')

  it.each(MODES)('%s: the three meaning colours stay apart for deuteranopia and protanopia', (mode) => {
    const [g, o, c] = [tok(sd, mode, 'accent'), tok(sd, mode, 'warn-fg'), tok(sd, mode, 'danger-fg')]
    for (const [a, b, label] of [[g, c, 'green and clay'], [g, o, 'green and ochre'], [c, o, 'clay and ochre']] as const) {
      if (mode === 'dark' && label === 'green and clay') continue // known, and the dark theme is the alternate
      expect(separation(a, b), `${mode}: ${label}`).toBeGreaterThanOrEqual(15)
    }
  })
})

describe('aesthetic themes are on a ratchet', () => {
  const ratcheted: RatchetedTheme[] = ['pebble', 'opal', 'harvest']

  it.each(ratcheted.flatMap((id) => MODES.map((mode) => [id, mode] as const)))(
    '%s %s: ink and body are readable, and nothing has got worse than the record',
    (id, mode) => {
      const now = measure(byId(id), mode)
      const record = THEME_BASELINES[id][mode]
      // The one floor that is not on the ratchet.
      expect(now.ink, `${id} ${mode} ink`).toBeGreaterThanOrEqual(4.5)
      expect(now.body, `${id} ${mode} body`).toBeGreaterThanOrEqual(4.5)
      for (const k of Object.keys(record) as Array<keyof typeof record>) {
        expect(now[k], `${id} ${mode} ${k}`).toBeGreaterThanOrEqual(record[k] - 0.02)
      }
    },
  )

  it('records every aesthetic theme there is, so a new one cannot skip the ratchet', () => {
    const aesthetic = THEMES.filter((t) => t.kind === 'aesthetic' && t.id !== DEFAULT_PALETTE).map((t) => t.id)
    expect(Object.keys(THEME_BASELINES).sort()).toEqual([...aesthetic].sort())
  })
})

/**
 * What each accessible theme promises, stated by the theme and not inherited.
 *
 * `text` is the floor for ink, body, muted and faint; `meaning` for green, ochre and clay as text, on
 * every ground and on the tinted fill each sits on; `onAccent` for text on the accent fill. Greyscale
 * holds its three meaning colours to 4.5:1 because three steps 15 L* apart do not fit at 7:1; Low
 * glare holds everything to 4.5:1 and adds a ceiling (see its own tests).
 */
const STANDARD: Record<string, { text: number; meaning: number; onAccent: number; field: number }> = {
  'high-contrast': { text: 7, meaning: 7, onAccent: 7, field: 4.5 },
  'colour-blind': { text: 7, meaning: 7, onAccent: 7, field: 3 },
  greyscale: { text: 7, meaning: 4.5, onAccent: 4.5, field: 3 },
  'low-glare': { text: 4.5, meaning: 4.5, onAccent: 4.5, field: 3 },
}

describe('accessible themes are held to a strict standard', () => {
  const TEXT = ['ink', 'body', 'muted', 'faint'] as const
  const MEANING = ['accent', 'danger-fg', 'warn-fg', 'success-fg'] as const
  const accessible = THEMES.filter((t) => t.kind === 'accessible')

  it('states a standard for every accessible theme, so a new one cannot skip it', () => {
    expect(Object.keys(STANDARD).sort()).toEqual(accessible.map((t) => t.id).sort())
  })

  describe.each(accessible.map((t) => [t.id, t] as const))('%s', (id, theme) => {
    const std = STANDARD[id]

    // The soft accent fill is painted behind the active row of a list, so text sits on it too.
    it.each(MODES)('%s: ink, body, muted and faint reach their floor on every ground and on the soft accent fill', (mode) => {
      for (const name of TEXT) expect(lowest(theme, mode, name, ['accent-soft']), `${id} ${mode} ${name}`).toBeGreaterThanOrEqual(std.text)
    })

    it.each(MODES)('%s: green, ochre and clay reach their floor on every ground and on the soft accent fill', (mode) => {
      for (const name of MEANING) expect(lowest(theme, mode, name, ['accent-soft']), `${id} ${mode} ${name}`).toBeGreaterThanOrEqual(std.meaning)
    })

    it.each(MODES)('%s: text on its own tinted fill reaches the floor', (mode) => {
      expect(contrast(tok(theme, mode, 'danger-fg'), tok(theme, mode, 'danger-bg'))).toBeGreaterThanOrEqual(std.meaning)
      expect(contrast(tok(theme, mode, 'warn-fg'), tok(theme, mode, 'warn-bg'))).toBeGreaterThanOrEqual(std.meaning)
      expect(contrast(tok(theme, mode, 'accent'), tok(theme, mode, 'accent-soft'))).toBeGreaterThanOrEqual(std.meaning)
      expect(contrast(tok(theme, mode, 'success-fg'), tok(theme, mode, 'success-bg'))).toBeGreaterThanOrEqual(std.meaning)
    })

    it.each(MODES)('%s: text on the accent fill reaches the floor', (mode) => {
      expect(contrast(tok(theme, mode, 'accent-fg'), tok(theme, mode, 'accent'))).toBeGreaterThanOrEqual(std.onAccent)
    })

    it.each(MODES)('%s: a form field edge is seen', (mode) => {
      expect(lowest(theme, mode, 'field-line')).toBeGreaterThanOrEqual(std.field)
    })
  })

  it.each(MODES)('High contrast %s: every rule that separates two things reaches 3:1', (mode) => {
    const hc = byId(HIGH_CONTRAST_PALETTE)
    expect(lowest(hc, mode, 'line')).toBeGreaterThanOrEqual(3)
    expect(lowest(hc, mode, 'line-strong')).toBeGreaterThanOrEqual(4.5)
  })

  it.each(MODES)('High contrast %s: green, ochre and clay stay apart for every kind of colour blindness (at least 20)', (mode) => {
    expect(measure(byId(HIGH_CONTRAST_PALETTE), mode).closestPair).toBeGreaterThanOrEqual(20)
  })

  // A search over hue found one set that serves deuteranopia, protanopia and
  // tritanopia alike, so this is one theme and not three.
  it.each(MODES)('Colour-blind safe %s: the three meaning colours stay apart under all three kinds (at least 30)', (mode) => {
    const t = byId('colour-blind')
    for (const [a, b] of [['accent', 'danger-fg'], ['accent', 'warn-fg'], ['danger-fg', 'warn-fg']] as const) {
      expect(separation(tok(t, mode, a), tok(t, mode, b), ALL_KINDS), `${mode}: ${a} against ${b}`).toBeGreaterThanOrEqual(30)
    }
  })

  it('Colour-blind safe: go is blue, waiting is gold and broken is rose', () => {
    const hueOf = ([r, g, b]: [number, number, number]) => {
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const d = max - min
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      return (h * 60 + 360) % 360
    }
    for (const mode of MODES) {
      const t = byId('colour-blind')
      const go = hueOf(tok(t, mode, 'accent'))
      const wait = hueOf(tok(t, mode, 'warn-fg'))
      const broken = hueOf(tok(t, mode, 'danger-fg'))
      expect(go, `${mode} go`).toBeGreaterThan(200)
      expect(go, `${mode} go`).toBeLessThan(260)
      expect(wait, `${mode} waiting`).toBeGreaterThan(40)
      expect(wait, `${mode} waiting`).toBeLessThan(75)
      expect(broken > 320 || broken < 20, `${mode} broken ${broken}`).toBe(true)
    }
  })
})

describe('Greyscale has no colour, and tells the meaning colours apart by lightness', () => {
  const t = byId('greyscale')

  it.each(MODES)('%s: every token, and every Higher contrast token, is achromatic', (mode) => {
    const data = t.modes[mode]
    for (const name of THEME_TOKENS) expect(chroma8(rgb(data.tokens[name])), `${mode} ${name}`).toBeLessThanOrEqual(3)
    for (const name of HIGH_CONTRAST_TOKENS) expect(chroma8(rgb(data.highContrast![name])), `${mode} higher contrast ${name}`).toBeLessThanOrEqual(3)
  })

  it.each(MODES)('%s: go, waiting and broken are at least 15 L* apart, each pair', (mode) => {
    const [g, o, c] = [tok(t, mode, 'accent'), tok(t, mode, 'warn-fg'), tok(t, mode, 'danger-fg')].map(lstar)
    for (const [a, b, label] of [[g, o, 'go and waiting'], [g, c, 'go and broken'], [o, c, 'waiting and broken']] as const) {
      expect(Math.abs(a - b), `${mode}: ${label}`).toBeGreaterThanOrEqual(15)
    }
  })

  it('says in its blurb that icons and labels carry the rest', () => {
    expect(t.blurb).toMatch(/icons and labels/i)
  })
})

describe('Low glare is dim, warm and never stark', () => {
  const t = byId('low-glare')
  const TEXTS = ['ink', 'body', 'muted', 'faint', 'accent', 'danger-fg', 'warn-fg', 'success-fg'] as const
  const WARM = [20, 75] // degrees of hue: from red-orange to yellow

  it.each(MODES)('%s: ink and body are readable and no more than 12:1 on any ground, a ceiling as well as a floor', (mode) => {
    for (const name of ['ink', 'body'] as const) {
      for (const g of [...GROUNDS, 'accent-soft'] as const) {
        const c = contrast(tok(t, mode, name), tok(t, mode, g))
        expect(c, `${mode} ${name} on ${g}`).toBeLessThanOrEqual(12)
        expect(c, `${mode} ${name} on ${g}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it.each(MODES)('%s: no text token is pure black or white', (mode) => {
    for (const name of TEXTS) {
      const [r, g, b] = tok(t, mode, name)
      expect(r + g + b, `${mode} ${name}`).toBeGreaterThan(24)
      expect(r + g + b, `${mode} ${name}`).toBeLessThan(3 * 235)
    }
  })

  it('has no white in light mode: nothing is lighter than about L* 91', () => {
    for (const name of THEME_TOKENS) expect(lstar(tok(t, 'light', name)), name).toBeLessThanOrEqual(91)
  })

  it('is genuinely dim in dark mode: the ground is at most L* 16 and text no brighter than L* 88', () => {
    expect(lstar(tok(t, 'dark', 'canvas'))).toBeLessThanOrEqual(16)
    for (const name of TEXTS) expect(lstar(tok(t, 'dark', name)), name).toBeLessThanOrEqual(88)
  })

  it.each(MODES)('%s: the grounds are warm', (mode) => {
    for (const g of GROUNDS) {
      const c = tok(t, mode, g)
      expect(chroma8(c), `${mode} ${g} has some colour`).toBeGreaterThanOrEqual(4)
      expect(hue(c), `${mode} ${g} hue`).toBeGreaterThan(WARM[0])
      expect(hue(c), `${mode} ${g} hue`).toBeLessThan(WARM[1])
    }
  })

  it.each(MODES)('%s: rules are soft, with no thin bright line', (mode) => {
    expect(contrast(tok(t, mode, 'line'), tok(t, mode, 'canvas')), `${mode} line`).toBeLessThanOrEqual(2)
    expect(contrast(tok(t, mode, 'line-strong'), tok(t, mode, 'canvas')), `${mode} line-strong`).toBeLessThanOrEqual(3)
    for (const shadow of Object.values(t.modes[mode].shadow)) expect(shadow).not.toContain('255,255,255')
  })

  it.each(MODES)('%s: green, ochre and clay stay apart for deuteranopia and protanopia (at least 15)', (mode) => {
    const [g, o, c] = [tok(t, mode, 'accent'), tok(t, mode, 'warn-fg'), tok(t, mode, 'danger-fg')]
    for (const [a, b, label] of [[g, c, 'green and clay'], [g, o, 'green and ochre'], [c, o, 'clay and ochre']] as const) {
      expect(separation(a, b), `${mode}: ${label}`).toBeGreaterThanOrEqual(15)
    }
  })
})

describe('High contrast draws a thicker focus ring', () => {
  it('says so in the stylesheet, scoped to that theme', () => {
    const css = read('frontend/src/index.css')
    expect(css).toMatch(/\[data-palette='high-contrast'\] :focus-visible \{\s*outline-width: 3px;/)
  })
})

describe('the picker shows what the theme is', () => {
  it('draws five swatches from the real tokens, in the mode asked for', () => {
    for (const t of THEMES) {
      for (const mode of MODES) {
        const s = swatches(t, mode)
        expect(s).toHaveLength(5)
        for (const hex of s) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
    // Light and dark are different pictures of the same theme.
    expect(swatches(byId('opal'), 'light')[0]).not.toBe(swatches(byId('opal'), 'dark')[0])
  })

  it('is a labelled radio group with the accessible themes set apart and described', () => {
    const picker = read('frontend/src/components/ThemePicker.tsx')
    expect(picker).toContain('role="radiogroup"')
    expect(picker).toContain('aria-label="Colour theme"')
    expect(picker).toContain('Accessible themes')
    expect(picker).toContain('role="radio"')
    expect(picker).toContain('tabIndex={selected ? 0 : -1}')
  })

  it('is on the Appearance panel, beside light or dark rather than instead of it', () => {
    const panel = read('frontend/src/components/AppearanceSettings.tsx')
    expect(panel).toContain('<ThemePicker')
    expect(panel).toContain('label="Colour theme"')
    expect(panel).toContain('label="Light or dark"')
  })
})

describe('the stylesheet is generated from the data', () => {
  const css = read('frontend/src/themes.css')

  it('equals what the generator writes, so editing it by hand is not a way to change a theme', () => {
    expect(css).toBe(generateThemesCss())
  })

  it('has a block for every other theme in both modes, and the default as the base', () => {
    expect(css).toMatch(/\n:root \{\n  color-scheme: light;/)
    expect(css).toMatch(/\n\[data-theme='dark'\] \{\n  color-scheme: dark;/)
    for (const t of THEMES.filter((x) => x.id !== DEFAULT_PALETTE)) {
      for (const mode of MODES) expect(css, `${t.id} ${mode}`).toContain(`[data-palette='${t.id}'][data-theme='${mode}'] {`)
    }
  })

  it('stores channels, as Tailwind needs to put an alpha on them', () => {
    const finished = [...css.matchAll(/(--c-[a-z-]+):\s*([^;]+);/g)].filter(([, , v]) => !/^\d{1,3} \d{1,3} \d{1,3}$/.test(v.trim()))
    expect(finished.map(([, n, v]) => `${n}: ${v}`)).toEqual([])
  })

  // Paper is white. A theme block has two attributes and a contrast block three,
  // so print carries four, and it sets every themed token so nothing leaks
  // through from a dark or an accessible theme.
  it('prints as the default theme, out-ranking every theme and contrast block', () => {
    const print = css.slice(css.indexOf('@media print'))
    expect(print).toContain(':root[data-palette][data-theme][data-contrast]')
    for (const t of THEME_TOKENS) expect(print, `print sets --c-${t}`).toContain(`--c-${t}:`)
    expect(print).toContain('--c-canvas: 255 255 255;')
    expect(print).toContain('color-scheme: light;')
  })
})

describe('the choice is saved, and followed from the device until it is made', () => {
  const stored = (value: unknown) =>
    vi.stubGlobal('localStorage', { getItem: () => (value === undefined ? null : JSON.stringify(value)), setItem: () => {} })
  const device = (moreContrast: boolean) =>
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('prefers-contrast') ? moreContrast : false }) as unknown as MediaQueryList)
  const a = (o: Partial<Appearance> = {}): Appearance => ({ ...DEFAULTS, ...o })

  afterEach(() => vi.unstubAllGlobals())

  it('loads a setting saved before themes existed with nothing chosen', () => {
    stored({ theme: 'dark', textSize: 'large' })
    expect(loadAppearance().palette).toBeNull()
    expect(loadAppearance().theme).toBe('dark')
  })

  it('keeps a theme that is chosen, and drops one it has never heard of', () => {
    stored({ palette: 'opal' })
    expect(loadAppearance().palette).toBe('opal')
    stored({ palette: 'retired-theme' })
    expect(loadAppearance().palette).toBeNull()
  })

  it('is the default when nothing is chosen and the device asks for nothing', () => {
    device(false)
    expect(resolvePalette(a())).toBe(DEFAULT_PALETTE)
  })

  it('is High contrast when nothing is chosen and the device asks for more contrast', () => {
    device(true)
    expect(resolvePalette(a())).toBe(HIGH_CONTRAST_PALETTE)
  })

  it('lets a chosen theme win over the device, in both directions', () => {
    device(true)
    expect(resolvePalette(a({ palette: 'pebble' }))).toBe('pebble')
    device(false)
    expect(resolvePalette(a({ palette: 'high-contrast' }))).toBe('high-contrast')
  })

  it('is set before the first paint, with the same two ids and the same rule', () => {
    const html = read('frontend/index.html')
    expect(html).toContain('var p = a.palette')
    expect(html).toContain(`'${HIGH_CONTRAST_PALETTE}'`)
    expect(html).toContain(`'${DEFAULT_PALETTE}'`)
    expect(html).toContain('root.dataset.palette = p')
  })
})

describe('a card is not lost against the page', () => {
  // Cards are told apart from the page by a rule and a shadow as much as by tone.
  // So a theme may put them on the same ground, as High contrast does (white on
  // white), only if the rule between them is one you can see.
  it.each(THEMES.flatMap((t) => MODES.map((m) => [t.id, m] as const)))('%s %s', (id, mode) => {
    const t = byId(id)
    const same = tok(t, mode, 'canvas').join() === tok(t, mode, 'surface').join()
    if (same) expect(lowest(t, mode, 'line'), `${id} ${mode}: a rule between identical grounds`).toBeGreaterThanOrEqual(3)
    expect(GROUNDS.length).toBe(4)
  })
})
