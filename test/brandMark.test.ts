import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { BRAND_GROUND, BRAND_INK, BRAND_MARK_PATH, logoSvg, maskSvg, tabIconSvg } from '../shared/brandMark'
import { THEMES, channelsToHex } from '../shared/themes'

/**
 * The logo on the site and in the tab, in whatever theme a person chose.
 *
 * It sits beside the whole product name and never replaces it (the product is
 * not named on "Scout" alone), it is decorative to a screen reader, and one
 * drawing, `shared/brandMark.ts`, feeds every size: the in-page tile, the tab
 * icons and the link-preview card (`scripts/og/render.mjs` writes the files).
 *
 * The colour is a token pair, `mark` and `mark-fg`, so the tile follows the
 * palette like everything else. The Sun Dogs theme keeps the brand's orange and
 * plum; every other theme uses its accent pair, which the theme tests already
 * hold to a button's contrast, so the mark is as legible as a button everywhere.
 */
const read = (path: string) => readFileSync(path, 'utf8')
const bytes = (path: string) => readFileSync(path)

const DOCUMENTS = ['frontend/index.html', 'frontend/privacy/index.html', 'frontend/terms-of-service/index.html']

describe('the files are the drawing', () => {
  it('has the logo, its mask and its tab icon written from shared/brandMark.ts', () => {
    expect(read('frontend/public/logo.svg')).toBe(logoSvg())
    expect(read('frontend/public/logo-mark.svg')).toBe(maskSvg())
    expect(read('frontend/public/favicon.svg')).toBe(tabIconSvg())
  })

  it('draws the brand in orange and plum, and the mask without a colour of its own', () => {
    expect(logoSvg()).toContain(`fill="${BRAND_GROUND}"`)
    expect(logoSvg()).toContain(`fill="${BRAND_INK}"`)
    expect(maskSvg()).toContain(BRAND_MARK_PATH)
    expect(maskSvg()).not.toContain(BRAND_GROUND)
  })

  it('draws the tab icon in any two colours it is given', () => {
    const svg = tabIconSvg('rgb(1,2,3)', 'rgb(4,5,6)')
    expect(svg).toContain('fill="rgb(1,2,3)"')
    expect(svg).toContain('fill="rgb(4,5,6)"')
    expect(svg).toContain('clip-path')
  })
})

describe('the tab icon', () => {
  it.each(DOCUMENTS)('%s declares all three icons, and each file exists', (doc) => {
    const html = read(doc)
    for (const href of ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png']) {
      expect(html, `${doc} links ${href}`).toContain(`href="${href}"`)
      expect(existsSync(`frontend/public${href}`), href).toBe(true)
    }
  })

  it('is an .ico that holds 16, 32 and 48px images', () => {
    const ico = bytes('frontend/public/favicon.ico')
    expect(ico.readUInt16LE(2)).toBe(1) // type: icon
    const count = ico.readUInt16LE(4)
    const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + 16 * i))
    expect(sizes).toEqual([16, 32, 48])
  })

  it('has an iOS icon that is 180px and opaque', () => {
    const png = bytes('frontend/public/apple-touch-icon.png')
    expect(png.readUInt32BE(16)).toBe(180)
    expect(png.readUInt32BE(20)).toBe(180)
    // IHDR colour type 2 is RGB; 6 would be RGBA, whose transparent corners iOS paints black.
    expect(png.readUInt8(25)).toBe(2)
  })

  it('follows the chosen theme, from the same two tokens the tile reads', () => {
    const appearance = read('frontend/src/appearance.ts')
    expect(appearance).toMatch(/syncTabIcon\(root\)/)
    expect(appearance).toContain("getPropertyValue('--c-mark')")
    expect(appearance).toContain("getPropertyValue('--c-mark-fg')")
    expect(appearance).toContain('tabIconSvg(')
  })
})

describe('the mark takes the theme', () => {
  const MODES = ['light', 'dark'] as const

  it('keeps the brand colours in the default theme and its own accent in every other', () => {
    for (const mode of MODES) {
      const sunDogs = THEMES.find((t) => t.id === 'sun-dogs')!.modes[mode].tokens
      expect(channelsToHex(sunDogs.mark).toUpperCase()).toBe(BRAND_GROUND)
      expect(channelsToHex(sunDogs['mark-fg']).toUpperCase()).toBe(BRAND_INK)
      for (const theme of THEMES.filter((t) => t.id !== 'sun-dogs')) {
        const t = theme.modes[mode].tokens
        expect(t.mark, `${theme.id} ${mode}`).toBe(t.accent)
        expect(t['mark-fg'], `${theme.id} ${mode}`).toBe(t['accent-fg'])
      }
    }
  })

  it('is two colours that cannot be mistaken for one, in every theme and mode', () => {
    const lum = (channels: string) => {
      const [r, g, b] = channels.split(' ').map((v) => {
        const c = Number(v) / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    for (const theme of THEMES) {
      for (const mode of MODES) {
        const t = theme.modes[mode].tokens
        const [hi, lo] = [lum(t.mark), lum(t['mark-fg'])].sort((a, b) => b - a)
        expect((hi + 0.05) / (lo + 0.05), `${theme.id} ${mode}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('is a decorative tile painted from the two tokens, through the silhouette', () => {
    expect(read('frontend/src/components/ui/BrandMark.tsx')).toContain('aria-hidden="true"')
    const css = read('frontend/src/index.css')
    const block = css.match(/\.brand-mark \{[^}]*\}/)![0]
    expect(block).toContain('rgb(var(--c-mark))')
    const overlay = css.match(/\.brand-mark::after \{[^}]*\}/)![0]
    expect(overlay).toContain('rgb(var(--c-mark-fg))')
    expect(overlay).toContain("url('/logo-mark.svg')")
    // A colour written here would be the brand's even under a theme that has its own.
    expect(block + overlay).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

describe('the mark beside the name', () => {
  const places: Array<[string, string]> = [
    ['the header', 'frontend/src/components/Layout.tsx'],
    ['the landing page', 'frontend/src/pages/LandingPage.tsx'],
    ['the sign-in screen', 'frontend/src/components/LoginScreen.tsx'],
    ['the invitation screen', 'frontend/src/components/JoinScreen.tsx'],
    ['the welcome flow', 'frontend/src/components/flow/QuestionFlow.tsx'],
  ]
  it.each(places)('%s draws it next to the whole name', (_label, file) => {
    const src = read(file)
    expect(src).toContain('<BrandMark')
    expect(src).toMatch(/Sun Dogs Music Scout/)
  })

  it.each(DOCUMENTS.slice(1))('%s draws it without an <img>', (doc) => {
    const html = read(doc)
    expect(html).toMatch(/<span class="brand-mark[^"]*" aria-hidden="true"><\/span>\s*Sun Dogs Music Scout/)
    expect(html).not.toMatch(/<img\b/)
  })
})
