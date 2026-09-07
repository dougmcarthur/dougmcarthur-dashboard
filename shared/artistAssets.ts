/**
 * The artist database: bios, photos, links, the stage plot, the facts a form
 * asks for. Everything a booking manager could want, so no application starts
 * from a blank page.
 *
 * Two things here that a folder of files cannot do, and they are the reason
 * this is a table rather than a Drive link:
 *
 *   - It **expires.** A press photo from 2019 and a bio that predates the last
 *     record are worse than nothing, because they are used without being
 *     reread. Every asset carries a review date and this module says whether
 *     it has passed.
 *   - It **assembles.** An EPK is a view over this, cut differently for a folk
 *     festival and a sync agency, rather than a document that goes stale on
 *     its own the moment one fact underneath it changes.
 *
 * Pure, like everything in shared/. In particular nothing here reads the clock:
 * `today` is an argument, for the same reason the review queue takes one.
 */

export type AssetKind = 'bio' | 'photo' | 'audio' | 'video' | 'link' | 'document' | 'fact'

export interface AssetKindMeta {
  label: string
  /** Plural, for a section heading. */
  plural: string
  /** A URL rather than prose. Changes both the input and the way it renders. */
  isLink: boolean
  /** Unusable without a credit line — a press photo, essentially. */
  needsCredit: boolean
  /**
   * How long this stays trustworthy without being looked at, in months.
   *
   * Not a hard expiry — it seeds the review date when one is not given, and it
   * is the reason a photo is asked about less often than a streaming stat.
   */
  reviewMonths: number
  /** One line saying what belongs here. */
  meaning: string
}

export const ASSET_KIND_META: Record<AssetKind, AssetKindMeta> = {
  bio: {
    label: 'Bio',
    plural: 'Bios',
    isLink: false,
    needsCredit: false,
    // A year: long enough that a bio is not busywork, short enough that it
    // cannot silently predate a record.
    reviewMonths: 12,
    meaning: 'Written in the third person, at the lengths forms actually ask for.',
  },
  photo: {
    label: 'Photo',
    plural: 'Press photos',
    isLink: true,
    needsCredit: true,
    reviewMonths: 24,
    meaning: 'Press-ready, with the photographer credit that has to run beside it.',
  },
  audio: {
    label: 'Audio',
    plural: 'Recordings',
    isLink: true,
    needsCredit: false,
    reviewMonths: 24,
    meaning: 'A streamable or downloadable recording.',
  },
  video: {
    label: 'Video',
    plural: 'Live video',
    isLink: true,
    needsCredit: false,
    // The one most often asked for and most often out of date: a live video is
    // evidence of the show you play now, not the one you played then.
    reviewMonths: 12,
    meaning: 'Live performance footage. What a programmer watches before deciding.',
  },
  link: {
    label: 'Link',
    plural: 'Links',
    isLink: true,
    needsCredit: false,
    reviewMonths: 24,
    meaning: 'Website, streaming profiles, socials.',
  },
  document: {
    label: 'Document',
    plural: 'Documents',
    isLink: true,
    needsCredit: false,
    reviewMonths: 24,
    meaning: 'Stage plot, input list, tech rider, W-8BEN.',
  },
  fact: {
    label: 'Fact',
    plural: 'Facts',
    isLink: false,
    needsCredit: false,
    // Monthly listeners and follower counts go stale fastest of anything here,
    // and are the ones a form asks you to state as a number.
    reviewMonths: 6,
    meaning: 'A short answer a form asks for: hometown, line-up size, set length.',
  },
}

export const ASSET_KINDS = Object.keys(ASSET_KIND_META) as AssetKind[]

export function assetKindMeta(raw: string | null | undefined): AssetKindMeta {
  return ASSET_KIND_META[normaliseAssetKind(raw)]
}

/** Unknown kinds read as `fact`: a short answer is the least wrong assumption. */
export function normaliseAssetKind(raw: string | null | undefined): AssetKind {
  const v = (raw ?? '').trim().toLowerCase()
  return (ASSET_KINDS as string[]).includes(v) ? (v as AssetKind) : 'fact'
}

export interface ArtistAsset {
  id: number
  kind: string
  label: string
  value: string | null
  questionKind: string | null
  variant: string | null
  charCount: number | null
  credit: string | null
  usageRights: string | null
  reviewBy: string | null
  source: string | null
  notes: string | null
  sortOrder: number | null
  archived: number | null
  createdAt: string
  updatedAt: string
}

// ── Expiry ────────────────────────────────────────────────────────────────────

export type Freshness = 'fresh' | 'due_soon' | 'overdue' | 'unreviewed'

export interface AssetHealth {
  freshness: Freshness
  /** Negative once the review date has passed. Null when there is no date. */
  daysUntilReview: number | null
  /** What is wrong, in a sentence, or null. Shown next to the asset. */
  problem: string | null
}

/** Inside this many days, a review date is worth surfacing before it bites. */
export const REVIEW_WARNING_DAYS = 45

export function assetHealth(asset: ArtistAsset, today: string): AssetHealth {
  const problem = missingPiece(asset)

  if (!asset.reviewBy) {
    return { freshness: 'unreviewed', daysUntilReview: null, problem }
  }

  const days = daysBetween(today, asset.reviewBy)
  const freshness: Freshness =
    days < 0 ? 'overdue' : days <= REVIEW_WARNING_DAYS ? 'due_soon' : 'fresh'

  return { freshness, daysUntilReview: days, problem }
}

/**
 * The thing about this asset that would embarrass you, or null.
 *
 * Separate from freshness because it is not about time: a photo with no credit
 * is broken the day it is added, and it fails the same way whether the review
 * date has passed or not.
 */
