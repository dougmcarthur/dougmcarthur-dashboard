/**
 * Sun Dogs, the default theme, drawn by hand.
 *
 * The ground is sundogsmusic.ca's cream (#f6f1dc), its card (#fffdf6) and its
 * green-black ink (#1d2a26), with a forest jade for go, ochre for waiting or due
 * soon and a deep brick for broken. The three text colours were chosen against a
 * colour-blind simulation rather than by eye; see the note at the head of
 * frontend/src/index.css and test/paletteContrast.test.ts, which fails if they drift.
 *
 * Lifted out of index.css on 2026-10-07 so that every theme is data in one place;
 * the stylesheet for all of them is generated from it (shared/themeCss.ts).
 * Each token is "r g b" channels, as the stylesheet stores them.
 */

export const SUN_DOGS = {
  light: {
    tokens: {
      'canvas': '246 241 220', // #F6F1DC
      'surface': '255 253 246', // #FFFDF6
      'raised': '250 247 234', // #FAF7EA
      'sunken': '238 232 208', // #EEE8D0
      'line': '214 203 170', // #D6CBAA
      'line-strong': '184 172 138', // #B8AC8A
      'field-line': '142 130 98', // #8E8262
      'ink': '29 42 38', // #1D2A26
      'body': '52 66 60', // #34423C
      'muted': '81 97 92', // #51615C
      'faint': '92 105 99', // #5C6963
      'accent': '42 98 72', // #2A6248
      'accent-hover': '33 80 58', // #21503A
      'accent-fg': '255 253 246', // #FFFDF6
      'accent-soft': '224 232 212', // #E0E8D4
      'danger-bg': '250 236 228', // #FAECE4
      'danger-bg-hover': '245 224 213', // #F5E0D5
      'danger-line': '226 190 172', // #E2BEAC
      'danger-fg': '118 40 28', // #76281C
      'danger-solid': '170 66 44', // #AA422C
      'success-bg': '232 240 224', // #E8F0E0
      'success-bg-hover': '220 232 208', // #DCE8D0
      'success-line': '190 212 176', // #BED4B0
      'success-fg': '34 84 58', // #22543A
      'success-solid': '42 98 72', // #2A6248
      'warn-bg': '243 231 182', // #F3E7B6
      'warn-line': '214 190 112', // #D6BE70
      'warn-fg': '139 94 0', // #8B5E00
      'info-bg': '250 247 234', // #FAF7EA
      'info-bg-hover': '241 236 214', // #F1ECD6
      'info-line': '214 203 170', // #D6CBAA
      'info-fg': '42 98 72', // #2A6248
      'cat-violet-bg': '250 247 234', // #FAF7EA
      'cat-violet-line': '214 203 170', // #D6CBAA
      'cat-violet-fg': '81 97 92', // #51615C
      'cat-sky-bg': '250 247 234', // #FAF7EA
      'cat-sky-line': '214 203 170', // #D6CBAA
      'cat-sky-fg': '81 97 92', // #51615C
      'cat-teal-bg': '250 247 234', // #FAF7EA
      'cat-teal-line': '214 203 170', // #D6CBAA
      'cat-teal-fg': '81 97 92', // #51615C
      'cat-orange-bg': '250 247 234', // #FAF7EA
      'cat-orange-line': '214 203 170', // #D6CBAA
      'cat-orange-fg': '81 97 92', // #51615C
      'cat-rose-bg': '250 247 234', // #FAF7EA
      'cat-rose-line': '214 203 170', // #D6CBAA
      'cat-rose-fg': '81 97 92', // #51615C
      'scrim': '29 42 38', // #1D2A26
    },
    highContrast: {
      'line': '150 139 106', // #968B6A
      'line-strong': '104 95 70', // #685F46
      'field-line': '92 84 60', // #5C543C
      'body': '24 34 31', // #18221F
      'muted': '38 52 47', // #26342F
      'faint': '52 66 60', // #34423C
    },
    shadow: {
      card: '0 1px 2px rgba(29,42,38,.07)',
      raised: '0 2px 4px rgba(29,42,38,.06), 0 10px 26px -10px rgba(29,42,38,.17)',
      pop: '0 8px 12px -4px rgba(29,42,38,.10), 0 18px 36px -12px rgba(29,42,38,.22)',
      inset: 'inset 0 1px 0 rgba(255,253,246,.8)',
    },
  },
  dark: {
    tokens: {
      'canvas': '11 12 11', // #0B0C0B
      'surface': '20 22 19', // #141613
      'raised': '29 31 27', // #1D1F1B
      'sunken': '15 17 14', // #0F110E
      'line': '40 43 38', // #282B26
      'line-strong': '58 64 56', // #3A4038
      'field-line': '104 111 100', // #686F64
      'ink': '237 239 234', // #EDEFEA
      'body': '179 184 174', // #B3B8AE
      'muted': '138 144 131', // #8A9083
      'faint': '130 136 124', // #82887C
      'accent': '143 201 138', // #8FC98A
      'accent-hover': '166 215 160', // #A6D7A0
      'accent-fg': '13 26 12', // #0D1A0C
      'accent-soft': '24 37 26', // #18251A
      'danger-bg': '36 23 21', // #241715
      'danger-bg-hover': '48 32 28', // #30201C
      'danger-line': '74 44 35', // #4A2C23
      'danger-fg': '217 154 134', // #D99A86
      'danger-solid': '180 87 63', // #B4573F
      'success-bg': '21 34 26', // #15221A
      'success-bg-hover': '29 47 35', // #1D2F23
      'success-line': '43 68 48', // #2B4430
      'success-fg': '143 201 138', // #8FC98A
      'success-solid': '79 154 84', // #4F9A54
      'warn-bg': '38 31 12', // #261F0C
      'warn-line': '86 70 22', // #564616
      'warn-fg': '224 188 88', // #E0BC58
      'info-bg': '29 31 27', // #1D1F1B
      'info-bg-hover': '37 40 34', // #252822
      'info-line': '40 43 38', // #282B26
      'info-fg': '143 201 138', // #8FC98A
      'cat-violet-bg': '29 31 27', // #1D1F1B
      'cat-violet-line': '40 43 38', // #282B26
      'cat-violet-fg': '138 144 131', // #8A9083
      'cat-sky-bg': '29 31 27', // #1D1F1B
      'cat-sky-line': '40 43 38', // #282B26
      'cat-sky-fg': '138 144 131', // #8A9083
      'cat-teal-bg': '29 31 27', // #1D1F1B
      'cat-teal-line': '40 43 38', // #282B26
      'cat-teal-fg': '138 144 131', // #8A9083
      'cat-orange-bg': '29 31 27', // #1D1F1B
      'cat-orange-line': '40 43 38', // #282B26
      'cat-orange-fg': '138 144 131', // #8A9083
      'cat-rose-bg': '29 31 27', // #1D1F1B
      'cat-rose-line': '40 43 38', // #282B26
      'cat-rose-fg': '138 144 131', // #8A9083
      'scrim': '0 0 0', // #000000
    },
    highContrast: {
      'line': '74 83 71', // #4A5347
      'line-strong': '107 117 103', // #6B7567
      'field-line': '150 158 145', // #969E91
      'body': '223 228 218', // #DFE4DA
      'muted': '200 207 195', // #C8CFC3
      'faint': '170 178 164', // #AAB2A4
    },
    shadow: {
      card: '0 1px 0 rgba(255,255,255,.03) inset, 0 2px 8px rgba(0,0,0,.5)',
      raised: '0 1px 0 rgba(255,255,255,.04) inset, 0 6px 20px -6px rgba(0,0,0,.7)',
      pop: '0 1px 0 rgba(255,255,255,.05) inset, 0 12px 34px -10px rgba(0,0,0,.82)',
      inset: 'inset 0 1px 0 rgba(255,255,255,.04)',
    },
  },
} as const

