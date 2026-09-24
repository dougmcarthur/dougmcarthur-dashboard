/**
 * Manitoba Music member profiles: a page most local artists already keep.
 *
 * Manitoba Music is the province's music industry association, and a member
 * profile (`manitobamusic.com/profiles/view,499/<slug>`) holds most of what an
 * application asks for — a bio, genres, links, live video, a discography, a
 * stage plot, photos — written by the artist and served as plain HTML. The
 * people most likely to try Scout next are other Winnipeg artists, who mostly
 * have one. So it is read, the way the reference documents are read.
 *
 * **The artist gives the address; Scout never looks one up.** A search by
 * name would find the wrong Doug on the day there are two, and would file a
 * stranger's bio as yours. `profileUrl` accepts a profile address and nothing
 * else, and connecting shows the name and photo first so the artist confirms
 * it is them.
 *
 * What is read and what is not:
 *
 * - **Read:** the About text, genres, the Websites list, Media & Downloads
 *   files, the Watch videos (YouTube), the Discography, and the Photos.
 * - **Not read:** the contact block. A phone number on a public page is there
 *   for bookers to use, not for an app to copy into another database.
 *   Audio previews stay on Manitoba Music, which disallows `/uploads` to
 *   crawlers; a release is filed as its page, which carries the player.
 * - **Named, not filed:** shows and news. Shows come from Bandsintown; news is
 *   the kind of thing the findings inbox is for, and until it exists it is
 *   listed rather than guessed into a bio.
 *
 * Regex over the page's own class names, like `src/lib/formParser.ts`, so it
 * runs the same in the Worker and in vitest. Every section is optional: a
 * profile without videos yields no videos, never an error.
 */

import type { AssetProposal, SkippedSection } from './artistSource'
import { classifyQuestion } from './questionKinds'

export const MM_HOST = 'www.manitobamusic.com'

/**
 * The canonical profile address, or why the input is not one.
 *
 * Accepts what people paste: no scheme, no `www`, a trailing slash, a query,
 * the `.rss` or `.ics` feed of the same profile. Refuses anything that is not
 * `/profiles/view,<number>/<slug>` on Manitoba Music, including the site's
 * other pages, because reading one of those as a profile would file a news
 * article as a bio.
 */
export function profileUrl(input: string): { url: string; slug: string } | { error: string } {
  const raw = input.trim()
  if (!raw) return { error: 'Paste the address of your Manitoba Music profile.' }
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return { error: 'That is not a web address.' }
  }
  const host = u.hostname.toLowerCase()
  if (host !== 'manitobamusic.com' && host !== MM_HOST) {
    return { error: 'That is not a Manitoba Music address.' }
  }
  const m = u.pathname.match(/^\/profiles\/view,(\d+)\/([a-z0-9_-]+?)(?:\.(?:rss|ics))?\/?$/i)
  if (!m) {
    return {
      error: 'That is a Manitoba Music page, but not a profile. Open your profile and copy the address from there — it has /profiles/view in it.',
    }
  }
  return { url: `https://${MM_HOST}/profiles/view,${m[1]}/${m[2].toLowerCase()}`, slug: m[2].toLowerCase() }
}

export interface MmLink {
  label: string
  url: string
}

export interface MmProfile {
  name: string
  genres: string[]
  /** The About text, paragraphs joined by a blank line, links as their text. */
  bio: string | null
  photo: string | null
  links: MmLink[]
  files: MmLink[]
  videos: Array<{ title: string; youtubeId: string }>
  releases: Array<{ title: string; released: string | null; url: string }>
  photos: string[]
  shows: Array<{
    date: string
    /** `HH:MM`, 24-hour, or null. */
    time: string | null
    title: string
    venue: string | null
    /** "Winnipeg, MB" */
    location: string | null
    url: string | null
  }>
  news: Array<{ date: string | null; title: string; url: string }>
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…',
}

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
}

