/**
 * Filling the artist database from the documents that already describe him.
 *
 * Step C built the table, the expiry and the EPK, and then nothing filled it:
 * `artist_assets` has been empty in production since migration 0009, which is
 * why every application panel says "Nothing on file answers this yet". The
 * facts were never missing — they sit in `reference_docs`, three markdown
 * documents this app already stores and never read.
 *
 * ## What is extracted, and the three rules that decide
 *
 * 1. **A heading is a question; its body is the answer.** `classifyQuestion`
 *    already maps a form field's label onto a canonical question, and a
 *    document's `##` heading is the same kind of label. So "Genre" becomes the
 *    `genre` answer without a single pattern written for this document.
 * 2. **A parenthetical in a heading is a variant.** "Approved Short Bio (150
 *    words — Manitoba Music)" is the `bio` answer at one length, which is
 *    exactly what `variant` and `pickForLength` exist for.
 * 3. **A labelled URL on its own line is a link.** `Spotify: https://…`, in
 *    any document. Deliberately *not* inside a list item: a link under a
 *    release is about that release, not about the artist, and mining those
 *    would file six album URLs under one Spotify question.
 *
 * ## What it refuses to do
 *
 * No prose parsing. `shared/reviewParse.ts` is the cautionary tale — a
 * stopgap that re-derives structure out of sentences on every read and is the
 * oldest debt in the repo. Nothing here reads a sentence. A section this
 * module cannot file is reported by name in `skipped` rather than guessed at,
 * for the same reason phase 3 lists what it could not answer instead of
 * inventing something.
 *
 * ## Everything it produces is a suggestion
 *
 * Proposals carry no review date, so they land `unreviewed` — the state
 * `assetHealth` already keeps apart from `overdue` because "this lapsed" and
 * "nobody ever claimed this was checked" are different conversations. A
 * document said this; you have not. `source` records which document and which
 * heading, which is also what makes a second run add nothing.
 *
 * Pure, like everything in shared/, and it does not even take a `today`:
 * there is no date in an extraction.
 */

import type { AssetKind } from './artistAssets'
import { classifyQuestion } from './questionKinds'

export interface SourceDoc {
  id: string
  title: string
  content: string
}

export interface AssetProposal {
  kind: AssetKind
  label: string
  value: string
  /** The canonical question this answers, when the heading named one. */
  questionKind: string | null
  /** The parenthetical off the heading — a bio's length, usually. */
  variant: string | null
  /**
   * `artist-profile#Genre`. The identity of a proposal: a row already
   * carrying this source is left exactly as it is, so re-running adds what is
   * new and never overwrites what you have edited.
   */
  source: string
  notes: string | null
}

/** A section that produced nothing, and why. Named rather than dropped. */
export interface SkippedSection {
  heading: string
  reason: string
}

export interface SourceResult {
  proposals: AssetProposal[]
  skipped: SkippedSection[]
}

interface Section {
  heading: string | null
  body: string
}

/** Splits a markdown document on its level-two headings. */
function sections(content: string): Section[] {
  const out: Section[] = []
  let current: Section = { heading: null, body: '' }

  for (const line of content.split('\n')) {
    // Level two only. A `#` is the document's title and a `###` is a
    // subdivision of the section it sits in, so both stay in the body.
    const match = /^##\s+(.*\S)\s*$/.exec(line)
    if (match) {
      out.push(current)
      current = { heading: match[1], body: '' }
    } else {
      current.body += `${line}\n`
    }
  }
  out.push(current)
  return out
}

/**
 * A heading split into the label and the qualifier in brackets after it.
 *
 * "Approved Short Bio (150 words — Manitoba Music / Grant Applications)" is
 * one answer at one length, and the two halves belong in different columns.
 */
export function splitHeading(heading: string): { label: string; variant: string | null } {
  const match = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(heading)
  if (!match || !match[1].trim()) return { label: heading.trim(), variant: null }
  return { label: match[1].trim(), variant: match[2].trim() || null }
}

/**
 * Trims the horizontal rules and trailing "Last updated" line that separate
 * sections in these documents from the answer itself.
 */
function cleanBody(body: string): string {
  return body
    .split('\n')
    .filter((l) => !/^\s*(---+|\*\*\*+|___+)\s*$/.test(l))
    .filter((l) => !/^\s*Last updated:/i.test(l))
    .join('\n')
    .trim()
}

