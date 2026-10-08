#!/usr/bin/env node
/**
 * Authoring tool for shared/themeData.ts: turns a palette and an intent into a
 * full token set for light and for dark.
 *
 *   node scripts/themes/derive.mjs            prints a summary of every measure
 *   node scripts/themes/derive.mjs --write    writes shared/themeData.ts
 *
 * The output is committed and is what the app reads. Nothing runs at build time
 * or at runtime, so this file is provenance and a way to regenerate, not a
 * dependency. Tests do not call it: they hold the *output* to the standards in
 * test/themes.test.ts, which is what matters whichever way a value was made.
 *
 * The default theme (Sun Dogs) is not here. It is drawn by hand, in
 * shared/themeSunDogs.ts, because it is the one everybody gets first.
 *
 * How a set is made:
 *  - Neutrals come from lightness ladders in OKLCH, tinted with the palette's
 *    own hue at low chroma, so a ground is a hint of a colour and never a field.
 *  - Text tokens are walked toward legibility until they clear the contrast
 *    floor on every ground they sit on.
 *  - Green, ochre and clay keep their hues. For the aesthetic themes the *green
 *    is the palette's own* and only the lightness of the three is searched, for
 *    the best separation under simulated colour blindness that still reads.
 *  - The accessible themes redraw the meaning colours (see their specs) and are
 *    fitted to stricter floors.
 */
import fs from 'node:fs'

// ───────────────────────── colour maths ─────────────────────────

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
const lin8 = (v) => toLin(v / 255)

export const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
export const rgbToHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()

export function rgbToOklch(rgb) {
  const [r, g, b] = rgb.map(lin8)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L, C: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 }
}

function oklchToLinear(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** Lowers chroma until the colour fits sRGB, so a request is never clipped into another hue. */
export function oklch(L, C, h) {
  let c = C
  for (let i = 0; i < 40; i++) {
    const lin = oklchToLinear(L, c, h)
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) return lin.map((v) => Math.round(255 * toGamma(clamp(v))))
    c *= 0.93
  }
  return oklchToLinear(L, 0, h).map((v) => Math.round(255 * toGamma(clamp(v))))
}

const lum = (c) => 0.2126 * lin8(c[0]) + 0.7152 * lin8(c[1]) + 0.0722 * lin8(c[2])
export const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Machado, Oliveira and Fernandes 2009, full severity.
const CVD = {
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
}
const gamma8 = (v) => Math.round(255 * toGamma(clamp(v)))
const simulate = (c, kind) => {
  const l = c.map(lin8)
  return CVD[kind].map((r) => gamma8(r[0] * l[0] + r[1] * l[1] + r[2] * l[2]))
}
function lab(c) {
  const [r, g, b] = c.map(lin8)
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}
const deltaE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]))
/** Worst case over the three kinds of colour blindness: the pair that matters is the one that collapses. */
export const separation = (a, b) => Math.min(...Object.keys(CVD).map((k) => deltaE(simulate(a, k), simulate(b, k))))

// ───────────────────────── token sets ─────────────────────────

const GROUNDS = ['canvas', 'surface', 'raised', 'sunken']
const CLAY_H = 30
const OCHRE_H = 78

/** Walks one colour's lightness toward legibility until it clears `need` on every listed background. */
function fit(make, start, dir, need, backgrounds) {
  let L = start
  for (let i = 0; i < 90; i++) {
    const rgb = make(L)
    if (backgrounds.every((bg) => contrast(rgb, bg) >= need)) return rgb
    L = clamp(L + dir * 0.01, 0.02, 0.99)
  }
  return make(L)
}

/**
 * One mode of one theme.
 *
 * `spec.grounds` is the lightness of canvas, surface, raised and sunken;
 * `spec.need` the contrast floor for text; `spec.pick` the lightness of the
 * three meaning colours, which the caller searches.
 */