function text(html: string): string {
  return decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

/** The inner HTML of the first element carrying `cls`, up to its marker comment or a sensible end. */
function section(html: string, cls: string, endMarker: RegExp): string | null {
  const start = html.search(new RegExp(`class="[^"]*\\b${cls}\\b`))
  if (start === -1) return null
  const rest = html.slice(start)
  const end = rest.search(endMarker)
  return end === -1 ? rest.slice(0, 20000) : rest.slice(0, end)
}

function https(url: string): string | null {
  const s = decode(url.trim())
  const abs = s.startsWith('/') ? `https://${MM_HOST}${s}` : s
  return /^https:\/\//i.test(abs) ? abs : null
}

function to24(h: string, m: string, ampm: string): string {
  let hour = Number(h) % 12
  if (ampm.toUpperCase() === 'PM') hour += 12
  return `${String(hour).padStart(2, '0')}:${m}`
}

/** "instagram.com" → "Instagram"; the artist's own domain → "Website". */
export function linkLabel(url: string): string {
  let host = ''
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return 'Link'
  }
  const known: Array<[RegExp, string]> = [
    [/(^|\.)facebook\.com$/, 'Facebook'],
    [/(^|\.)instagram\.com$/, 'Instagram'],
    [/(^|\.)tiktok\.com$/, 'TikTok'],
    [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
    [/(^|\.)spotify\.com$/, 'Spotify'],
    [/(^|\.)bandcamp\.com$/, 'Bandcamp'],
    [/(^|\.)soundcloud\.com$/, 'SoundCloud'],
    [/(^|\.)music\.apple\.com$/, 'Apple Music'],
    [/(^|\.)(twitter\.com|x\.com)$/, 'X'],
    [/(^|\.)bandsintown\.com$/, 'Bandsintown'],
    [/(^|\.)linktr\.ee$/, 'Linktree'],
  ]
  for (const [re, label] of known) if (re.test(host)) return label
  return 'Website'
}

/**
 * The profile, or null when the page is not one.
 *
 * Null rather than an empty profile: a page with no `directory-profile`
 * section is a login page, a 404 template or a redesign, and each of those
 * should read as "could not read it", never as "your profile is empty".
 */
export function parseProfile(html: string): MmProfile | null {
  const root = section(html, 'directory-profile', /<p class="back"|<\/section>\s*<\/main>/)
  if (!root) return null
  const h1 = root.match(/<h1[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/)
  const name = h1 ? text(h1[1]) : ''
  if (!name) return null

  const genres = [...root.matchAll(/<span class="genre">([\s\S]*?)<\/span>/g)].map((m) => text(m[1])).filter(Boolean)

  const photoM = root.match(/<figure class="profile-photo">[\s\S]*?<img[^>]*src="([^"]+)"/)

  let bio: string | null = null
  const bioSec = section(root, 'profile-bio', /<div class="profile-details"/)
  if (bioSec) {
    const paras = [...bioSec.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => text(m[1])).filter(Boolean)
    bio = paras.length ? paras.join('\n\n') : null
  }

  const links: MmLink[] = []
  const web = root.match(/<dd class="web">([\s\S]*?)<\/dd>/)
  if (web) {
    for (const m of web[1].matchAll(/<a[^>]*href="([^"]+)"/g)) {
      const url = https(m[1])
      if (url && !links.some((l) => l.url === url)) links.push({ label: linkLabel(url), url })
    }
  }

  const files: MmLink[] = []
  const fileSec = section(root, 'profile-file', /<\/ul>/)
  if (fileSec) {
    for (const m of fileSec.matchAll(/<a[^>]*href="([^"]+)"[\s\S]*?<b class="file-item-title">([\s\S]*?)<\/b>/g)) {
      const url = https(m[1])
      if (url) files.push({ label: text(m[2]), url })
    }
  }

  const videos: MmProfile['videos'] = []
  const vidSec = section(root, 'profile-videos', /<!-- \.profile-videos -->/)
  if (vidSec) {
    for (const m of vidSec.matchAll(/youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{6,})[\s\S]*?<h3 class="video-text">\s*<b>([\s\S]*?)<\/b>/g)) {
      if (!videos.some((v) => v.youtubeId === m[1])) videos.push({ youtubeId: m[1], title: text(m[2]) })
    }
  }

  const releases: MmProfile['releases'] = []
  const discSec = section(root, 'profile-discography', /<div class="profile-news"|<div class="profile-photos/)
  if (discSec) {
    for (const m of discSec.matchAll(/<article class="disc-item">([\s\S]*?)<\/article>/g)) {
      const href = m[1].match(/<a class="disc-link" href="([^"]+)"/)
      const title = m[1].match(/<p class="disc-title">[\s\S]*?<\/b>([\s\S]*?)<\/p>/)
      const date = m[1].match(/<p class="disc-date">[\s\S]*?<\/b>([\s\S]*?)<\/p>/)
      const url = href ? https(href[1]) : null
      if (url && title) releases.push({ url, title: text(title[1]), released: date ? text(date[1]) : null })
    }
  }

  const photos: string[] = []
  const photoSec = section(root, 'profile-photos', /<!-- \.profile-photos -->/)
  if (photoSec) {
    for (const m of photoSec.matchAll(/<li class="photo-item">\s*<a href="([^"]+)"/g)) {
      const url = https(m[1])
      if (url) photos.push(url)
    }
  }

  const shows: MmProfile['shows'] = []
  const evSec = section(root, 'profile-events', /<!-- \.profile-events -->/)
  if (evSec) {
    for (const m of evSec.matchAll(/<article class="event-item[^"]*">([\s\S]*?)<\/article>/g)) {
      const date = m[1].match(/<time class="event-item-date" datetime="(\d{4}-\d{2}-\d{2})/)
      const title = m[1].match(/<h3 class="event-item-title">([\s\S]*?)<\/h3>/)
      const href = m[1].match(/<h3 class="event-item-title">[\s\S]*?href="([^"]+)"/)
      const venue = m[1].match(/<a class="venue-name"[^>]*>([\s\S]*?)<\/a>/)
      const region = m[1].match(/<span class="venue-region">([\s\S]*?)<\/span>/)
      const time = m[1].match(/<span class="event-item-time">\s*(\d{1,2}):(\d{2})\s*([AP]M)/i)
      if (date && title) {
        shows.push({
          date: date[1],
          time: time ? to24(time[1], time[2], time[3]) : null,
          title: text(title[1]),
          venue: venue ? text(venue[1]) || null : null,
          location: region ? text(region[1]) || null : null,
          url: href ? https(href[1]) : null,
        })
      }
    }
  }

  const news: MmProfile['news'] = []
  const newsSec = section(root, 'profile-news', /<div class="profile-photos|<p class="back"/)
  if (newsSec) {
    for (const m of newsSec.matchAll(/<article class="news-item[^"]*">([\s\S]*?)<\/article>/g)) {
      const t = m[1].match(/<h3 class="news-item-title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
      const date = m[1].match(/<time class="news-item-date" datetime="(\d{4}-\d{2}-\d{2})/)
      const url = t ? https(t[1]) : null
      if (t && url) news.push({ url, title: text(t[2]), date: date ? date[1] : null })
    }
  }

  return {
    name,
    genres,
    bio,
    photo: photoM ? https(photoM[1]) : null,
    links,
    files,
    videos,
    releases,
    photos,
    shows,
    news,
  }
}

/**
 * What the profile would add to the artist database.
 *
 * The same `AssetProposal` shape the reference documents produce, so the same
 * route writes it and the same rule holds: a proposal whose `source` is
 * already on file is left exactly as it is. The `source` is keyed on the
 * profile slug plus what the item is (a video id, a URL), never its position,
 * so reordering the profile does not re-propose everything.
 */
export function proposalsFrom(profile: MmProfile, slug: string): { proposals: AssetProposal[]; skipped: SkippedSection[] } {
  const src = (key: string) => `manitoba-music:${slug}#${key}`
  const note = 'From your Manitoba Music profile.'
  const proposals: AssetProposal[] = []
  const skipped: SkippedSection[] = []

  if (profile.bio) {
    proposals.push({
      kind: 'bio', label: 'Bio', value: profile.bio, questionKind: 'bio',
      variant: 'Manitoba Music', source: src('bio'), notes: note,
    })
  }
  if (profile.genres.length) {
    proposals.push({
      kind: 'fact', label: 'Genre', value: profile.genres.join(', '), questionKind: 'genre',
      variant: null, source: src('genres'), notes: note,
    })
  }
  for (const l of profile.links) {
    proposals.push({
      kind: 'link', label: l.label, value: l.url, questionKind: classifyQuestion({ label: l.label })?.key ?? null,
      variant: null, source: src(`link:${l.url}`), notes: note,
    })
  }
  for (const v of profile.videos) {
    proposals.push({
      kind: 'video', label: v.title || 'Video', value: `https://www.youtube.com/watch?v=${v.youtubeId}`,
      questionKind: 'youtube', variant: null, source: src(`video:${v.youtubeId}`), notes: note,
    })
  }
  for (const r of profile.releases) {
    proposals.push({
      kind: 'audio', label: r.title, value: r.url, questionKind: null,
      variant: r.released, source: src(`release:${r.url}`), notes: `${note} Released ${r.released ?? 'on an unstated date'}.`,
    })
  }
  for (const f of profile.files) {
    proposals.push({
      kind: 'document', label: f.label, value: f.url, questionKind: classifyQuestion({ label: f.label })?.key ?? null,
      variant: null, source: src(`file:${f.url}`), notes: note,
    })
  }
  const photos = [profile.photo, ...profile.photos].filter((p): p is string => !!p)
  const seen = new Set<string>()
  for (const p of photos) {
    // The same image is served with different `?t=` cache-busters.
    const key = p.split('?')[0]
    if (seen.has(key)) continue
    seen.add(key)
    proposals.push({
      kind: 'photo', label: 'Press photo', value: p, questionKind: null, variant: null,
      source: src(`photo:${key}`),
      notes: `${note} Manitoba Music does not say who took it — add the photographer's credit before using it.`,
    })
  }

  skipped.push({ heading: 'Contact', reason: 'phone and email are left on Manitoba Music, not copied into Scout' })
  if (profile.shows.length) {
    skipped.push({ heading: 'Shows', reason: `${profile.shows.length} listed — shows come from Bandsintown, so these are not filed twice` })
  }
  if (profile.news.length) {
    skipped.push({ heading: 'News', reason: `${profile.news.length} articles mention you — worth a line in a bio, but Scout does not write one for you` })
  }

  return { proposals, skipped }
}
