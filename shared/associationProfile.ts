/**
 * A member profile on any provincial music association's site.
 *
 * Manitoba Music has a parser written against its markup
 * (`shared/manitobaMusic.ts`). The others run on four different platforms —
 * Drupal, WordPress, the CakePHP system MusicOntario shares with SaskMusic —
 * and one parser per site is a parser per redesign. So this reads any of them
 * the same way, by subtraction:
 *
 * **What is on the profile and not on the association's homepage is the
 * member's.** Every one of these pages is wrapped in the association's own
 * header and footer, and those carry the association's own Instagram,
 * Facebook and YouTube links — which a naive read files as the artist's.
 * Fetching the homepage beside the profile and dropping every link, image and
 * paragraph the two share removes that chrome without knowing a single class
 * name.
 *
 * What it takes, and nothing else:
 *
 * - the **name**, from the page's heading or its title;
 * - a **bio**, from the profile's own paragraphs — never one with an email
 *   address or a phone number in it, since contact details are left on the
 *   association's site, exactly as with Manitoba Music;
 * - **links** off the association's site, minus share buttons and maps;
 * - **videos**, from YouTube embeds and watch links;
 * - a **photo**, from the page's `og:image` when the homepage does not share it;
 * - **genres**, from links to the directory filtered by genre, where the site has them.
 *
 * It returns Manitoba Music's profile shape, so the same proposals, the same
 * preview and the same "never reviewed" import apply. Everything it finds is a
 * suggestion; nothing here is trusted until the artist marks it right.
 *
 * Pure: two strings of HTML and an address in, a profile out.
 */

import { decode, type MmProfile } from './manitobaMusic'
import { youtubeId } from './publicEpk'
import { platformOf } from './epkProfile'

function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, (m) =>
      // Iframes are kept as a marker: a YouTube embed is a video.
      /^<iframe/i.test(m) ? (m.match(/<iframe[^>]*>/i)?.[0] ?? ' ') : ' ',
    )
}

/**
 * The member's part of the page: `<main>` when the site has one, otherwise
 * the body with its header, navigation and footer cut out.
 */
function region(html: string): string {
  const clean = stripNoise(html)
  const main = clean.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)
  if (main) return main[1]
  const body = clean.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? clean
  return body.replace(/<(header|nav|footer)\b[\s\S]*?<\/\1>/gi, ' ')
}

function text(html: string): string {
  return decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

function absolute(href: string, base: string): string | null {
  try {
    const u = new URL(decode(href.trim()), base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/** Case, `www.`, a trailing slash and tracking parameters are not differences. */
function linkKey(url: string): string {
  try {
    const u = new URL(url)
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|igsh|si$|ref)/i.test(k)) u.searchParams.delete(k)
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${u.search}`.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

function hrefs(html: string, base: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]+)"/gi)) {
    const u = absolute(m[1], base)
    if (u) out.push(u)
  }
  return out
}

function meta(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]*>`, 'i')
  const tag = html.match(re)?.[0]
  const v = tag?.match(/content="([^"]*)"/i)?.[1]
  return v ? decode(v).trim() || null : null
}

/** A share button, a map or a login is a link the page has, not one the member does. */
const NOT_A_MEMBER_LINK =
  /facebook\.com\/sharer|twitter\.com\/intent|x\.com\/intent|linkedin\.com\/share|pinterest\.com\/pin|maps\.google|google\.[a-z.]+\/maps|addtoany|mailto:|tel:/i

const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/

/**
 * The member's name. Titles come in every order — "Name | Association",
 * "Association: Name", "Directory | Association" — so a title part counts
 * first when the page itself shows it: as a heading, or in the profile's own
 * text (a breadcrumb). Then a title with only one part left, and failing
 * that, the profile's first heading.
 */
function nameFrom(page: string, area: string, associationName: string): string | null {
  const clean = stripNoise(page)
  const title = meta(page, 'og:title') ?? text(page.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
  const org = associationName.toLowerCase().replace(/\s+/g, '')
  const parts = title
    .split(/\s*[|:–—]\s+|\s+-\s+/)
    .map((p) => p.trim())
    .filter((p) => p && p.length <= 80 && !p.toLowerCase().replace(/\s+/g, '').includes(org) && !/^(directory|profiles?|members?|home|artists?)$/i.test(p))
  const headings = [...clean.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => text(m[1])).filter((h) => h && h.length <= 80)
  const areaText = text(area).toLowerCase()
  const shown = parts.find((p) => headings.some((h) => h.toLowerCase() === p.toLowerCase())) ?? parts.find((p) => areaText.includes(p.toLowerCase()))
  if (shown) return shown
  // One title part left over is the page naming its subject, even when the
  // page never repeats it; a heading inside the profile ("Connect") is not.
  if (parts.length === 1) return parts[0]
  const first = [...area.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)].map((m) => text(m[1])).find((h) => h && h.length <= 80)
  return first ?? null
}

export function parseAssociationProfile(
  page: string,
  chrome: string,
  options: { url: string; associationName: string },
): MmProfile | null {
  const { url, associationName } = options
  const siteHost = new URL(url).hostname.replace(/^www\./, '')
  const area = region(page)

  const name = nameFrom(page, area, associationName)
  if (!name) return null

  const chromeLinks = new Set(hrefs(stripNoise(chrome), url).map(linkKey))
  const chromeText = new Set(
    [...stripNoise(chrome).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => text(m[1]).toLowerCase()),
  )

  // Videos first: a watch link is a video, not a link.
  const videos: MmProfile['videos'] = []
  const seenVideo = new Set<string>()
  const addVideo = (id: string | null) => {
    if (id && !seenVideo.has(id)) {
      seenVideo.add(id)
      videos.push({ title: '', youtubeId: id })
    }
  }
  for (const m of area.matchAll(/<iframe[^>]*\bsrc="([^"]+)"/gi)) addVideo(youtubeId(absolute(m[1], url) ?? ''))

  const links: MmProfile['links'] = []
  const seenLink = new Set<string>()
  for (const href of hrefs(area, url)) {
    const key = linkKey(href)
    if (seenLink.has(key) || chromeLinks.has(key) || NOT_A_MEMBER_LINK.test(href)) continue
    const host = new URL(href).hostname.replace(/^www\./, '')
    if (host === siteHost) continue
    seenLink.add(key)
    const video = youtubeId(href)
    if (video) {
      addVideo(video)
      continue
    }
    links.push({ label: platformOf(href)?.name ?? host, url: href })
  }

  const paragraphs = [...area.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => text(m[1]))
    .filter((p) => p.length >= 40 && !CONTACT.test(p) && !chromeText.has(p.toLowerCase()))
  const bio = paragraphs.join('\n\n').trim()

  // A directory that files members by genre links each genre to a filtered
  // listing — `?genre=14`, `/genre/folk` — and those links are the genres.
  const genres = [
    ...new Set(
      [...area.matchAll(/<a\b[^>]*\bhref="[^"]*genre[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)]
        .map((m) => text(m[1]))
        .filter((g) => g && g.length < 40),
    ),
  ]

  const photo = meta(page, 'og:image')
  const chromePhoto = meta(chrome, 'og:image')

  return {
    name,
    genres,
    bio: bio.length >= 80 ? bio.slice(0, 4000) : null,
    photo: photo && photo !== chromePhoto && !/logo/i.test(photo) ? absolute(photo, url) : null,
    links,
    files: [],
    videos,
    releases: [],
    photos: [],
    shows: [],
    news: [],
  }
}
