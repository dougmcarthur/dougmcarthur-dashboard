import { SUN_DOGS } from './themeSunDogs'
import { DERIVED_THEME_DATA, DERIVED_THEME_SOURCES } from './themeData'

/**
 * Colour themes: what they are, in one place.
 *
 * A theme is a set of colour tokens for the light mode and another for the dark
 * mode, and nothing else. Typeface, text size, width, motion and links stay their
 * own settings. See docs/themes-plan.md for why there are two kinds.
 *
 * - **Aesthetic** themes are chosen for how they look. The design wins where a
 *   number and a palette disagree, and each is held by a ratchet
 *   (shared/themeBaselines.ts) so it can be less accessible than the default but
 *   never quietly less accessible than it was.
 * - **Accessible** themes are chosen for a need, and are held to a strict
 *   standard in test/themes.test.ts.
 *
 * The stylesheet is generated from this (shared/themeCss.ts), so a theme is data
 * and cannot drift from what the app paints.
 */

export const THEME_TOKENS = [
  'canvas', 'surface', 'raised', 'sunken', 'line', 'line-strong', 'field-line',
  'ink', 'body', 'muted', 'faint',
  'accent', 'accent-hover', 'accent-fg', 'accent-soft',
  'danger-bg', 'danger-bg-hover', 'danger-line', 'danger-fg', 'danger-solid',
  'success-bg', 'success-bg-hover', 'success-line', 'success-fg', 'success-solid',
  'warn-bg', 'warn-line', 'warn-fg',
  'info-bg', 'info-bg-hover', 'info-line', 'info-fg',
  'cat-violet-bg', 'cat-violet-line', 'cat-violet-fg',
  'cat-sky-bg', 'cat-sky-line', 'cat-sky-fg',
  'cat-teal-bg', 'cat-teal-line', 'cat-teal-fg',
  'cat-orange-bg', 'cat-orange-line', 'cat-orange-fg',
  'cat-rose-bg', 'cat-rose-line', 'cat-rose-fg',
  'scrim',
] as const
export type ThemeToken = (typeof THEME_TOKENS)[number]

/** What "Higher contrast" strengthens on top of whichever theme is active. */
export const HIGH_CONTRAST_TOKENS = ['line', 'line-strong', 'field-line', 'body', 'muted', 'faint'] as const
export type HighContrastToken = (typeof HIGH_CONTRAST_TOKENS)[number]

export const SHADOW_KEYS = ['card', 'raised', 'pop', 'inset'] as const

export type ThemeMode = 'light' | 'dark'
export type ThemeKind = 'aesthetic' | 'accessible'

export interface ThemeModeData {
  /** "r g b" channels per token, as the stylesheet stores them. */
  tokens: Readonly<Record<ThemeToken, string>>
  /** Null where the theme is already as strong as the modifier could make it. */
  highContrast: Readonly<Record<HighContrastToken, string>> | null
  shadow: Readonly<Record<(typeof SHADOW_KEYS)[number], string>>
}

export interface Theme {
  id: PaletteId
  name: string
  kind: ThemeKind
  /** One sentence for the picker, saying what the theme is for or what it is like. */
  blurb: string
  modes: Readonly<Record<ThemeMode, ThemeModeData>>
}

/** Order is the order the picker shows them in, and the default comes first. */
export const PALETTE_IDS = [
  'sun-dogs',
  'pebble',
  'opal',
  'harvest',
  'high-contrast',
  'colour-blind',
  'greyscale',
  'low-glare',
] as const
export type PaletteId = (typeof PALETTE_IDS)[number]

export const DEFAULT_PALETTE: PaletteId = 'sun-dogs'

/** What a device that asks for more contrast gets, until a theme has been chosen. */
export const HIGH_CONTRAST_PALETTE: PaletteId = 'high-contrast'

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && (PALETTE_IDS as readonly string[]).includes(value)
}

const META: Record<PaletteId, { name: string; kind: ThemeKind; blurb: string }> = {
  'sun-dogs': {
    name: 'Sun Dogs',
    kind: 'aesthetic',
    blurb: 'Warm cream and forest green, from the Sun Dogs site.',
  },
  pebble: { name: 'Pebble', kind: 'aesthetic', blurb: 'Quiet sage and grey-teal.' },
  opal: { name: 'Opal', kind: 'aesthetic', blurb: 'Warm stone with a deep forest green.' },
  harvest: { name: 'Harvest', kind: 'aesthetic', blurb: 'Woodland greens, at home on near-black.' },
  'high-contrast': {
    name: 'High contrast',
    kind: 'accessible',
    blurb: 'Black and white with firm lines and the strongest text. Blue means go.',
  },
  'colour-blind': {
    name: 'Colour-blind safe',
    kind: 'accessible',
    blurb: 'Blue, gold and rose in place of green, ochre and clay. For every kind of colour blindness.',
  },
  greyscale: {
    name: 'Greyscale',
    kind: 'accessible',
    blurb: 'No colour at all, for a person who sees none or a monochrome display. Go, waiting and broken differ in lightness, and icons and labels carry the rest.',
  },
  'low-glare': {
    name: 'Low glare',
    kind: 'accessible',
    blurb: 'A dim, warm page with no white and no stark text, for light sensitivity and migraine.',
  },
}

function modes(data: { light: ThemeModeData; dark: ThemeModeData }): Record<ThemeMode, ThemeModeData> {
  return { light: data.light, dark: data.dark }
}

export const THEMES: readonly Theme[] = PALETTE_IDS.map((id): Theme => {
  const data = id === 'sun-dogs' ? SUN_DOGS : DERIVED_THEME_DATA[id]
  return { id, ...META[id], modes: modes(data) }
})

/** A theme by id; anything unknown is the default, never an error. */
export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** One "r g b" token as a hex colour, for swatches and for reading a value. */
export function channelsToHex(channels: string): string {
  return (
    '#' +
    channels
      .split(' ')
      .map((v) => Number(v).toString(16).padStart(2, '0'))
      .join('')
  )
}

/**
 * The five colours a card in the picker shows: ground, card, ink, accent and
 * the ochre. Taken from the real tokens, so the card cannot say one thing and
 * the theme another.
 */
export function swatches(theme: Theme, mode: ThemeMode): string[] {
  const t = theme.modes[mode].tokens
  return [t.canvas, t.surface, t.ink, t.accent, t['warn-fg']].map(channelsToHex)
}

/** The credit Help carries for the themes that were adapted from somebody's palette. */
export function themeCredit(): string {
  const adapted = THEMES.filter((t) => DERIVED_THEME_SOURCES[t.id])
  const list = adapted.map((t) => `${t.name} from ${DERIVED_THEME_SOURCES[t.id]}`)
  return `${list.join(', ')}: adapted from palettes on Figma's earthy colour palettes page.`
}
