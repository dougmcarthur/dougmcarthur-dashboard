/**
 * Feedback from inside the app, and the context that travels with it.
 *
 * The context is what makes a report usable — "the button did nothing" is a
 * different message when it arrives with *Review, Conflicts filter, and a 400
 * from PATCH /gigs/41 twelve seconds ago*. So the browser assembles it and
 * the sender never has to say which page they were on.
 *
 * Two rules keep that from turning into telemetry:
 *
 *  - **What is sent is what was shown.** `describeContext` is the one
 *    rendering, used by the form before sending and by the owner's inbox after,
 *    so the list the sender read is the list that arrived.
 *  - **Nothing is gathered in the background.** The error log lives in the
 *    tab's memory and goes nowhere unless a form is sent; it is not written to
 *    storage and not posted on its own.
 *
 * The context never carries what the artist was looking at — no gig name, no
 * note, no draft. A path like `PATCH /gigs/41` names a row by number, which is
 * enough to find it and not enough to read it.
 */

export const FEEDBACK_KINDS = [
  { id: 'broken', label: 'Something isn’t working', prompt: 'What did you expect, and what happened instead?' },
  { id: 'confusing', label: 'Something is confusing', prompt: 'What were you trying to do?' },
  { id: 'idea', label: 'An idea', prompt: 'What would make Scout more useful to you?' },
] as const

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]['id']

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return FEEDBACK_KINDS.some((k) => k.id === value)
}

export function feedbackKindLabel(kind: string): string {
  return FEEDBACK_KINDS.find((k) => k.id === kind)?.label ?? 'Feedback'
}

export const FEEDBACK_MESSAGE_MAX = 4000
/** How many recent errors ride along. Enough to see a pattern, not a log. */
export const FEEDBACK_ERRORS_MAX = 5
/** How many pages back the trail goes. */
export const FEEDBACK_TRAIL_MAX = 5

export interface FeedbackError {
  /** ISO time. */
  at: string
  /** `PATCH /gigs/41`, or `Page error` for something that broke a screen. */
  what: string
  status: number | null
  message: string
}

export interface FeedbackContext {
  /** Route id — `review`. */
  page: string
  /** Route argument — `conflict` — or null. */
  section: string | null
  /** Where they had been just before, oldest first, as route strings. */
  trail: string[]
  errors: FeedbackError[]
  /** The build that was running, a short commit hash or `dev`. */
  build: string
  /** `1440×900`. */
  viewport: string
  theme: 'light' | 'dark'
  /** The browser's own time zone, since "yesterday" depends on it. */
  timeZone: string
  /** A short browser description, never the whole user-agent string. */
  browser: string
}

/** Screen names, so the owner's inbox reads "Review" and not `review`. */
const PAGE_NAMES: Record<string, string> = {
  overview: 'Overview',
  review: 'Review',
  gigs: 'Gigs',
  artist: 'Artist',
  sync: 'Sync',
  promo: 'Promo',
  runs: 'History',
  settings: 'Settings',
  help: 'Help',
  admin: 'Admin',
}

function sentenceCase(raw: string): string {
  const spaced = raw.replace(/[-_]+/g, ' ').trim()
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : ''
}

/** `review` + `conflict` → "Review — Conflict". Unknown pages are humanised, never printed raw. */
export function placeLabel(page: string, section: string | null): string {
  const name = PAGE_NAMES[page] ?? sentenceCase(page)
  return section ? `${name} — ${sentenceCase(section)}` : name
}

/** `#review/conflict?x=1` → "Review — Conflict". The query is dropped; it is where credentials arrive. */
export function routeLabel(route: string): string {
  const [path] = route.replace(/^#/, '').split('?')
  const [page, section] = path.split('/')
  return placeLabel(page || 'overview', section || null)
}

/**
 * A short browser name from a user-agent string.
 *
 * The full string is a fingerprint and says nothing a person debugging this
 * app needs beyond the engine and the platform.
 */
export function describeBrowser(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Another browser'
  const platform = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'an unknown system'
  return `${browser} on ${platform}`
}

/** Strip a query string from an API path before it is remembered. */
export function safePath(path: string): string {
  return path.split('?')[0].split('#')[0]
}

/**
 * The context as lines a person reads, in the order they would want them.
 *
 * Used on both sides of the send, which is the whole point: the form shows
 * exactly this before the button, and the inbox shows exactly this after.
 */
export function describeContext(ctx: FeedbackContext): Array<{ label: string; value: string }> {
  const lines: Array<{ label: string; value: string }> = [
    { label: 'Page', value: placeLabel(ctx.page, ctx.section) },
  ]
  if (ctx.trail.length > 0) {
    lines.push({ label: 'Before that', value: ctx.trail.map(routeLabel).join(' → ') })
  }
  lines.push({
    label: 'Recent errors',
    value:
      ctx.errors.length === 0
        ? 'None in this tab'
        : ctx.errors
            .map((e) => `${e.what}${e.status ? ` (${e.status})` : ''}: ${e.message}`)
            .join('\n'),
  })
  lines.push({ label: 'Browser', value: `${ctx.browser}, ${ctx.viewport}, ${ctx.theme} theme` })
  lines.push({ label: 'Time zone', value: ctx.timeZone })
  lines.push({ label: 'Version', value: ctx.build })
  return lines
}