function build(spec, mode) {
  const dark = mode === 'dark'
  const dir = dark ? 1 : -1
  const g = spec.ground
  const T = {}
  // Two options only some specs use. `mono` drops every chroma, for a theme in which no token carries
  // a hue. `cap` is a ceiling on lightness for the mode, for a theme that must contain no white (or,
  // in dark, no bright text): it applies to every token the builder makes, so a fill cannot slip past.
  const ceiling = spec.cap?.[mode] ?? 1
  const ok = (L, C, h) => oklch(Math.min(L, ceiling), spec.mono ? 0 : C, h)
  // Meaning colours are held to their own floor where a theme says so. Greyscale tells go, waiting
  // and broken apart by lightness, which leaves room for 4.5:1 and not for 7:1 on every ground.
  const mneed = spec.meaningNeed ?? spec.need
  const ground = (L, k = 1) => ok(L, g.C * k, g.h)
  const [Lc, Ls, Lr, Lu] = spec.grounds[mode]
  T.canvas = ground(Lc, dark ? 0.6 : 1)
  T.surface = ground(Ls, dark ? 0.6 : 0.5)
  T.raised = ground(Lr, dark ? 0.6 : 0.7)
  T.sunken = ground(Lu, dark ? 0.6 : 1.1)
  const grounds = GROUNDS.map((k) => T[k])

  // The accent's soft fill is a ground too: the active row of a list is painted with it, and text
  // sits on it. Fitted before the text so that text clears the floor there as well.
  const A = spec.accent
  T['accent-soft'] = ok(dark ? 0.25 : (spec.accentSoftL ?? 0.92), A.C * 0.28 * (dark ? 1.25 : 1), A.h)
  const textGrounds = [...grounds, T['accent-soft']]
  // Ochre and clay are fitted on it too in the accessible themes, where every colour that carries
  // text is held to the strict floor. The aesthetic themes keep to the four grounds, as recorded.
  const meaningGrounds = spec.need >= 7 || spec.meaningNeed ? textGrounds : grounds

  // Rules. Soft where the theme is allowed to be soft, and fitted where it is not.
  const lineNeed = spec.lineNeed ?? 0
  T.line = lineNeed ? fit((L) => ground(L, 1.2), dark ? 0.35 : 0.8, dir, lineNeed, grounds) : ground(dark ? 0.3 : 0.87, dark ? 0.7 : 1.2)
  T['line-strong'] = spec.strongNeed ? fit((L) => ground(L, 1.2), dark ? 0.45 : 0.7, dir, spec.strongNeed, grounds) : ground(dark ? 0.4 : 0.75, dark ? 0.7 : 1.2)
  T['field-line'] = fit((L) => ground(L, 1.1), dark ? 0.5 : 0.62, dir, spec.fieldNeed ?? 3.1, grounds)

  // Text, from the strongest down, each fitted on every ground.
  const th = spec.text.h
  const tc = spec.text.C
  const need = spec.need
  const ladder = spec.ladder?.[mode] ?? (dark ? [0.94, 0.8, 0.69, 0.63] : [0.24, 0.345, 0.46, 0.5])
  const names = ['ink', 'body', 'muted', 'faint']
  names.forEach((n, i) => {
    const floor = n === 'ink' || n === 'body' ? Math.max(need, 4.5) : need
    T[n] = fit((L) => ok(L, tc * (i === 0 ? 1 : 0.9), th), ladder[i], dir, floor, textGrounds)
  })

  // The three meaning colours. Green is the palette's, ochre and clay keep their hues.
  const pick = spec.pick[mode]
  const mk = (h, C) => (L) => ok(L, C, h)
  T.accent = fit(mk(A.h, A.C), pick.accent, dir, mneed, textGrounds)
  const aL = rgbToOklch(T.accent).L
  T['accent-hover'] = ok(clamp(aL + (dark ? 0.06 : -0.07), 0, 1), A.C, A.h)
  T['accent-fg'] = dark ? ok(0.2, g.C * 0.6, g.h) : ok(0.985, g.C * 0.5, g.h)

  const fills = {
    danger: { bg: ok(dark ? 0.24 : 0.95, dark ? 0.035 : 0.025, spec.clayH ?? CLAY_H), h: spec.clayH ?? CLAY_H },
    warn: { bg: ok(dark ? 0.25 : 0.93, dark ? 0.04 : 0.07, (spec.ochreH ?? OCHRE_H) + (dark ? 0 : 5)), h: spec.ochreH ?? OCHRE_H },
    success: { bg: ok(dark ? 0.24 : 0.94, A.C * (dark ? 0.3 : 0.25), A.h), h: A.h },
  }
  T['danger-bg'] = fills.danger.bg
  T['danger-bg-hover'] = ok(dark ? 0.28 : 0.91, dark ? 0.04 : 0.035, fills.danger.h)
  T['danger-line'] = ok(dark ? 0.34 : 0.85, 0.06, fills.danger.h)
  T['danger-fg'] = fit(mk(fills.danger.h, spec.clayC ?? 0.1), pick.clay, dir, mneed, [...meaningGrounds, T['danger-bg']])
  T['danger-solid'] = ok(dark ? 0.58 : 0.52, 0.13, fills.danger.h)

  T['success-bg'] = fills.success.bg
  T['success-bg-hover'] = ok(dark ? 0.28 : 0.9, A.C * (dark ? 0.33 : 0.3), A.h)
  T['success-line'] = ok(dark ? 0.32 : 0.82, A.C * 0.35, A.h)
  T['success-fg'] = T.accent
  T['success-solid'] = dark ? ok(0.6, A.C, A.h) : T.accent

  T['warn-bg'] = fills.warn.bg
  T['warn-line'] = ok(dark ? 0.36 : 0.8, dark ? 0.06 : 0.09, fills.warn.h)
  T['warn-fg'] = fit(mk(fills.warn.h, spec.ochreC ?? 0.105), pick.ochre, dir, mneed, [...meaningGrounds, T['warn-bg']])

  T['info-bg'] = T.raised
  T['info-bg-hover'] = ok(dark ? 0.27 : 0.94, g.C * (dark ? 0.6 : 0.9), g.h)
  T['info-line'] = T.line
  T['info-fg'] = T.accent
  for (const kind of ['violet', 'sky', 'teal', 'orange', 'rose']) {
    T[`cat-${kind}-bg`] = T.raised
    T[`cat-${kind}-line`] = T.line
    T[`cat-${kind}-fg`] = T.muted
  }
  T.scrim = dark ? [0, 0, 0] : T.ink

  return T
}

