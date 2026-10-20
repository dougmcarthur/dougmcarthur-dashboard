/**
 * The artist's Drive folder: where each file belongs and what it is called.
 *
 * Organisers and juries ask for "a folder, anyone with the link can view",
 * and what they get is usually `IMG_4471.JPG`, `final final v3.wav` and a
 * stage plot called `Untitled document`. Scout builds that folder instead —
 * see `src/routes/drive.ts` — and this module is the part that decides:
 * which subfolder a file goes in, and a predictable name for it, so a juror
 * who downloads everything gets `ArtistName_Photo_01.jpg` rather than a
 * pile they have to open to identify.
 *
 * It **plans**; it never writes. `planOrganise` returns every rename and move
 * with the file's current and proposed place, and the route applies it only
 * after the artist has seen it — a bulk write previews first. A file already
 * where it belongs, under the name it would get, is not in the plan at all.
 *
 * Pure: no network, no clock. The tests feed it the shapes Drive returns.
 */

import { extractAssets, type AssetProposal, type SkippedSection } from './artistSource'
import { linkLabel } from './manitobaMusic'
import { youtubeId } from './publicEpk'
import { classifyQuestion } from './questionKinds'

export const SUBFOLDERS = ['Photos', 'Audio', 'Video', 'Tech', 'Press', 'Other'] as const
export type Subfolder = (typeof SUBFOLDERS)[number]

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  /** The subfolder it sits in now, or null for the root. */
  folder: Subfolder | null
  createdTime?: string
}

export interface DriveLibraryFile extends DriveFile {
  webViewLink?: string | null
  width?: number | null
  height?: number | null
  /** Plain text read from a Google Doc or text file in the folder, when readable. */
  text?: string | null
}

const GOOGLE_FOLDER = 'application/vnd.google-apps.folder'

const TECH = /stage ?plot|input ?list|rider|tech(nical)?[ _-]?(spec|sheet|rider|requirements)?|backline|patch ?list/i
const PRESS = /\bepk\b|press ?kit|one[ -]?sheet|\bbio(graphy)?\b|press ?release|fact ?sheet/i

export function isFolder(f: { mimeType: string }): boolean {
  return f.mimeType === GOOGLE_FOLDER
}

/** Where a file belongs, from its type and — for documents — its name. */
export function subfolderFor(f: { name: string; mimeType: string }): Subfolder {
  const mime = f.mimeType.toLowerCase()
  if (mime.startsWith('image/')) return 'Photos'
  if (mime.startsWith('audio/')) return 'Audio'
  if (mime.startsWith('video/')) return 'Video'
  if (TECH.test(f.name)) return 'Tech'
  if (PRESS.test(f.name)) return 'Press'
  return 'Other'
}

/** "Jane Smith" → "JaneSmith"; accents dropped, nothing but letters and digits. */
export function artistSlug(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  const slug = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  return slug || 'Artist'
}

function splitExt(name: string): { stem: string; ext: string } {
  const m = name.match(/^(.*?)(\.[A-Za-z0-9]{1,5})?$/)
  return { stem: m?.[1] ?? name, ext: (m?.[2] ?? '').toLowerCase() }
}

/**
 * A title out of whatever the file was called: the artist's own name, track
 * numbers, "final", "master" and version marks come off, and what is left is
 * words joined by hyphens. Empty when nothing survives — the caller numbers
 * it instead of inventing a title.
 */