/**
 * The stage plot's connection colours. The one place a kind IS coloured: telling a
 * DI from a mic across a table is the job, so they are the same in every theme and
 * are written once, with the default, rather than per theme.
 */
export const CONNECTION_COLOURS = {
  light: {
    'conn-mic-fg': '106 76 196',
    'conn-mic-bg': '241 236 252',
    'conn-di-fg': '30 110 170',
    'conn-di-bg': '232 243 251',
    'conn-wedge-fg': '18 130 112',
    'conn-wedge-bg': '228 246 242',
    'conn-iem-fg': '180 50 90',
    'conn-iem-bg': '252 236 241',
    'conn-power-fg': '176 96 20',
    'conn-power-bg': '253 241 228',
  },
  dark: {
    'conn-mic-fg': '183 160 240',
    'conn-mic-bg': '40 34 58',
    'conn-di-fg': '125 190 240',
    'conn-di-bg': '26 40 54',
    'conn-wedge-fg': '110 210 190',
    'conn-wedge-bg': '22 48 44',
    'conn-iem-fg': '240 140 170',
    'conn-iem-bg': '56 30 40',
    'conn-power-fg': '240 170 90',
    'conn-power-bg': '56 40 22',
  },
} as const

/**
 * Paper is white, so a printout is always the default theme's light palette, with
 * these darker where a thin rule or small grey text would fade on a printer.
 */
export const PRINT_OVERRIDES = {
  canvas: '255 255 255',
  surface: '255 255 255',
  'line-strong': '150 140 110',
  'field-line': '120 110 84',
  body: '45 58 53',
  muted: '74 88 83',
  faint: '96 108 102',
} as const
