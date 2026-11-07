/**
 * A page that cannot be fetched because the app was deployed since this tab
 * loaded.
 *
 * Every page but the Overview is its own script, named by a hash of its
 * contents, and each deploy replaces the whole set. A tab opened before a
 * deploy still asks for the old names, the Worker answers 404, and the dynamic
 * import rejects. The page the person wanted is then an error box, and
 * `React.lazy` remembers the rejection, so "Try again" cannot help. A reload
 * fetches the new set, which is what they would do by hand.
 *
 * Once, not always: if the reload does not cure it (the network is down, or the
 * deploy is half-switched) the next failure is shown as the error it is rather
 * than reloading in a loop. Offline is not stale either, and a reload there
 * lands on the browser's own error page, which is worse.
 */

/** The messages browsers give for a script that would not load. */
const STALE_CHUNK = [
  /Failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /ChunkLoadError/i,
]

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return STALE_CHUNK.some((pattern) => pattern.test(message))
}

/** How long after one reload a second failure counts as a real fault. */
export const RELOAD_WINDOW_MS = 30_000

export function shouldReloadForStaleChunk(input: {
  error: unknown
  /** Epoch ms of the last reload this tab made for this reason, or null. */
  lastReloadAt: number | null
  now: number
  online: boolean
}): boolean {
  if (!isStaleChunkError(input.error)) return false
  if (!input.online) return false
  return input.lastReloadAt === null || input.now - input.lastReloadAt > RELOAD_WINDOW_MS
}

const KEY = 'scout.staleChunkReloadAt'

/**
 * Reloads the page when `error` is a stale-chunk failure that has not already
 * been tried once. Returns true when it did, so the caller can hold the page
 * still while the reload happens instead of flashing an error.
 */
export function reloadForStaleChunk(error: unknown): boolean {
  if (!isStaleChunkError(error)) return false
  let lastReloadAt: number | null = null
  const now = Date.now()
  try {
    const stored = Number(window.sessionStorage.getItem(KEY))
    lastReloadAt = Number.isFinite(stored) && stored > 0 ? stored : null
    if (!shouldReloadForStaleChunk({ error, lastReloadAt, now, online: navigator.onLine !== false })) return false
    window.sessionStorage.setItem(KEY, String(now))
  } catch {
    // No storage (a private window, blocked site data) means no memory of
    // having tried, and a reload that cannot be remembered can repeat forever
    // when the chunk stays missing. The error is shown instead.
    return false
  }
  window.location.reload()
  return true
}