/** The six tokens "Higher contrast" strengthens on top of a theme: rules to 3:1 and 4.5:1, text to 7:1. */
function highContrast(spec, mode, T) {
  const dark = mode === 'dark'
  const dir = dark ? 1 : -1
  const grounds = [...GROUNDS.map((k) => T[k]), T['accent-soft']]
  const g = spec.ground
  const ground = (L, k = 1.2) => oklch(L, g.C * k, g.h)
  const th = spec.text.h
  const tc = spec.text.C * 0.9
  return {
    line: fit((L) => ground(L), dark ? 0.4 : 0.75, dir, 3.1, grounds),
    'line-strong': fit((L) => ground(L), dark ? 0.5 : 0.65, dir, 4.6, grounds),
    'field-line': fit((L) => ground(L), dark ? 0.55 : 0.55, dir, 4.6, grounds),
    body: fit((L) => oklch(L, tc, th), dark ? 0.9 : 0.27, dir, 7.2, grounds),
    muted: fit((L) => oklch(L, tc, th), dark ? 0.84 : 0.36, dir, 7.2, grounds),
    faint: fit((L) => oklch(L, tc, th), dark ? 0.8 : 0.4, dir, 7.2, grounds),
  }
}

function shadows(T, dark, spec = {}) {
  if (spec.softShadows) {
    // No white edge-light and no hard highlight: a bright hairline is what a glare-sensitive eye finds first.
    const i = T.ink.join(',')
    return dark
      ? {
          card: '0 2px 8px rgba(0,0,0,.35)',
          raised: '0 6px 20px -6px rgba(0,0,0,.5)',
          pop: '0 12px 34px -10px rgba(0,0,0,.6)',
          inset: 'inset 0 0 0 rgba(0,0,0,0)',
        }
      : {
          card: `0 1px 2px rgba(${i},.05)`,
          raised: `0 2px 4px rgba(${i},.04), 0 10px 26px -10px rgba(${i},.12)`,
          pop: `0 8px 12px -4px rgba(${i},.07), 0 18px 36px -12px rgba(${i},.16)`,
          inset: 'inset 0 0 0 rgba(0,0,0,0)',
        }
  }
  if (dark) {
    return {
      card: '0 1px 0 rgba(255,255,255,.03) inset, 0 2px 8px rgba(0,0,0,.5)',
      raised: '0 1px 0 rgba(255,255,255,.04) inset, 0 6px 20px -6px rgba(0,0,0,.7)',
      pop: '0 1px 0 rgba(255,255,255,.05) inset, 0 12px 34px -10px rgba(0,0,0,.82)',
      inset: 'inset 0 1px 0 rgba(255,255,255,.04)',
    }
  }
  const i = T.ink.join(',')
  return {
    card: `0 1px 2px rgba(${i},.07)`,
    raised: `0 2px 4px rgba(${i},.06), 0 10px 26px -10px rgba(${i},.17)`,
    pop: `0 8px 12px -4px rgba(${i},.10), 0 18px 36px -12px rgba(${i},.22)`,
    inset: `inset 0 1px 0 rgba(${T.surface.join(',')},.8)`,
  }
}