function missingPiece(asset: ArtistAsset): string | null {
  const meta = assetKindMeta(asset.kind)
  if (!asset.value) return 'No value — this is an empty entry.'
  if (meta.needsCredit && !asset.credit) return 'No photographer credit, which most press use requires.'
  if (meta.isLink && !/^https?:\/\//i.test(asset.value)) return 'Not a usable link.'
  return null
}

/** ISO date `months` after `from`, clamped to the end of a short month. */
export function addMonths(from: string, months: number): string {
  const [y, m, d] = from.slice(0, 10).split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  // 31 January + 1 month is the end of February, not the 3rd of March.
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}

/** The review date a newly added asset of this kind should carry. */
export function defaultReviewBy(kind: string | null | undefined, today: string): string {
  return addMonths(today, assetKindMeta(kind).reviewMonths)
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

// ── Picking ───────────────────────────────────────────────────────────────────

/**
 * The best asset to answer a form field of this length.
 *
 * The longest one that fits, because a form asking for 500 characters wants
 * the fullest answer that will go in, not the shortest on file. When nothing
 * fits, the shortest is returned rather than nothing at all: a bio you have to
 * trim is a better starting point than a blank box, and the caller can see the
 * length it got.
 *
 * `targetLength` comes from `targetLength()` in src/lib/questionKinds.ts, and
 * null there means "no stated limit, use the fullest version".
 */
export function pickForLength(
  candidates: ArtistAsset[],
  targetLength: number | null,
): ArtistAsset | undefined {
  const live = candidates.filter((a) => !a.archived && a.value)
  if (live.length === 0) return undefined

  const measured = live.map((a) => ({ a, len: a.charCount ?? a.value!.length }))
  measured.sort((x, y) => y.len - x.len)

  if (targetLength === null) return measured[0].a
  return (measured.find((m) => m.len <= targetLength) ?? measured[measured.length - 1]).a
}

/** Everything on file that answers a given canonical question. */
export function assetsForQuestion(assets: ArtistAsset[], questionKey: string): ArtistAsset[] {
  return assets.filter((a) => !a.archived && a.questionKind === questionKey)
}

// ── Assembling ────────────────────────────────────────────────────────────────

/**
 * Who the EPK is for. A folk festival wants the live video and the stage plot;
 * a sync agency wants the recordings and cares nothing for either.
 */
export type EpkAudience = 'festival' | 'sync' | 'press'

const AUDIENCE_KINDS: Record<EpkAudience, AssetKind[]> = {
  festival: ['bio', 'video', 'audio', 'photo', 'document', 'link', 'fact'],
  // No stage plot, no set length: nobody licensing a recording needs to know
  // how many vocal mics you take.
  sync: ['bio', 'audio', 'link', 'photo'],
  press: ['bio', 'photo', 'video', 'link'],
}

export interface EpkSection {
  kind: AssetKind
  heading: string
  assets: Array<ArtistAsset & { health: AssetHealth }>
}

export interface Epk {
  audience: EpkAudience
  sections: EpkSection[]
  /**
   * Counts worth showing above the fold. An EPK assembled entirely from
   * overdue material looks complete and is not, which is the failure mode a
   * generated document has and a folder of files at least does not pretend
   * about.
   */
  overdue: number
  unreviewed: number
  problems: number
  /** Kinds this audience expects and nothing was found for. */
  missing: AssetKind[]
}

export function assembleEpk(
  assets: ArtistAsset[],
  options: { audience: EpkAudience; today: string },
): Epk {
  const { audience, today } = options
  const wanted = AUDIENCE_KINDS[audience]
  const sections: EpkSection[] = []
  const missing: AssetKind[] = []
  let overdue = 0
  let unreviewed = 0
  let problems = 0

  for (const kind of wanted) {
    const inKind = assets
      .filter((a) => !a.archived && normaliseAssetKind(a.kind) === kind)
      .map((a) => ({ ...a, health: assetHealth(a, today) }))
      .sort(
        (x, y) =>
          (x.sortOrder ?? 0) - (y.sortOrder ?? 0) ||
          (y.charCount ?? 0) - (x.charCount ?? 0) ||
          x.label.localeCompare(y.label),
      )

    if (inKind.length === 0) {
      missing.push(kind)
      continue
    }

    for (const a of inKind) {
      if (a.health.freshness === 'overdue') overdue++
      if (a.health.freshness === 'unreviewed') unreviewed++
      if (a.health.problem) problems++
    }

    sections.push({ kind, heading: ASSET_KIND_META[kind].plural, assets: inKind })
  }

  return { audience, sections, overdue, unreviewed, problems, missing }
}

/**
 * What is wrong with an assembled EPK, in sentences.
 *
 * Here rather than in the page because the counts are here, and because these
 * are the lines a weekly digest would want to say too. Singular and plural are
 * written out rather than patched with a trailing "s": two of these change the
 * verb as well as the noun, and "1 are missing something they need" is exactly
 * the kind of thing that ships.
 */
export function epkWarnings(epk: Epk): string[] {
  const out: string[] = []

  if (epk.overdue === 1) out.push('One of these is overdue for review.')
  else if (epk.overdue > 1) out.push(`${epk.overdue} of these are overdue for review.`)

  if (epk.problems === 1) out.push('One is missing something it needs.')
  else if (epk.problems > 1) out.push(`${epk.problems} are missing something they need.`)

  if (epk.missing.length > 0) {
    const kinds = epk.missing.map((k) => ASSET_KIND_META[k].plural.toLowerCase())
    const list =
      kinds.length === 1
        ? kinds[0]
        : `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`
    out.push(`Nothing on file for ${list}.`)
  }

  return out
}
