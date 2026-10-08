import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { themeById } from '../shared/themes'
import { GROUNDS, contrast, deltaE, rgb, separation, type Rgb } from './support/colour'

/**
 * The default theme's numbers, held by the theme itself.
 *
 * index.css claimed "tertiary text lands at 4.6:1 or better in both themes" for
 * a long time, and the dark theme's `faint` was 3.3 to 3.9 against its surfaces
 * the whole while. A comment cannot fail; this can. It reads the tokens out of
 * the theme data, the same data the stylesheet is generated from, so a value
 * changed in one place is checked in the same breath.
 *
 * What is asserted, and what is not:
 *  - text tokens reach 4.5:1 on every ground in both modes, and on their own
 *    tinted fill where they sit on one;
 *  - in the LIGHT mode the three meaning colours stay apart for a colour-blind
 *    reader, measured the way the head of index.css describes. The dark mode's
 *    green against its clay is known to be close (about 4) and is not
 *    asserted: dark is the alternate and that is its own job.
 *
 * The other themes are held by test/themes.test.ts.
 */

const sunDogs = themeById('sun-dogs')
const record = (channels: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(channels).map(([k, v]) => [k, rgb(v)])) as Record<string, Rgb>

const THEMES = {
  light: record(sunDogs.modes.light.tokens),
  dark: record(sunDogs.modes.dark.tokens),
}
const HIGH = {
  light: record(sunDogs.modes.light.highContrast!),
  dark: record(sunDogs.modes.dark.highContrast!),
}

const css = readFileSync(new URL('../frontend/src/themes.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const TEXT = ['ink', 'body', 'muted', 'faint', 'accent', 'danger-fg', 'warn-fg', 'success-fg']
const ON_OWN_FILL: Array<[string, string]> = [
  ['danger-fg', 'danger-bg'],
  ['warn-fg', 'warn-bg'],
  ['success-fg', 'success-bg'],
  ['info-fg', 'info-bg'],
  ['accent', 'accent-soft'],
  ['accent-fg', 'accent'],
]

describe.each(Object.entries(THEMES))('%s text contrast', (name, t) => {
  it('reads every token it checks', () => {
    for (const k of [...GROUNDS, ...TEXT, ...ON_OWN_FILL.flat()]) expect(t[k], `${name} --c-${k}`).toBeDefined()
  })

  it.each(TEXT)('%s reaches 4.5:1 on every ground', (token) => {
    for (const ground of GROUNDS) {
      expect(contrast(t[token], t[ground]), `${name}: ${token} on ${ground}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(ON_OWN_FILL)('%s reaches 4.5:1 on %s', (fg, bg) => {
    expect(contrast(t[fg], t[bg]), `${name}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
  })
})

describe('light mode meaning colours', () => {
  const t = THEMES.light
  const trio: Array<[string, string]> = [
    ['accent', 'danger-fg'],
    ['accent', 'warn-fg'],
    ['danger-fg', 'warn-fg'],
  ]

  // Ochre against clay was 3.6 when ochre was first tried against the old clay:
  // two warm browns that a deuteranope reads as one. The floor is set under
  // the weakest pair now (green against clay, about 17) and above the pairs
  // that failed.
  it.each(trio)('%s and %s stay apart for a colour-blind reader (ΔE of at least 15)', (a, b) => {
    expect(separation(t[a], t[b]), `${a} against ${b}`).toBeGreaterThanOrEqual(15)
  })

  it('keeps ochre a different colour from clay for everyone else too', () => {
    expect(deltaE(t['warn-fg'], t['danger-fg'])).toBeGreaterThan(25)
  })
})

describe('form field edges', () => {
  // The edge of a box you are meant to type in is the one rule WCAG asks to
  // reach 3:1 (1.4.11). The lines around cards and rows stay soft on purpose.
  it.each(Object.entries(THEMES))('%s: reaches 3:1 on every ground', (name, t) => {
    for (const ground of GROUNDS) {
      expect(contrast(t['field-line'], t[ground]), `${name}: field edge on ${ground}`).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('higher contrast', () => {
  it.each(['light', 'dark'] as const)('%s: secondary text reaches 7:1 and a field edge 4.5:1', (mode) => {
    const t = { ...THEMES[mode], ...HIGH[mode] }
    for (const token of ['body', 'muted', 'faint']) {
      for (const ground of GROUNDS) {
        expect(contrast(t[token], t[ground]), `${mode}: ${token} on ${ground}`).toBeGreaterThanOrEqual(7)
      }
    }
    for (const ground of GROUNDS) {
      expect(contrast(t['field-line'], t[ground]), `${mode}: field edge on ${ground}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('print', () => {
  const print = css.slice(css.indexOf('@media print'))

  it('prints warn as ochre and danger text as clay, on any theme', () => {
    expect(print).toMatch(/--c-warn-fg:\s*139 94 0;/)
    expect(print).toMatch(/--c-danger-fg:\s*118 40 28;/)
  })

  // A theme block and a contrast block are `[data-…]` selectors, which out-rank
  // a bare `:root`. Print has to out-rank them back, or a dark page prints pale
  // text on white paper.
  it('out-ranks a theme and a contrast setting', () => {
    expect(print).toContain(':root[data-theme][data-contrast]')
  })
})
