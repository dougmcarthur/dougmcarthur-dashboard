/**
 * The shared catalog: one row per real-world opportunity, whoever found it.
 *
 * An artist's gig row holds two kinds of fact. Some are about the listing —
 * the festival's name, its page, when it closes, where it is — and are the
 * same for every artist who finds it. The rest are about the artist's
 * relationship to it: status, notes, fit, snoozes, drafts. The catalog holds
 * only the first kind, and each artist's row links to it
 * (`gig_opportunities.opportunity_id`). That is the foundation for research
 * that runs once and serves many artists, and it is what the public landing
 * page reads, because it cannot carry anything personal: it has no column for
 * it.
 *
 * **What is published is narrower than what is stored.** A catalog entry goes
 * on the landing page only when it has a listing URL on a public host and falls
 * in one of the four categories the page shows — a call anybody can open, shown
 * with no more than the page it links to says. Personal documents (a Google
 * Doc, a Drive file, a mail thread) are never a listing, and the owner can hide
 * any entry from the admin surface. Sync entries are organisations only — a
 * library or a publisher — never an individual supervisor.
 *
 * Pure: no clock, no database. `today` is an argument.
 */

export type CatalogCategory = 'festival' | 'showcase' | 'funding' | 'sync' | 'other'

export const PUBLIC_CATEGORIES = [
  { id: 'festival', label: 'Festivals' },
  { id: 'showcase', label: 'Showcases and conferences' },
  { id: 'funding', label: 'Grants and funding' },
  { id: 'sync', label: 'Sync and licensing' },
] as const satisfies ReadonlyArray<{ id: CatalogCategory; label: string }>

export type PublicCategory = (typeof PUBLIC_CATEGORIES)[number]['id']


/** The gig `type` column is free text written by research agents. */
export function gigCategory(type: string | null | undefined): CatalogCategory {
  const t = (type ?? '').toLowerCase()
  if (/grant|award|fund|bursar|scholarship|prize|subsid/.test(t)) return 'funding'
  if (/showcase|conference|summit|market|expo/.test(t)) return 'showcase'
  if (/festival|fest\b/.test(t)) return 'festival'
  return 'other'
}

/**
 * Sync targets are organisations or people. Only organisations are catalogued
 * for the public page: a library's name is its storefront, a supervisor's is
 * somebody's name.
 */
export function syncCategory(agencyType: string | null | undefined): CatalogCategory {
  const t = (agencyType ?? '').toLowerCase()
  return /library|publisher|platform|agency|label/.test(t) ? 'sync' : 'other'
}

/** Hosts that hold somebody's documents or mail, never a public listing. */
const PRIVATE_HOSTS = [
  /(^|\.)drive\.google\.com$/,
  /(^|\.)mail\.google\.com$/,
  /(^|\.)dropbox\.com$/,
  /(^|\.)onedrive\.live\.com$/,
  /(^|\.)icloud\.com$/,
]

