/**
 * The public EPK, read as an artist page.
 *
 * `buildPublicEpk` decides what may cross to a stranger; this decides how it
 * reads once it has. The two are separate because the library's values were
 * written for forms and documents, not for a page: most of them arrive from
 * `artistSource.ts` exactly as the artist brief had them, so the "Artist
 * Name" fact is three lines of markdown, "Genre" is a paragraph plus an FFO
 * list plus an influences list, and the press quote carries its attribution on
 * a dash line. Printed verbatim that is a wall of uppercase text over a
 * heading reading "Doug" — which is what the first version shipped.
 *
 * So this module takes each value apart along the seams the documents
 * actually use — lines, blank-line paragraphs, `Label:` prefixes, a closing
 * `— source` — and nothing cleverer. A value with no seams is used whole, and
 * nothing is invented: a name comes from the library or the account, never
 * from a URL.
 *
 * Pure; the view renders whatever this returns.
 */

import type { PublicEpk, PublicItem } from './publicEpk'
import { wordCount } from './publicEpk'

export interface ProfileBio {
  label: string
  words: number
  value: string
}

export interface ProfileLink {
  label: string
  url: string
  platform: Platform | null
}

export type Platform =
  | 'spotify' | 'apple_music' | 'bandcamp' | 'soundcloud' | 'youtube'
  | 'instagram' | 'facebook' | 'tiktok' | 'twitter' | 'bandsintown'

export interface EpkProfile {
  name: string
  /** The lines under the name: what they are and where from, then how long. */
  descriptor: string[]
  tagline: string | null
  /** One clause, not the paragraph a form's "describe your genre" wants. */
  genre: string | null
  fansOf: string[]
  influences: string[]
  quotes: Array<{ text: string; source: string | null }>
  highlights: Array<{ label: string | null; text: string }>
  glance: Array<{ label: string; value: string; asOf: string }>
  bios: ProfileBio[]
  /** The bio the page opens on: the one nearest a hundred words. */
  bioIndex: number
  links: { listen: ProfileLink[]; watch: ProfileLink[]; follow: ProfileLink[]; more: ProfileLink[] }
}

/** Bold, italics, code and links, as plain text. */
export function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*(#+|[-*•])\s+/gm, '')
    .trim()
}

function lines(text: string): string[] {
  return plain(text)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => plain(p).replace(/\s*\n\s*/g, ' '))
    .filter(Boolean)
}

function list(text: string): string[] {
  return text
    .split(/\s*[,;]\s*|\s+·\s+/)
    .map((s) => s.replace(/\.$/, '').trim())
    .filter(Boolean)
}

const FANS_OF = /^(for fans of|fans of|ffo|sounds like|recommended if you like|ril)\b[^:]*:\s*/i
const INFLUENCES = /^(core )?influences?\b[^:]*:\s*/i

/** "Alt-pop / indie singer-songwriter, rooted in…" plus the lists the same field often carries. */
export function readGenre(value: string): { genre: string | null; fansOf: string[]; influences: string[] } {
  let genre: string | null = null
  const fansOf: string[] = []
  const influences: string[] = []
  for (const p of paragraphs(value)) {
    if (FANS_OF.test(p)) fansOf.push(...list(p.replace(FANS_OF, '')))
    else if (INFLUENCES.test(p)) influences.push(...list(p.replace(INFLUENCES, '')))
    else if (!genre) genre = p.replace(/\.$/, '')
  }
  return { genre, fansOf, influences }
}

/** `"Quote." — Name, Outlet`, with the attribution on its own line or after a dash. */
export function readQuote(value: string): { text: string; source: string | null } {
  const text = plain(value)
  const m = text.match(/^([\s\S]*?)\s*(?:\n|\s)[—–-]{1,2}\s*([^\n—–]{2,120})$/)
  const body = (m ? m[1] : text).trim()
  const source = m ? m[2].trim() : null
  return { text: body.replace(/^["“]+|["”]+$/g, '').trim(), source }
}