/** The closest pair of the three meaning colours, in the worst of the three kinds of colour blindness. */
function closestPair(T) {
  return Math.min(separation(T.accent, T['danger-fg']), separation(T.accent, T['warn-fg']), separation(T['danger-fg'], T['warn-fg']))
}

/**
 * Searches the lightness of the green, ochre and clay (and, for the accessible
 * themes only, their hues) for the best separation that still reads. An
 * aesthetic theme searches lightness alone: its green is the palette's own.
 */
function tune(spec, mode) {
  const dark = mode === 'dark'
  const sr = spec.search ?? {}
  const aLs = sr.accentL?.[mode] ?? (dark ? [0.7, 0.74, 0.78, 0.82] : [0.38, 0.42, 0.46, 0.5])
  const clays = sr.clayL?.[mode] ?? (dark ? [0.64, 0.7, 0.76, 0.82] : [0.3, 0.34, 0.39, 0.44])
  const ochres = sr.ochreL?.[mode] ?? (dark ? [0.76, 0.8, 0.84, 0.88] : [0.46, 0.5, 0.54, 0.58])
  const aHs = sr.accentH ?? [0]
  const cHs = sr.clayH ?? [0]
  const oHs = sr.ochreH ?? [0]
  let best = null
  for (const accent of aLs) for (const clay of clays) for (const ochre of ochres)
    for (const da of aHs) for (const dc of cHs) for (const dochre of oHs) {
      const s2 = {
        ...spec,
        accent: { ...spec.accent, h: (spec.accent.h + da + 360) % 360 },
        clayH: ((spec.clayH ?? CLAY_H) + dc + 360) % 360,
        ochreH: ((spec.ochreH ?? OCHRE_H) + dochre + 360) % 360,
        pick: { ...spec.pick, [mode]: { accent, clay, ochre } },
      }
      const T = build(s2, mode)
      const m = closestPair(T)
      if (!best || m > best.m) best = { m, s: s2, T }
    }
  return best
}

// ───────────────────────── the themes ─────────────────────────

const rgbHue = (hex) => rgbToOklch(hexToRgb(hex))
const jadeGreen = rgbHue('#6C8480')
const opalGreen = rgbHue('#126842')
const harvestGreen = rgbHue('#397234')

