/**
 * The one line under a page's title on a first visit.
 *
 * What a page is for is explanation, and explanation lives behind an info icon
 * everywhere in the app. But a person arriving at a page for the first time
 * has not met the icon, so the first visit shows the line outright, once. They
 * dismiss it, and from then on it is the icon's note, for that account on every
 * device: a hint dismissed on the phone is not shown again on the laptop.
 *
 * Only the pages in the main navigation have one. A page's line says what it is
 * for in a sentence a person reads in two seconds, and names no identifier.
 */

export const HINT_PAGES = ['overview', 'review', 'gigs', 'artist', 'sync', 'promo', 'runs'] as const
export type HintPage = (typeof HINT_PAGES)[number]

export const PAGE_HINTS: Record<HintPage, string> = {
  overview: 'What needs you now: replies owed, new opportunities and deadlines coming up.',
  review: 'Every opportunity that needs a decision or a reply, and why it is here.',
  gigs: 'All your gig opportunities. Open one to see its cost, its application and where it stands.',
  artist: 'Everything a programmer could ask for, so no application starts from a blank page.',
  sync: 'Sync licensing companies to pitch, and whether each says it takes pitches.',
  promo: 'Drafts for announcing your shows and releases. Copy one, post it, then mark it published.',
  runs: 'Everything the app did or noticed, newest first.',
}

export function isHintPage(value: unknown): value is HintPage {
  return typeof value === 'string' && (HINT_PAGES as readonly string[]).includes(value)
}

/**
 * The stored list, read defensively: a value that is not JSON, not a list, or
 * names a page this build has never heard of reads as nothing dismissed there,
 * which shows a hint again and costs a click. The other way round would hide
 * one for good.
 */
export function parseDismissed(raw: string | null | undefined): HintPage[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter(isHintPage))]
  } catch {
    return []
  }
}

export function withDismissed(list: readonly HintPage[], page: HintPage): HintPage[] {
  return list.includes(page) ? [...list] : [...list, page]
}
