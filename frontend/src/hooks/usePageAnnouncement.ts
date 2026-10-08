import { useEffect, useRef, type RefObject } from 'react'

const PRODUCT = 'Sun Dogs Music Scout'

/**
 * What each page is called in the tab, the history list and a screen reader.
 * The same words the navigation uses, so what you pressed is what you hear.
 */
const LABELS: Record<string, string> = {
  overview: 'Overview',
  review: 'Review',
  gigs: 'Gigs',
  artist: 'Artist',
  sync: 'Sync',
  promo: 'Promo',
  settings: 'Settings',
  runs: 'History',
  help: 'Help',
  admin: 'Admin',
}

export function pageLabel(page: string): string {
  return LABELS[page] ?? (page ? page.charAt(0).toUpperCase() + page.slice(1) : 'Overview')
}

/** "Review · Sun Dogs Music Scout", the product last so a row of tabs tells them apart. */
export function pageTitle(page: string): string {
  return `${pageLabel(page)} · ${PRODUCT}`
}

/**
 * Says where you are after the page changes.
 *
 * A route here is only a hash, so nothing reloads and nothing is announced: a
 * screen reader user presses Review and hears silence, and every tab in the
 * browser keeps the same title. The title is set on every page, and focus moves
 * to the content area on a change, which is what a page load does for free.
 *
 * Not on the first render, because focus belongs to whatever the person was
 * already doing when they arrived. And only when the *page* changes: a filter
 * inside Review is the same page, and stealing focus from it would be worse
 * than saying nothing.
 */
export function usePageAnnouncement(page: string, main: RefObject<HTMLElement | null>): void {
  // Compared against the page seen last, not a "first render" flag, because
  // development mounts every effect twice and a flag would move focus on load.
  const seen = useRef<string | null>(null)

  useEffect(() => {
    document.title = pageTitle(page)
    if (seen.current !== null && seen.current !== page) main.current?.focus({ preventScroll: true })
    seen.current = page
  }, [page, main])
}