const AESTHETIC = {
  pebble: {
    name: 'Pebble',
    from: 'Jade Pebble Morning',
    ground: { h: rgbHue('#BAC8B1').h, C: 0.014 },
    text: { h: rgbHue('#404E3B').h, C: 0.025 },
    accent: { h: jadeGreen.h, C: Math.min(Math.max(jadeGreen.C, 0.06), 0.11) },
    grounds: { light: [0.955, 0.985, 0.97, 0.925], dark: [0.17, 0.205, 0.245, 0.145] },
    need: 4.5,
    pick: { light: {}, dark: {} },
  },
  opal: {
    name: 'Opal',
    from: 'Opal Forest Morning',
    ground: { h: rgbHue('#C9C3BD').h, C: 0.013 },
    text: { h: opalGreen.h, C: 0.025 },
    accent: { h: opalGreen.h, C: Math.min(Math.max(opalGreen.C, 0.06), 0.11) },
    grounds: { light: [0.955, 0.985, 0.97, 0.925], dark: [0.17, 0.205, 0.245, 0.145] },
    need: 4.5,
    pick: { light: {}, dark: {} },
  },
  harvest: {
    name: 'Harvest',
    from: 'Emerald Harvest Twilight',
    ground: { h: rgbHue('#ACBD5E').h, C: 0.022 },
    text: { h: harvestGreen.h, C: 0.025 },
    accent: { h: harvestGreen.h, C: Math.min(Math.max(harvestGreen.C, 0.06), 0.11) },
    grounds: { light: [0.955, 0.985, 0.97, 0.925], dark: [0.17, 0.205, 0.245, 0.145] },
    need: 4.5,
    pick: { light: {}, dark: {} },
  },
}

/**
 * The accessible themes. Their ground is as plain as the need allows, their
 * rules and field edges are fitted rather than chosen, and their text is fitted
 * to 7:1.
 */
const ACCESSIBLE = {
  'high-contrast': {
    name: 'High contrast',
    ground: { h: 0, C: 0 },
    text: { h: 0, C: 0 },
    accent: { h: 150, C: 0.1 },
    grounds: { light: [1, 1, 0.965, 0.93], dark: [0.0, 0.1, 0.16, 0.06] },
    need: 7,
    lineNeed: 3.1,
    strongNeed: 4.6,
    fieldNeed: 4.6,
    clayC: 0.12,
    pick: { light: {}, dark: {} },
    search: {
      accentL: { light: [0.36, 0.4, 0.44], dark: [0.8, 0.84, 0.88] },
      clayL: { light: [0.38, 0.42, 0.46], dark: [0.7, 0.76, 0.82, 0.88] },
      ochreL: { light: [0.42, 0.46, 0.5], dark: [0.78, 0.84, 0.9] },
      accentH: [0, 20, 40, 60, 90],
      clayH: [-10, 0, 10],
      ochreH: [-10, 0, 10],
    },
  },
  'colour-blind': {
    name: 'Colour-blind safe',
    ground: { h: 95, C: 0.006 },
    text: { h: 265, C: 0.02 },
    // Blue means go, gold waiting, rose broken: three hues that stay apart under
    // deuteranopia, protanopia and tritanopia alike (see docs/themes-plan.md).
    accent: { h: 265, C: 0.13 },
    clayH: 0,
    clayC: 0.13,
    ochreH: 95,
    ochreC: 0.13,
    grounds: { light: [0.965, 0.99, 0.975, 0.94], dark: [0.17, 0.205, 0.245, 0.145] },
    need: 7,
    fieldNeed: 3.1,
    pick: { light: {}, dark: {} },
    search: {
      accentL: { light: [0.38, 0.42, 0.46], dark: [0.72, 0.78, 0.84] },
      clayL: { light: [0.34, 0.4, 0.46], dark: [0.72, 0.78, 0.84] },
      ochreL: { light: [0.38, 0.42, 0.46], dark: [0.7, 0.76, 0.82] },
      accentH: [-12, 0, 12],
      clayH: [-10, 0, 10],
      ochreH: [-10, 0, 10],
    },
  },
}

