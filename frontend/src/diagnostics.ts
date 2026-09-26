import {
  FEEDBACK_ERRORS_MAX,
  FEEDBACK_TRAIL_MAX,
  describeBrowser,
  safePath,
  type FeedbackContext,
  type FeedbackError,
} from '../../shared/feedback'
import { parseHash } from './hooks/useHashRoute'

/**
 * What the feedback form attaches, kept in this tab's memory and nowhere else.
 *
 * Nothing here is posted, stored or counted on its own. It exists so that
 * somebody who opens the form after a button did nothing does not have to
 * remember which button, and is thrown away with the tab. See
 * shared/feedback.ts for the rules the context keeps.
 */

/** Errors older than this are not "recent" and are not offered. */
const ERROR_WINDOW_MS = 30 * 60 * 1000

const errors: FeedbackError[] = []
const trail: string[] = []

/** Record a failure somebody might be about to write in about. */
export function noteError(what: string, status: number | null, message: string): void {
  errors.push({
    at: new Date().toISOString(),
    what: safePath(what).slice(0, 200),
    status,
    message: message.slice(0, 300),
  })
  if (errors.length > FEEDBACK_ERRORS_MAX) errors.splice(0, errors.length - FEEDBACK_ERRORS_MAX)
}

/** Record a page visit. The query is dropped — it is where OAuth outcomes and codes arrive. */
export function notePage(hash: string): void {
  const route = hash.replace(/^#/, '').split('?')[0] || 'overview'
  if (trail[trail.length - 1] === route) return
  trail.push(route)
  // One more than the trail keeps, because the last entry is the current page.
  if (trail.length > FEEDBACK_TRAIL_MAX + 1) trail.splice(0, trail.length - FEEDBACK_TRAIL_MAX - 1)
}

/** Build identifier, set at build time from the commit. `dev` locally. */
declare const __APP_BUILD__: string

export function collectContext(theme: 'light' | 'dark'): FeedbackContext {
  const [page, section] = parseHash(window.location.hash, 'overview')
  const current = window.location.hash.replace(/^#/, '').split('?')[0] || 'overview'
  const cutoff = Date.now() - ERROR_WINDOW_MS
  return {
    page,
    section,
    trail: trail.filter((route, i) => !(i === trail.length - 1 && route === current)).slice(-FEEDBACK_TRAIL_MAX),
    errors: errors.filter((e) => Date.parse(e.at) >= cutoff),
    build: typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev',
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    theme,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    browser: describeBrowser(navigator.userAgent),
  }
}
