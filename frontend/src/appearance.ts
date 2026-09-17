/**
 * Appearance settings: what they are, where they live, how they reach the DOM.
 *
 * Deliberately localStorage rather than the `app_settings` table the digest
 * uses. Those settings describe the system and must be identical wherever you
 * open it; these describe one pair of eyes on one screen, and syncing "large
 * text" from a laptop onto a phone would be a bug rather than a feature.
 *
 * Everything is applied as an attribute or a variable on <html>, so the whole
 * interface responds without a single component subscribing to the theme.
 */

export type ThemeChoice = 'light' | 'dark' | 'system'
export type TextSize = 'compact' | 'default' | 'large' | 'xlarge'
export type FontChoice = 'system' | 'humanist' | 'serif' | 'mono' | 'custom'
export type ShellWidth = 'comfortable' | 'wide' | 'full'

export interface Appearance {
  theme: ThemeChoice
  textSize: TextSize
  font: FontChoice
  /** Only consulted when `font` is 'custom'. A family name, not a URL. */
  customFont: string
  width: ShellWidth
  highContrast: boolean
  reduceMotion: boolean
  /** Underline links in body copy, not just on hover. */
  underlineLinks: boolean
  /**
   * Show the info buttons that hold each setting's explanation.
   *
   * On by default, because somebody opening a screen for the first time is
   * exactly who the explanations are for. Off is for the person who has read
   * them: the sentences are not gone, they are just not offered, and turning
   * this back on restores every one of them. Nothing is hidden that is not
   * *only* an explanation — a warning, a count and an error all stay put,
   * because those are the app telling you something rather than teaching you.
   */
  showHints: boolean
}

export const DEFAULTS: Appearance = {
  // Dark by default rather than 'system'. Asked for explicitly, and it is the
  // ground the palette was designed against — light is the alternate.
  theme: 'dark',
  textSize: 'default',
  font: 'system',
  customFont: '',
  width: 'comfortable',
  highContrast: false,
  reduceMotion: false,
  underlineLinks: false,
  showHints: true,
}

/**
 * The root font size, as a multiple of 16px. Every Tailwind size is in rem, so
 * this scales the whole interface rather than only body copy.
 *
 * The steps used to be 0.9375 / 1 / 1.0625 / 1.125 — fifteen, sixteen,
 * seventeen and eighteen pixels. Four options spanning three pixels, where
 * choosing "Larger" moved prose from twelve pixels to thirteen and a half and
 * somebody who needed it bigger had nowhere left to go. A control that cannot
 * make a difference is worse than no control, because it answers the question
 * and leaves the problem.
 *
 * The ladder is wider now and the top is genuinely large. `default` stays at
 * exactly 1 — it means *untouched*, and the type ramp in tailwind.config.js is
 * where the app's own sizes were raised, which is the right place for it: a
 * default above 1 would override somebody who had already set a larger font
 * size in their browser, which is the opposite of an accessibility win.
 */
export const TEXT_SCALE: Record<TextSize, number> = {
  compact: 0.9375,
  default: 1,
  large: 1.125,
  xlarge: 1.25,
}

/**
 * Widths, not breakpoints.
 *
 * "Comfortable" is a measure limit: past roughly 90 characters a line of prose
 * gets hard to track back from, and this app is mostly prose. "Wide" trades
 * that for seeing more at once on a large display, and "full" hands the whole
 * viewport over for people who would rather decide for themselves.
 */
export const WIDTHS: Record<ShellWidth, string> = {
  comfortable: '1280px',
  wide: '1680px',
  full: 'none',
}

const STACKS: Record<Exclude<FontChoice, 'custom'>, string> = {
  system:
    "'Public Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  humanist:
    "'Bricolage Grotesque', 'Optima', 'Gill Sans', 'Segoe UI', system-ui, sans-serif",
  serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
}

/**
 * Fonts already on the machine, plus a field for naming another one.
 *
 * No webfont is downloaded. A dashboard behind Cloudflare Access that reaches
 * out to a font CDN on every load leaks that you opened it, to a third party,
 * for a cosmetic gain — and the custom field covers anyone who has a family
 * they actually want.
 */
export function fontStack(a: Appearance): string {
  if (a.font === 'custom') {
    const named = a.customFont.trim()
    // Always keep a real fallback: a misspelled family must not render nothing.
    if (named) return `${quoteFamily(named)}, ${STACKS.system}`
    return STACKS.system
  }
  return STACKS[a.font]
}

/** Quotes a family name unless it is already quoted or a single safe word. */
function quoteFamily(name: string): string {
  if (/^["'].*["']$/.test(name)) return name
  if (/^[A-Za-z0-9-]+$/.test(name)) return name
  return `"${name.replace(/["\\]/g, '')}"`
}

const KEY = 'musichq.appearance'

export function loadAppearance(): Appearance {
  if (typeof localStorage === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    // Merged over the defaults so a setting added later does not arrive
    // undefined on a browser holding an older shape.
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Appearance>) }
  } catch {
    return DEFAULTS
  }
}

export function saveAppearance(a: Appearance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(a))
  } catch {
    // Private browsing, or storage full. The setting still applies this session.
  }
}

export function prefersDark(): boolean {
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
  )
}

export function resolveTheme(a: Appearance): 'light' | 'dark' {
  return a.theme === 'system' ? (prefersDark() ? 'dark' : 'light') : a.theme
}

/** Writes the whole of an Appearance onto <html>. The only DOM this touches. */
export function applyAppearance(a: Appearance): void {
  const root = document.documentElement
  root.dataset.theme = resolveTheme(a)
  root.dataset.contrast = a.highContrast ? 'high' : 'normal'
  root.dataset.motion = a.reduceMotion ? 'reduced' : 'full'
  root.dataset.links = a.underlineLinks ? 'underline' : 'plain'
  root.style.setProperty('--ui-scale', String(TEXT_SCALE[a.textSize]))
  root.style.setProperty('--font-ui', fontStack(a))
  root.style.setProperty('--shell-width', WIDTHS[a.width])
}