/**
 * Greyscale: for a person who sees no colour, or a monochrome display. No token has a hue, so go,
 * waiting and broken are told apart by lightness alone, at least 15 CIELAB L* apart (dark: clay the
 * lightest, ochre the dimmest; light: clay the darkest, ochre the lightest). The three are held to
 * 4.5:1, not 7:1, because there is no room for three steps that are 15 apart *and* 7:1 on every
 * ground; ink, body, muted and faint keep 7:1. Icons and labels carry the rest.
 */
ACCESSIBLE.greyscale = {
  name: 'Greyscale',
  mono: true,
  ground: { h: 0, C: 0 },
  text: { h: 0, C: 0 },
  accent: { h: 0, C: 0 },
  clayH: 0,
  clayC: 0,
  ochreH: 0,
  ochreC: 0,
  grounds: { light: [0.97, 0.995, 0.98, 0.94], dark: [0.15, 0.185, 0.215, 0.125] },
  need: 7,
  meaningNeed: 4.5,
  fieldNeed: 3.1,
  pick: { light: {}, dark: {} },
  search: {
    accentL: { light: [0.36, 0.4, 0.43], dark: [0.64, 0.68, 0.72, 0.76] },
    clayL: { light: [0.22, 0.25, 0.28], dark: [0.88, 0.92, 0.96] },
    ochreL: { light: [0.46, 0.49, 0.52], dark: [0.48, 0.52, 0.56, 0.6] },
  },
}

/**
 * Low glare: for light sensitivity and migraine. A dim, warm ground with no white in it, text
 * that is readable and never stark (4.5:1 up to 12:1, a ceiling as well as a floor), softened
 * highlights and no thin bright lines. Every lightness the builder makes is capped (`cap`), so a
 * tinted fill cannot be whiter than the ground it sits on.
 */
ACCESSIBLE['low-glare'] = {
  name: 'Low glare',
  ground: { h: 72, C: 0.022 },
  text: { h: 55, C: 0.02 },
  accent: { h: 150, C: 0.075 },
  clayH: 30,
  clayC: 0.085,
  ochreH: 78,
  ochreC: 0.09,
  grounds: { light: [0.865, 0.9, 0.885, 0.825], dark: [0.2, 0.235, 0.265, 0.18] },
  cap: { light: 0.905, dark: 0.89 },
  accentSoftL: 0.875,
  ladder: { light: [0.31, 0.38, 0.43, 0.46], dark: [0.83, 0.76, 0.7, 0.66] },
  softShadows: true,
  need: 4.5,
  fieldNeed: 3.1,
  pick: { light: {}, dark: {} },
  search: {
    accentL: { light: [0.34, 0.38, 0.42], dark: [0.68, 0.72, 0.76] },
    clayL: { light: [0.26, 0.3, 0.34], dark: [0.7, 0.76, 0.82] },
    ochreL: { light: [0.4, 0.43, 0.46], dark: [0.74, 0.79, 0.84] },
    accentH: [-15, 0, 15],
    clayH: [-8, 0, 8],
    ochreH: [-8, 0, 8],
  },
}

export function buildThemeData() {
  const out = {}
  const measures = {}
  for (const [id, spec] of Object.entries(AESTHETIC)) {
    out[id] = {}
    measures[id] = {}
    for (const mode of ['light', 'dark']) {
      const { s, T, m } = tune(spec, mode)
      out[id][mode] = { tokens: T, highContrast: highContrast(s, mode, T), shadow: shadows(T, mode === 'dark') }
      measures[id][mode] = m
    }
  }
  for (const [id, spec] of Object.entries(ACCESSIBLE)) {
    out[id] = {}
    measures[id] = {}
    for (const mode of ['light', 'dark']) {
      const { s: tuned, T, m } = tune(spec, mode)
      // The High contrast theme is already the strongest the modifier could make it.
      out[id][mode] = {
        tokens: T,
        highContrast: id === 'high-contrast' ? null : highContrast(tuned, mode, T),
        shadow: shadows(T, mode === 'dark', spec),
      }
      measures[id][mode] = m
    }
  }
  return { out, measures, specs: { ...AESTHETIC, ...ACCESSIBLE } }
}