/** Paragraphs, each split on a leading `Label:` when it has one. */
export function readHighlights(value: string): Array<{ label: string | null; text: string }> {
  return paragraphs(value).map((p) => {
    const m = p.match(/^([A-Z][\w/ &'-]{1,30}):\s+(.+)$/)
    return m ? { label: m[1], text: m[2] } : { label: null, text: p }
  })
}

const PLATFORM_HOSTS: Array<[RegExp, Platform, string]> = [
  [/(^|\.)spotify\.com$/, 'spotify', 'Spotify'],
  [/^music\.apple\.com$/, 'apple_music', 'Apple Music'],
  [/(^|\.)bandcamp\.com$/, 'bandcamp', 'Bandcamp'],
  [/(^|\.)soundcloud\.com$/, 'soundcloud', 'SoundCloud'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube', 'YouTube'],
  [/(^|\.)instagram\.com$/, 'instagram', 'Instagram'],
  [/(^|\.)facebook\.com$/, 'facebook', 'Facebook'],
  [/(^|\.)tiktok\.com$/, 'tiktok', 'TikTok'],
  [/(^|\.)(twitter\.com|x\.com)$/, 'twitter', 'X'],
  [/(^|\.)bandsintown\.com$/, 'bandsintown', 'Bandsintown'],
]

export function platformOf(url: string): { platform: Platform; name: string } | null {
  let host: string
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
  const hit = PLATFORM_HOSTS.find(([re]) => re.test(host))
  return hit ? { platform: hit[1], name: hit[2] } : null
}

const LISTEN: Platform[] = ['spotify', 'apple_music', 'bandcamp', 'soundcloud']
const FOLLOW: Platform[] = ['instagram', 'tiktok', 'facebook', 'twitter']

function groupLinks(items: PublicItem[]): EpkProfile['links'] {
  const out: EpkProfile['links'] = { listen: [], watch: [], follow: [], more: [] }
  const seen = new Set<string>()
  for (const l of items) {
    const url = l.value.trim()
    const key = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const p = platformOf(url)
    const link: ProfileLink = { label: p?.name ?? l.label, url, platform: p?.platform ?? null }
    if (p && LISTEN.includes(p.platform)) out.listen.push(link)
    else if (p?.platform === 'youtube') out.watch.push(link)
    else if (p && FOLLOW.includes(p.platform)) out.follow.push(link)
    else out.more.push(link)
  }
  out.listen.sort((a, b) => LISTEN.indexOf(a.platform!) - LISTEN.indexOf(b.platform!))
  out.follow.sort((a, b) => FOLLOW.indexOf(a.platform!) - FOLLOW.indexOf(b.platform!))
  // The artist's own site leads what is left: it is the one link they control.
  out.more.sort((a, b) => Number(/website/i.test(b.label)) - Number(/website/i.test(a.label)))
  return out
}

/** Short, Medium, Long — a switch names a length, not a count a stranger has to read. */
function bioLabels(n: number): string[] {
  if (n === 1) return ['Bio']
  if (n === 2) return ['Short', 'Long']
  if (n === 3) return ['Short', 'Medium', 'Long']
  return Array.from({ length: n }, (_, i) => (i === 0 ? 'Shortest' : i === n - 1 ? 'Longest' : `Version ${i + 1}`))
}

const HEADLINE_FACTS = new Set(['artist_name', 'genre', 'one_liner', 'press_quote', 'career_highlights', 'influences'])

export function epkProfile(epk: PublicEpk, displayName: string | null): EpkProfile {
  const byKind = (k: string) => epk.facts.filter((f) => f.questionKind === k)

  const nameLines = byKind('artist_name')[0] ? lines(byKind('artist_name')[0].value) : []
  const name = nameLines[0] || displayName?.trim() || 'Artist'

  const genreFact = byKind('genre')[0]
  const { genre, fansOf, influences } = genreFact ? readGenre(genreFact.value) : { genre: null, fansOf: [], influences: [] }
  for (const f of byKind('influences')) influences.push(...list(plain(f.value).replace(INFLUENCES, '')))

  const tagline = [...epk.taglines, ...byKind('one_liner')][0]?.value

  const glance = epk.facts
    .filter((f) => !HEADLINE_FACTS.has(f.questionKind ?? ''))
    .map((f) => ({ label: f.label, value: plain(f.value), asOf: f.asOf }))

  const ranked = epk.bios.map((b) => ({ value: plain(b.value), words: wordCount(b.value) }))
  const labels = bioLabels(ranked.length)
  const bios = ranked.map((b, i) => ({ ...b, label: labels[i] }))
  let bioIndex = 0
  bios.forEach((b, i) => {
    if (Math.abs(b.words - 100) < Math.abs(bios[bioIndex].words - 100)) bioIndex = i
  })

  return {
    name,
    descriptor: nameLines.slice(1),
    tagline: tagline ? plain(tagline) : null,
    genre,
    fansOf: [...new Set(fansOf)],
    influences: [...new Set(influences)],
    quotes: byKind('press_quote').map((q) => readQuote(q.value)),
    highlights: byKind('career_highlights').flatMap((h) => readHighlights(h.value)),
    glance,
    bios,
    bioIndex,
    links: groupLinks(epk.links),
  }
}