export function cleanTitle(stem: string, artist: string): string {
  // Underscores and dots separate words in a file name, and \b does not treat
  // them as boundaries, so they become spaces before anything is matched.
  let s = stem.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[_.]+/g, ' ')
  for (const part of [artist, artistSlug(artist)]) {
    if (part) s = s.replace(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ')
  }
  s = s
    .replace(/^\s*\d{1,3}\s*[-_.)]\s*/, ' ')
    .replace(/\b(final|master(ed)?|mix(down)?|bounce|copy|v\d+|version \d+|untitled( document)?|img|dsc|scan)\b/gi, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
  const words = s.split(/[^A-Za-z0-9']+/).filter((w) => w && w !== "'")
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('-')
}

const TECH_NAMES: Array<[RegExp, string]> = [
  [/stage ?plot/i, 'StagePlot'],
  [/input ?list|patch ?list/i, 'InputList'],
  [/rider/i, 'TechRider'],
]

/** The name a file would get, before collisions are resolved. */
export function proposedName(f: DriveFile, artist: string, index: number): string {
  const slug = artistSlug(artist)
  const { stem, ext } = splitExt(f.name)
  const folder = subfolderFor(f)
  const n = String(index).padStart(2, '0')
  const title = cleanTitle(stem, artist)

  if (folder === 'Photos') return `${slug}_Photo_${n}${ext}`
  if (folder === 'Tech') {
    const named = TECH_NAMES.find(([re]) => re.test(stem))
    return `${slug}_${named ? named[1] : title || `Tech_${n}`}${ext}`
  }
  if (folder === 'Press' && /\bepk\b|press ?kit/i.test(stem)) return `${slug}_EPK${ext}`
  return `${slug}_${title || `${folder}_${n}`}${ext}`
}

export interface PlannedChange {
  id: string
  from: { name: string; folder: Subfolder | null }
  to: { name: string; folder: Subfolder }
}

/**
 * Every rename and move that would tidy the folder.
 *
 * Photos are numbered in the order they were added, so adding a fifth photo
 * does not renumber the first four. Two files that would share a name get
 * `-2`, `-3`. A Google Doc, Sheet or Slides file has no extension and keeps
 * none; Drive exports those on download.
 */
export function planOrganise(files: DriveFile[], artist: string): PlannedChange[] {
  const ordered = files
    .filter((f) => !isFolder(f))
    .sort((a, b) => (a.createdTime ?? '').localeCompare(b.createdTime ?? '') || a.name.localeCompare(b.name))

  const counters = new Map<Subfolder, number>()
  const taken = new Map<Subfolder, Set<string>>()
  const plan: PlannedChange[] = []

  for (const f of ordered) {
    const folder = subfolderFor(f)
    const index = (counters.get(folder) ?? 0) + 1
    counters.set(folder, index)
    let name = proposedName(f, artist, index)

    const used = taken.get(folder) ?? new Set<string>()
    if (used.has(name.toLowerCase())) {
      const { stem, ext } = splitExt(name)
      let k = 2
      while (used.has(`${stem}-${k}${ext}`.toLowerCase())) k++
      name = `${stem}-${k}${ext}`
    }
    used.add(name.toLowerCase())
    taken.set(folder, used)

    if (f.name === name && f.folder === folder) continue
    plan.push({ id: f.id, from: { name: f.name, folder: f.folder }, to: { name, folder } })
  }
  return plan
}

/**
 * A link that downloads the file rather than opening Drive's viewer. For a
 * file over roughly 100 MB Google shows a "cannot scan for viruses" page
 * first; that is one extra click for the juror, not a failure.
 */
export function downloadUrl(id: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`
}

export function folderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`
}

const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/

/**
 * What the files in the artist's Drive folder would add to the artist library.
 *
 * The same `AssetProposal` shape the reference documents and association
 * profiles produce: preview first, then write, and everything added lands
 * never reviewed (`review_by = null`). Contact details are never copied out of
 * a Drive document, and anything Scout cannot classify is named in `skipped`.
 */
export function proposalsFromDrive(
  files: DriveLibraryFile[],
  artist: string,
): { proposals: AssetProposal[]; skipped: SkippedSection[] } {
  const ordered = files
    .filter((f) => !isFolder(f))
    .sort((a, b) => (a.createdTime ?? '').localeCompare(b.createdTime ?? '') || a.name.localeCompare(b.name))

  const proposals: AssetProposal[] = []
  const skipped: SkippedSection[] = []
  const seenUrls = new Set<string>()
  let photoCount = 0

  for (const f of ordered) {
    const folder = subfolderFor(f)
    const { stem } = splitExt(f.name)
    const title = cleanTitle(stem, artist).replace(/-/g, ' ').trim()
    const fileLink = (f.webViewLink ?? '').trim() || downloadUrl(f.id)
    const note = `From "${f.name}" in your Google Drive folder.`

    if (folder === 'Photos') {
      photoCount++
      const label = title || (photoCount === 1 ? 'Press photo' : `Press photo ${photoCount}`)
      const dims = f.width && f.height ? ` (${f.width}×${f.height} px)` : ''
      proposals.push({
        kind: 'photo',
        label,
        value: downloadUrl(f.id),
        questionKind: null,
        variant: null,
        source: `drive:${f.id}`,
        notes: `${note}${dims} Add the photographer's credit before using it.`,
      })
      continue
    }

    if (folder === 'Audio') {
      proposals.push({
        kind: 'audio',
        label: title || stem.trim() || 'Audio sample',
        value: fileLink,
        questionKind: null,
        variant: null,
        source: `drive:${f.id}`,
        notes: note,
      })
      continue
    }

    if (folder === 'Video') {
      proposals.push({
        kind: 'video',
        label: title || 'Live video',
        value: fileLink,
        questionKind: 'youtube',
        variant: null,
        source: `drive:${f.id}`,
        notes: note,
      })
      continue
    }

    if (folder === 'Tech') {
      const label = /stage ?plot/i.test(f.name)
        ? 'Stage plot'
        : /input ?list|patch ?list/i.test(f.name)
          ? 'Input list'
          : /rider/i.test(f.name)
            ? 'Tech rider'
            : title || 'Technical requirements'
      proposals.push({
        kind: 'document',
        label,
        value: fileLink,
        questionKind: 'tech_requirements',
        variant: null,
        source: `drive:${f.id}`,
        notes: note,
      })
      continue
    }

    const rawText = (f.text ?? '').trim()
    if (rawText) {
      const before = proposals.length
      if (/^##\s+/m.test(rawText)) {
        const extracted = extractAssets({ id: `drive:${f.id}`, title: f.name, content: rawText })
        let contactDropped = false
        for (const p of extracted.proposals) {
          if (CONTACT.test(p.value)) {
            contactDropped = true
            continue
          }
          proposals.push(p)
        }
        if (contactDropped) {
          skipped.push({
            heading: `${f.name} (contact details)`,
            reason: 'Phone and email are left in your Google Drive document, not copied into Scout.',
          })
        }
        for (const s of extracted.skipped) {
          skipped.push({ heading: `${f.name}: ${s.heading}`, reason: s.reason })
        }
      } else {
        for (const m of rawText.matchAll(/https?:\/\/[^\s<>)"']+/gi)) {
          const url = m[0].replace(/[.,;:!?)]+$/, '')
          let host = ''
          try {
            host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
          } catch {
            continue
          }
          if (host === 'drive.google.com' || host === 'docs.google.com') continue
          const key = url.toLowerCase()
          if (seenUrls.has(key)) continue
          seenUrls.add(key)

          const yt = youtubeId(url)
          if (yt) {
            proposals.push({
              kind: 'video',
              label: 'Live video',
              value: `https://www.youtube.com/watch?v=${yt}`,
              questionKind: 'youtube',
              variant: null,
              source: `drive:${f.id}#video:${yt}`,
              notes: note,
            })
          } else {
            const lbl = linkLabel(url)
            proposals.push({
              kind: 'link',
              label: lbl,
              value: url,
              questionKind: classifyQuestion({ label: lbl })?.key ?? null,
              variant: null,
              source: `drive:${f.id}#link:${url}`,
              notes: note,
            })
          }
        }

        let contactDropped = false
        const paras = rawText
          .split(/\n\s*\n/)
          .map((p) => p.replace(/^#{1,6}\s+/gm, '').trim())
          .filter((p) => {
            if (!p) return false
            if (/^https?:\/\/\S+$/i.test(p)) return false
            if (/^[^:\n]{1,60}:\s*https?:\/\/\S+$/i.test(p)) return false
            if (CONTACT.test(p)) {
              contactDropped = true
              return false
            }
            return true
          })

        const bio = paras.join('\n\n').trim()
        if (bio.length >= 40) {
          const isOneLiner = /\bone[ -]?line/i.test(f.name)
          const label = isOneLiner
            ? 'One-line description'
            : /\bshort\b/i.test(f.name)
              ? 'Short bio'
              : title && !/\bbio(graphy)?\b/i.test(title)
                ? `${title} bio`
                : 'Bio'
          proposals.push({
            kind: 'bio',
            label,
            value: bio.slice(0, 4000),
            questionKind: isOneLiner ? 'one_liner' : 'bio',
            variant: f.name,
            source: `drive:${f.id}#bio`,
            notes: `${note} Nobody has confirmed it since.`,
          })
        }
        if (contactDropped) {
          skipped.push({
            heading: `${f.name} (contact details)`,
            reason: 'Phone and email are left in your Google Drive document, not copied into Scout.',
          })
        }
      }

      if (/\bepk\b|press ?kit|one[ -]?sheet/i.test(f.name)) {
        proposals.push({
          kind: 'document',
          label: /\bepk\b|press ?kit/i.test(f.name) ? 'EPK' : 'One-sheet',
          value: fileLink,
          questionKind: 'epk',
          variant: null,
          source: `drive:${f.id}`,
          notes: note,
        })
      } else if (proposals.length === before) {
        skipped.push({
          heading: f.name,
          reason: 'No bio text or links found in this document.',
        })
      }
      continue
    }

    if (folder === 'Press') {
      const isEpk = /\bepk\b|press ?kit|one[ -]?sheet/i.test(f.name)
      const label = /\bepk\b|press ?kit/i.test(f.name)
        ? 'EPK'
        : /one[ -]?sheet/i.test(f.name)
          ? 'One-sheet'
          : /\bbio(graphy)?\b/i.test(f.name)
            ? 'Bio document'
            : title || 'Press kit'
      proposals.push({
        kind: 'document',
        label,
        value: fileLink,
        questionKind: isEpk ? 'epk' : null,
        variant: null,
        source: `drive:${f.id}`,
        notes: note,
      })
      continue
    }

    skipped.push({
      heading: f.name,
      reason: 'Could not tell whether this is a bio, photo, audio sample, video or stage plot from its name or file type.',
    })
  }

  return { proposals, skipped }
}

