/**
 * What a scheduled re-read of an artist's profiles has to say.
 *
 * Connecting a music association profile reads it once, when the artist
 * clicks. The profile keeps changing after that — a new video, a release, a
 * photo from last weekend's show — and nothing noticed, because the only
 * reader was a button. The daily housekeeping tick now re-reads every
 * connected profile and asks this module one question: **is there anything
 * here the artist has not been told about?**
 *
 * The answer is a notification, never a write. What the profile says still
 * lands in the library only through the import panel's preview, as a
 * suggestion, exactly as before — a page changing on somebody else's site is
 * not the artist saying so.
 *
 * Three rules keep it from becoming noise:
 *
 * - **The first read sets the baseline and says nothing.** Everything on a
 *   profile the artist has just connected is "new" to the scan and not to the
 *   artist, who was looking at it a minute ago.
 * - **An item is announced once.** `seen` is every proposal source the scan
 *   has ever reported, not the ones still pending, so something the artist
 *   left unimported is not announced again every morning — and something they
 *   archived is not announced when the profile reorders it.
 * - **Nothing already in the library counts.** The proposals arriving here
 *   have already had anything on file removed (`propose` in
 *   `src/routes/associations.ts`), so a link the reference documents filed is
 *   never news.
 *
 * Pure: proposals and the stored list in, the announcement and the next list out.
 */

/** Enough of an `AssetProposal` to count and describe. */
export interface ScanItem {
  kind: string
  source: string
}

/** The stored list is JSON; this caps it so a busy profile cannot grow a row forever. */
export const SEEN_LIMIT = 500

export function parseSeen(raw: string | null | undefined): string[] | null {
  if (raw == null) return null
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : null
  } catch {
    // An unreadable list is treated as no baseline: announcing nothing once is
    // better than announcing everything.
    return null
  }
}

export interface ScanOutcome {
  /** Items to announce; empty on a baseline read. */
  fresh: ScanItem[]
  /** What to store for next time. */
  seen: string[]
  baseline: boolean
}

export function scanOutcome(pending: ScanItem[], storedSeen: string | null | undefined): ScanOutcome {
  const prior = parseSeen(storedSeen)
  const current = pending.map((p) => p.source)
  if (prior === null) {
    return { fresh: [], seen: current.slice(-SEEN_LIMIT), baseline: true }
  }
  const known = new Set(prior)
  const fresh = pending.filter((p) => !known.has(p.source))
  // Newest last, so the cap drops the oldest memories first.
  const seen = [...prior, ...fresh.map((p) => p.source)].slice(-SEEN_LIMIT)
  return { fresh, seen, baseline: false }
}

const NOUN: Record<string, [string, string]> = {
  video: ['a video', 'videos'],
  audio: ['a release', 'releases'],
  photo: ['a photo', 'photos'],
  bio: ['a new bio', 'bios'],
  link: ['a link', 'links'],
  document: ['a download', 'downloads'],
  fact: ['a detail', 'details'],
}

/** "2 videos and a photo" — the kinds a person would care about first, first. */
export function describeItems(items: ScanItem[]): string {
  const order = ['video', 'audio', 'photo', 'bio', 'document', 'link', 'fact']
  const rank = (kind: string) => (order.includes(kind) ? order.indexOf(kind) : order.length)
  const counts = new Map<string, number>()
  for (const i of items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1)
  const parts = [...counts.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([kind, n]) => {
      const [one, many] = NOUN[kind] ?? ['an item', 'items']
      return n === 1 ? one : `${n} ${many}`
    })
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** The bell's title. Names the association — never a slug, never a URL. */
export function scanTitle(associationName: string, items: ScanItem[]): string {
  return `${associationName} profile: ${describeItems(items)} to read in`
}