// ───────────────────────── output ─────────────────────────

const TOKEN_ORDER = [
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
]
const HC_ORDER = ['line', 'line-strong', 'field-line', 'body', 'muted', 'faint']

const q = (s) => `'${s}'`
const chan = (rgb) => `'${rgb.join(' ')}'`

function renderTs({ out, specs }) {
  const lines = []
  lines.push('// Generated by scripts/themes/derive.mjs. Edit the script, then run it with --write;')
  lines.push('// do not edit this file by hand. The default theme is drawn by hand in themeSunDogs.ts.')
  lines.push('//')
  lines.push('// Each token is "r g b" channels, as the stylesheet stores them, with the hex beside it.')
  lines.push('')
  lines.push('export const DERIVED_THEME_DATA = {')
  for (const id of Object.keys(out)) {
    lines.push(`  ${q(id)}: {`)
    for (const mode of ['light', 'dark']) {
      const d = out[id][mode]
      lines.push(`    ${mode}: {`)
      lines.push('      tokens: {')
      for (const t of TOKEN_ORDER) lines.push(`        ${q(t)}: ${chan(d.tokens[t])}, // ${rgbToHex(d.tokens[t])}`)
      lines.push('      },')
      if (d.highContrast) {
        lines.push('      highContrast: {')
        for (const t of HC_ORDER) lines.push(`        ${q(t)}: ${chan(d.highContrast[t])}, // ${rgbToHex(d.highContrast[t])}`)
        lines.push('      },')
      } else {
        lines.push('      highContrast: null,')
      }
      lines.push('      shadow: {')
      for (const [k, v] of Object.entries(d.shadow)) lines.push(`        ${k}: ${q(v)},`)
      lines.push('      },')
      lines.push('    },')
    }
    lines.push('  },')
  }
  lines.push('} as const')
  lines.push('')
  lines.push('/** Where each derived theme came from, for the credit in Help. */')
  lines.push('export const DERIVED_THEME_SOURCES: Record<string, string> = {')
  for (const [id, spec] of Object.entries(specs)) if (spec.from) lines.push(`  ${q(id)}: ${q(spec.from)},`)
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/themes/derive.mjs')
if (isMain) {
  const built = buildThemeData()
  for (const id of Object.keys(built.out)) {
    for (const mode of ['light', 'dark']) {
      const T = built.out[id][mode].tokens
      const worst = Math.min(
        ...['ink', 'body', 'muted', 'faint', 'accent', 'danger-fg', 'warn-fg'].flatMap((n) => GROUNDS.map((g) => contrast(T[n], T[g]))),
      )
      console.log(
        `${id.padEnd(14)} ${mode.padEnd(5)} canvas ${rgbToHex(T.canvas)} card ${rgbToHex(T.surface)} ink ${rgbToHex(T.ink)} accent ${rgbToHex(T.accent)} ochre ${rgbToHex(T['warn-fg'])} clay ${rgbToHex(T['danger-fg'])} | closest pair ${built.measures[id][mode].toFixed(0)} | lowest text ${worst.toFixed(1)} | field ${Math.min(...GROUNDS.map((g) => contrast(T['field-line'], T[g]))).toFixed(1)}`,
      )
    }
  }
  if (process.argv.includes('--write')) {
    fs.writeFileSync(new URL('../../shared/themeData.ts', import.meta.url), renderTs(built))
    console.log('wrote shared/themeData.ts')
  }
}
