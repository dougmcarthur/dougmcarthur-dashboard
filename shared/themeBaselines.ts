import type { ThemeMode } from './themes'

/**
 * What each aesthetic theme measured when it was added.
 *
 * An aesthetic theme is allowed to be softer than the default: the design wins
 * where a number and a palette disagree. What it is not allowed to do is get
 * quietly worse. test/themes.test.ts fails if any measure of a theme drops below
 * the figure recorded here, so lowering one is a visible change somebody has to
 * mean. Raising one is welcome and is how a theme that was improved stays
 * improved.
 *
 * The figures are contrast ratios (the lowest the token reaches on any of the
 * four grounds, and on its own tinted fill where it sits on one), and
 * `closestPair`, the closest two of green, ochre and clay stay in the worst of
 * deuteranopia, protanopia and tritanopia. They were recorded on 2026-10-07
 * from the first version of each theme, rounded down.
 *
 * One floor is not on the ratchet and is not negotiable: ink and body text at
 * 4.5:1. A theme in which the paragraph cannot be read is a bug, not a taste.
 *
 * The default theme and the accessible themes are held to fixed standards
 * instead (test/paletteContrast.test.ts, test/themes.test.ts).
 */
export interface ThemeMeasures {
  ink: number
  body: number
  muted: number
  faint: number
  accent: number
  ochre: number
  clay: number
  field: number
  closestPair: number
}

export type RatchetedTheme = 'pebble' | 'opal' | 'harvest'

export const THEME_BASELINES: Record<RatchetedTheme, Record<ThemeMode, ThemeMeasures>> = {
  pebble: {
    light: { ink: 13.19, body: 9.22, muted: 5.7, faint: 4.82, accent: 5.46, ochre: 4.5, clay: 11.46, field: 3.17, closestPair: 29.02 },
    dark: { ink: 13.66, body: 8.72, muted: 5.91, faint: 4.7, accent: 9.28, ochre: 11.08, clay: 4.61, field: 3.23, closestPair: 31.1 },
  },
  opal: {
    light: { ink: 13.07, body: 9.13, muted: 5.65, faint: 4.77, accent: 4.56, ochre: 4.89, clay: 11.39, field: 3.16, closestPair: 25.77 },
    dark: { ink: 13.75, body: 8.72, muted: 5.9, faint: 4.69, accent: 9.38, ochre: 8.48, clay: 4.6, field: 3.18, closestPair: 22.88 },
  },
  harvest: {
    light: { ink: 13.23, body: 9.23, muted: 5.71, faint: 4.77, accent: 4.53, ochre: 4.5, clay: 11.46, field: 3.17, closestPair: 15.11 },
    dark: { ink: 13.73, body: 8.78, muted: 5.89, faint: 4.69, accent: 9.46, ochre: 7.42, clay: 4.61, field: 3.23, closestPair: 16.81 },
  },
}