/** A URL that names a public page, reduced to what identifies it. */
export function normaliseUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (PRIVATE_HOSTS.some((re) => re.test(host))) return null
  // A Google Doc is somebody's document; a Google Form is a public call.
  if (host === 'docs.google.com' && !u.pathname.startsWith('/forms/')) return null
  const path = u.pathname.replace(/\/+$/, '').toLowerCase()
  return `${host}${path}`
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** An ISO date, or null — prose deadlines stay prose. */
export function isoDate(raw: string | null | undefined): string | null {
  const m = (raw ?? '').match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/**
 * What makes two rows the same opportunity.
 *
 * The form's URL when there is one, since the same call is announced on many
 * pages and applied to on one; otherwise the listing's. With no usable URL,
 * the name plus the year it closes — an annual festival is a new opportunity
 * each year, and the same name in two years is two rows.
 */
export function catalogKey(input: {
  name: string
  url?: string | null
  applicationUrl?: string | null
  deadline?: string | null
  category: CatalogCategory
}): string {
  const url = normaliseUrl(input.applicationUrl) ?? normaliseUrl(input.url)
  if (url) return `url:${url}`
  const year = isoDate(input.deadline)?.slice(0, 4) ?? 'open'
  return `name:${input.category}:${slug(input.name)}:${year}`
}

export interface CatalogFacts {
  category: CatalogCategory
  name: string
  organizer: string | null
  kind: string | null
  url: string | null
  deadline: string | null
  deadlineNote: string | null
  location: string | null
  country: string | null
  /**
   * The fee the listing states, as stated. Not interpreted: which way the
   * money goes is not something the rows it comes from record reliably.
   * Null when nothing was stated, which is not the same as free.
   */
  feeAmount: number | null
  feeCurrency: string | null
}

function clip(s: string | null | undefined, max: number): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

/** The listing facts of a gig row, and nothing about the artist's side of it. */
export function factsFromGig(gig: {
  name: string
  type: string | null
  organizer?: string | null
  url?: string | null
  applicationUrl?: string | null
  deadline?: string | null
  deadlineNote?: string | null
  location?: string | null
  country?: string | null
  feeAmount?: number | null
  feeCurrency?: string | null
}): CatalogFacts {
  const deadline = isoDate(gig.deadline)
  const amount =
    typeof gig.feeAmount === 'number' && Number.isFinite(gig.feeAmount) && gig.feeAmount > 0 ? gig.feeAmount : null
  return {
    category: gigCategory(gig.type),
    name: clip(gig.name, 160) ?? 'Untitled',
    organizer: clip(gig.organizer, 120),
    kind: clip(gig.type, 60),
    url: gig.url || gig.applicationUrl || null,
    deadline,
    // Prose from `deadline` is kept only as a short note, and only when it
    // was not a date: "Rolling intake" is a fact about the call.
    deadlineNote: clip(gig.deadlineNote ?? (deadline ? null : gig.deadline), 80),
    location: clip(gig.location, 120),
    country: clip(gig.country, 20),
    feeAmount: amount,
    // The artist's row defaults its currency to USD whether or not there is
    // an amount, so it is only carried beside a real one.
    feeCurrency: amount !== null ? clip(gig.feeCurrency, 3) : null,
  }
}

/** A sync target's listing facts: its name and what kind of organisation it is. */
export function factsFromSync(target: { name: string; agencyType?: string | null }): CatalogFacts {
  return {
    category: syncCategory(target.agencyType),
    name: clip(target.name, 160) ?? 'Untitled',
    organizer: null,
    kind: clip(target.agencyType, 60),
    url: null,
    deadline: null,
    deadlineNote: null,
    location: null,
    country: null,
    feeAmount: null,
    feeCurrency: null,
  }
}

/**
 * Whether an entry may appear on the public page by default.
 *
 * A public listing URL and a public category for gigs; an organisation for
 * sync. The owner can still hide anything from the admin surface.
 */
export function publishable(facts: CatalogFacts): boolean {
  if (facts.category === 'other') return false
  if (facts.category === 'sync') return true
  return normaliseUrl(facts.url) !== null
}

export interface CatalogRow extends CatalogFacts {
  id: number
  public: boolean
  firstSeenAt: string
}

export interface PublicOpportunity {
  category: PublicCategory
  name: string
  organizer: string | null
  kind: string | null
  url: string | null
  deadline: string | null
  deadlineNote: string | null
  location: string | null
  feeAmount: number | null
  feeCurrency: string | null
}

/** How many rows the landing page's sample shows. */
export const SAMPLE_SIZE = 8

/**
 * A few real entries for the landing page, mixed across the categories.
 *
 * A sample, not a feed: it exists to show what Scout keeps and how it lays it
 * out, so it takes the most recent open entries a category at a time, in
 * turn, until it has enough — a page of eight festivals says less about the
 * product than two of each. Entries with a closing date and a stated fee go
 * first within a category, because a row of dashes shows the columns and not
 * what fills them. Nothing closed, nothing hidden.
 */
export function publicSample(rows: CatalogRow[], today: string, size = SAMPLE_SIZE): PublicOpportunity[] {
  const richness = (r: CatalogRow) => (r.deadline ? 2 : r.deadlineNote ? 1 : 0) + (r.feeAmount !== null ? 1 : 0)
  const open = rows.filter((r) => r.public && r.category !== 'other' && !(r.deadline && r.deadline < today))
  const queues = PUBLIC_CATEGORIES.map((c) =>
    open
      .filter((r) => r.category === c.id)
      .sort((a, b) => richness(b) - richness(a) || (a.firstSeenAt < b.firstSeenAt ? 1 : a.firstSeenAt > b.firstSeenAt ? -1 : 0)),
  )
  const out: PublicOpportunity[] = []
  while (out.length < size && queues.some((q) => q.length)) {
    for (const q of queues) {
      const r = q.shift()
      if (!r || out.length >= size) continue
      out.push({
        category: r.category as PublicCategory,
        name: r.name,
        organizer: r.organizer,
        kind: r.kind,
        url: r.category === 'sync' ? null : r.url,
        deadline: r.deadline,
        deadlineNote: r.deadlineNote,
        location: r.location,
        feeAmount: r.feeAmount,
        feeCurrency: r.feeCurrency,
      })
    }
  }
  return out
}

/** Fill what the catalog is missing from a later sighting; never overwrite. */
export function fillMissing(existing: CatalogFacts, next: CatalogFacts): Partial<CatalogFacts> {
  const patch: Partial<CatalogFacts> = {}
  for (const key of ['organizer', 'kind', 'url', 'deadline', 'deadlineNote', 'location', 'country'] as const) {
    if (!existing[key] && next[key]) patch[key] = next[key]
  }
  // The fee is one fact in three columns, so it is filled as a unit: an
  // amount from one sighting beside a currency from another would be a figure
  // nobody stated.
  if (existing.feeAmount === null && next.feeAmount !== null) {
    patch.feeAmount = next.feeAmount
    patch.feeCurrency = next.feeCurrency
  }
  return patch
}
