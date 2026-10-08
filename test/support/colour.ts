/**
 * Colour maths for the theme tests: contrast, colour-blind simulation and the
 * measures a theme is held to. Pure, so a test, and the one-off that recorded
 * the baselines, read the same numbers.
 */
import { type Theme, type ThemeMode } from '../../shared/themes'

export type Rgb = [number, number, number]

/** "246 241 220" as it is stored, to numbers. */
export function rgb(channels: string): Rgb {
  const parts = channels.split(' ').map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error(`not RGB channels: ${channels}`)
  }
  return parts as Rgb
}

const linear = (v: number) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = (c: Rgb) => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2])

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Machado, Oliveira and Fernandes 2009, full severity.
const MATRIX = {
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
} as const
export type Vision = keyof typeof MATRIX

const gamma = (v: number) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))

function simulate(c: Rgb, kind: Vision): Rgb {
  const l = c.map(linear)
  return MATRIX[kind].map((row) =>
    gamma(Math.min(1, Math.max(0, row[0] * l[0] + row[1] * l[1] + row[2] * l[2]))),
  ) as Rgb
}

function lab(c: Rgb): Rgb {
  const [r, g, b] = c.map(linear)
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

export const deltaE = (a: Rgb, b: Rgb) => Math.hypot(...(lab(a).map((v, i) => v - lab(b)[i]) as Rgb))

/** How far apart two colours stay in the worst of the listed kinds of colour blindness. */
export function separation(a: Rgb, b: Rgb, kinds: readonly Vision[] = ['deuteranopia', 'protanopia']): number {
  return Math.min(...kinds.map((k) => deltaE(simulate(a, k), simulate(b, k))))
}

export const ALL_KINDS: readonly Vision[] = ['deuteranopia', 'protanopia', 'tritanopia']
export const GROUNDS = ['canvas', 'surface', 'raised', 'sunken'] as const

/** One token of one theme and mode, as numbers. */
export const tok = (theme: Theme, mode: ThemeMode, name: keyof Theme['modes'][ThemeMode]['tokens']): Rgb =>
  rgb(theme.modes[mode].tokens[name])

/** The lowest contrast a token reaches on the grounds, and on any extra background it also sits on. */
export function lowest(theme: Theme, mode: ThemeMode, name: keyof Theme['modes'][ThemeMode]['tokens'], extra: Array<keyof Theme['modes'][ThemeMode]['tokens']> = []): number {
  const fg = tok(theme, mode, name)
  return Math.min(...[...GROUNDS, ...extra].map((g) => contrast(fg, tok(theme, mode, g))))
}

export interface Measures {
  ink: number
  body: number
  muted: number
  faint: number
  accent: number
  ochre: number
  clay: number
  field: number
  /** The closest pair of green, ochre and clay, in the worst of the three kinds of colour blindness. */
  closestPair: number
}

/** Everything a theme is held to, in one place, for the strict tests and for the ratchet. */
export function measure(theme: Theme, mode: ThemeMode): Measures {
  const g = tok(theme, mode, 'accent')
  const o = tok(theme, mode, 'warn-fg')
  const c = tok(theme, mode, 'danger-fg')
  return {
    ink: lowest(theme, mode, 'ink'),
    body: lowest(theme, mode, 'body'),
    muted: lowest(theme, mode, 'muted'),
    faint: lowest(theme, mode, 'faint'),
    accent: lowest(theme, mode, 'accent', ['accent-soft']),
    ochre: lowest(theme, mode, 'warn-fg', ['warn-bg']),
    clay: lowest(theme, mode, 'danger-fg', ['danger-bg']),
    field: lowest(theme, mode, 'field-line'),
    closestPair: Math.min(separation(g, c, ALL_KINDS), separation(g, o, ALL_KINDS), separation(c, o, ALL_KINDS)),
  }
}