const URL_VALUE = /^https?:\/\/\S+$/i
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** A value that identifies a place rather than saying something. */
const isAddress = (v: string) => URL_VALUE.test(v) || EMAIL_VALUE.test(v)

/**
 * The asset kind for a section, from what it turned out to be.
 *
 * Only two questions get a kind of their own: a bio and a one-liner are the
 * things `pickForLength` chooses between. A value that is plainly a URL is a
 * `link` whatever the question was, and everything else is a `fact` — which
 * is what `normaliseAssetKind` already calls the least wrong assumption for a
 * short answer.
 */
function kindFor(questionKey: string | null, value: string): AssetKind {
  if (URL_VALUE.test(value)) return 'link'
  if (questionKey === 'bio' || questionKey === 'one_liner') return 'bio'
  return 'fact'
}

/**
 * The `Label: value` pairs on a line, where the value is a URL or an email.
 *
 * Split on the first colon *followed by a space*, so `https://` survives being
 * a value with a colon in it. Several pairs may share a line — these documents
 * write their link list pipe-separated — so the line is cut on `|` first.
 */
function labelledLinks(line: string): Array<{ label: string; value: string }> {
  // A list item's links belong to whatever the item is about. See rule 3.
  if (/^\s*[-*+]\s/.test(line)) return []

  const out: Array<{ label: string; value: string }> = []
  for (const part of line.split('|')) {
    const match = /^\s*([^:]{1,80}?)\s*:\s+(\S+)\s*$/.exec(part)
    if (!match) continue
    const value = match[2].replace(/[.,;)]+$/, '')
    if (!URL_VALUE.test(value) && !EMAIL_VALUE.test(value)) continue
    out.push({ label: match[1].replace(/^[#>*\s]+/, '').trim(), value })
  }
  return out
}

/**
 * Turns one reference document into proposals.
 *
 * A section yields at most one answer of its own, plus a link for every
 * labelled URL inside it. A section that yields neither is reported in
 * `skipped` with the heading it had, so the gap is on screen rather than in
 * nobody's head.
 */
export function extractAssets(doc: SourceDoc): SourceResult {
  const proposals: AssetProposal[] = []
  const skipped: SkippedSection[] = []
  const seen = new Set<string>()

  for (const section of sections(doc.content)) {
    const before = proposals.length
    const body = cleanBody(section.body)

    if (section.heading) {
      const { label, variant } = splitHeading(section.heading)
      const question = classifyQuestion({ label })

      if (question && body) {
        proposals.push({
          kind: kindFor(question.key, body),
          label,
          value: body,
          questionKind: question.key,
          variant,
          source: `${doc.id}#${section.heading}`,
          notes: `From "${doc.title}". Nobody has confirmed it since.`,
        })
      }
    }

    for (const line of body.split('\n')) {
      for (const { label, value } of labelledLinks(line)) {
        // One row per URL. The same link appearing in two documents is one
        // asset, and the first document to name it is the one recorded.
        if (seen.has(value)) continue
        seen.add(value)
        proposals.push({
          kind: EMAIL_VALUE.test(value) ? 'fact' : 'link',
          label,
          value,
          questionKind: classifyQuestion({ label })?.key ?? null,
          variant: null,
          source: `${doc.id}#${section.heading ?? doc.title}:${label}`,
          notes: `From "${doc.title}". Nobody has confirmed it since.`,
        })
      }
    }

    if (section.heading && proposals.length === before) {
      skipped.push({
        heading: section.heading,
        reason: body
          ? 'No canonical question matches this heading, and it holds no labelled links.'
          : 'Empty.',
      })
    }
  }

  return { proposals, skipped }
}

/** Every document at once, in the order given. */
export function extractAll(docs: SourceDoc[]): SourceResult {
  const proposals: AssetProposal[] = []
  const skipped: SkippedSection[] = []
  const seen = new Set<string>()

  for (const doc of docs) {
    const result = extractAssets(doc)
    for (const p of result.proposals) {
      // An address named by two documents is one asset. Prose is not deduped
      // this way: two documents holding a different bio hold two bios, and
      // the EPK's is not the brief's.
      if (isAddress(p.value)) {
        if (seen.has(p.value)) continue
        seen.add(p.value)
      }
      proposals.push(p)
    }
    skipped.push(...result.skipped)
  }

  return { proposals, skipped }
}
