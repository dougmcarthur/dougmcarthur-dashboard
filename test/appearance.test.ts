import { describe, it, expect, vi, afterEach } from 'vitest'
import { fontStack, resolveTheme, DEFAULTS, TEXT_SCALE, WIDTHS, type Appearance } from '../frontend/src/appearance'

const a = (o: Partial<Appearance> = {}): Appearance => ({ ...DEFAULTS, ...o })

afterEach(() => vi.unstubAllGlobals())

describe('fontStack', () => {
  it('always keeps a real fallback, so a misspelled family renders something', () => {
    const stack = fontStack(a({ font: 'custom', customFont: 'Definitely Not Installed' }))
    expect(stack).toContain('"Definitely Not Installed"')
    expect(stack).toContain('system-ui')
  })

  it('falls back entirely when the custom name is blank', () => {
    expect(fontStack(a({ font: 'custom', customFont: '   ' }))).toBe(fontStack(a({ font: 'system' })))
  })

  it('quotes a multi-word family but leaves a single safe word alone', () => {
    expect(fontStack(a({ font: 'custom', customFont: 'Iosevka' }))).toMatch(/^Iosevka,/)
    expect(fontStack(a({ font: 'custom', customFont: 'Atkinson Hyperlegible' }))).toMatch(/^"Atkinson Hyperlegible",/)
  })

  it('cannot be used to break out of the CSS value', () => {
    const stack = fontStack(a({ font: 'custom', customFont: 'Bad"; color: red; font-family: "X' }))
    expect(stack).not.toContain('color: red;"')
    expect(stack.match(/"/g)!.length % 2).toBe(0)
  })
})

describe('resolveTheme', () => {
  const withSystem = (dark: boolean) =>
    vi.stubGlobal('matchMedia', () => ({ matches: dark }) as unknown as MediaQueryList)

  it('follows the system when set to system', () => {
    withSystem(true)
    expect(resolveTheme(a({ theme: 'system' }))).toBe('dark')
    withSystem(false)
    expect(resolveTheme(a({ theme: 'system' }))).toBe('light')
  })

  it('ignores the system once a theme is chosen explicitly', () => {
    withSystem(true)
    expect(resolveTheme(a({ theme: 'light' }))).toBe('light')
  })
})

describe('scales', () => {
  it('keeps the default at exactly 1, so "default" means untouched', () => {
    expect(TEXT_SCALE[DEFAULTS.textSize]).toBe(1)
  })

  it('offers a full-width option that sets no cap at all', () => {
    expect(WIDTHS.full).toBe('none')
  })
})
