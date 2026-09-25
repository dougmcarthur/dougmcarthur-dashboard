/**
 * What an EPK shows to someone who is not the artist.
 *
 * The EPK the artist sees inside Scout (`assembleEpk`) is a working view: it
 * carries unreviewed suggestions, overdue facts and a W-8BEN in Documents,
 * with the problems drawn on. A share link hands a stranger the same library,
 * so this module decides what crosses that line, and the rule is **only what
 * the artist has claimed, and only what is meant for strangers**:
 *
 * - **Reviewed.** An asset with no review date is a suggestion — from a
 *   document, a Manitoba Music profile, a scan — that nobody has confirmed.
 *   "A suggestion is not an answer" holds at the front door too: an imported
 *   bio goes public when the artist says it is right, not when it is filed.
 *   An *overdue* asset was claimed once and is still shown; the owner's view
 *   is where it is flagged.
 * - **Usable.** A photo with no photographer credit is broken the day it is
 *   added, and a public page is exactly where running it uncredited costs
 *   something.
 * - **Meant for strangers.** Contact details, fees, availability and travel
 *   are facts a form asks for, not facts a profile publishes; documents are
 *   public only when they are the stage plot, rider, input list or press kit.
 *   This is an allow-list: a fact nobody has classified stays private, because
 *   the failure of a missing line is a shorter page and the failure of an
 *   extra one is a phone number on the internet.
 *
 * Everything withheld is listed with the reason, for the artist's preview —
 * "why is my bio not on the page" should never need an answer from support.
 *
 * Pure, like everything in shared/: `today` is an argument.
 */

import { assembleEpk, normaliseAssetKind, type ArtistAsset, type EpkAudience } from './artistAssets'

/** Facts a public profile may state. Everything else a form can ask for stays private. */
const PUBLIC_FACTS = new Set(['genre', 'hometown', 'lineup', 'set_length', 'streaming_stats', 'influences', 'one_liner', 'artist_name'])

const PUBLIC_DOCUMENT = /stage ?plot|input ?list|rider|tech(nical)? (spec|sheet)|one[ -]?sheet|press ?kit|\bepk\b/i
const PUBLIC_DOCUMENT_KINDS = new Set(['tech_requirements', 'epk'])

export type WithheldReason = 'unreviewed' | 'no_credit' | 'private'

export const WITHHELD_REASONS: Record<WithheldReason, string> = {
  unreviewed: 'not reviewed yet — mark it right in your library to publish it',
  no_credit: 'a photo with no photographer credit',
  private: 'kept private — contact details, fees and paperwork stay off the public page',
}

export interface PublicItem {
  label: string
  value: string
  /** A bio's length name, or a release date. */
  variant: string | null
  /** A photo's credit line. */
  credit: string | null
  /** When the artist last confirmed it — a number is only as true as its date. */
  asOf: string
}

export interface PublicEpk {
  audience: EpkAudience
  bios: PublicItem[]
  facts: PublicItem[]
  videos: Array<PublicItem & { youtubeId: string | null }>
  audio: PublicItem[]
  photos: PublicItem[]
  documents: PublicItem[]
  links: PublicItem[]
  /** For the artist's own preview only; the public route strips it. */
  withheld: Array<{ label: string; kind: string; reason: WithheldReason }>
}

/** The video id in any of the shapes YouTube hands out, or null. */
export function youtubeId(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, '')
  const id = /^[A-Za-z0-9_-]{6,20}$/
  if (host === 'youtu.be') {
    const v = u.pathname.slice(1).split('/')[0]
    return id.test(v) ? v : null
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    const v = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] ?? ''
    return id.test(v) ? v : null
  }
  return null
}

function whyPrivate(a: ArtistAsset): boolean {
  const kind = normaliseAssetKind(a.kind)
  if (kind === 'fact') return !PUBLIC_FACTS.has(a.questionKind ?? '')
  if (kind === 'document') {
    return !(PUBLIC_DOCUMENT_KINDS.has(a.questionKind ?? '') || PUBLIC_DOCUMENT.test(a.label))
  }
  return false
}

export function buildPublicEpk(
  assets: ArtistAsset[],
  options: { audience: EpkAudience; today: string },
): PublicEpk {
  const epk = assembleEpk(assets, options)
  const out: PublicEpk = {
    audience: options.audience,
    bios: [], facts: [], videos: [], audio: [], photos: [], documents: [], links: [], withheld: [],
  }

  for (const section of epk.sections) {
    for (const a of section.assets) {
      const kind = normaliseAssetKind(a.kind)
      const value = (a.value ?? '').trim()
      if (!value) continue

      const withhold = (reason: WithheldReason) => out.withheld.push({ label: a.label, kind, reason })
      if (whyPrivate(a)) {
        withhold('private')
        continue
      }
      if (a.health.freshness === 'unreviewed') {
        withhold('unreviewed')
        continue
      }
      if (kind === 'photo' && !(a.credit ?? '').trim()) {
        withhold('no_credit')
        continue
      }

      const item: PublicItem = {
        label: a.label,
        value,
        variant: a.variant,
        credit: a.credit?.trim() || null,
        asOf: a.updatedAt.slice(0, 10),
      }
      if (kind === 'bio') out.bios.push(item)
      else if (kind === 'fact') out.facts.push(item)
      else if (kind === 'video') out.videos.push({ ...item, youtubeId: youtubeId(value) })
      else if (kind === 'audio') out.audio.push(item)
      else if (kind === 'photo') out.photos.push(item)
      else if (kind === 'document') out.documents.push(item)
      else if (kind === 'link') out.links.push(item)
    }
  }

  // Shortest bio first: the page opens on the version a stranger will read,
  // and offers the longer ones behind a switch.
  out.bios.sort((x, y) => x.value.length - y.value.length)
  return out
}

/** Words, as a form counts them. */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}
