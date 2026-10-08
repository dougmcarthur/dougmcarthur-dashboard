/**
 * Answers at hand: the facts an application asks for, ready to copy.
 *
 * An application form asks the same two dozen things in different words, and
 * the answers already live in the artist library. What was missing was the
 * library *where the form is*: the artist left the page they were filling in to
 * find the short bio, the credit that has to run beside a photo, the link, and
 * came back having lost their place. This is the library cut for that moment,
 * one line per answer with a Copy button, grouped by what is being asked.
 *
 * Three decisions shape it, and each is the app's habit rather than a new one:
 *
 *  - **It says what is wrong before the paste, not after.** A press photo with
 *    no credit, a follower count last checked in the spring: both are things a
 *    form would happily accept, which is exactly why they are said here. The
 *    flags come from `assetHealth`, the same check the Artist page uses.
 *  - **It orders by what is asked of this artist.** The question kind of every
 *    field on every application they have opened is already stored, so "asked"
 *    is a count and not a guess. Where there is nothing to count, a fixed order
 *    stands in.
 *  - **It names what it could not offer.** A question their applications ask
 *    and nothing on file answers is listed, with how often it was asked, rather
 *    than left as an absence nobody notices until the form is half done.
 *
 * Pure, like everything in shared/: rows in, a feed out, no clock. `today` is an
 * argument, because whether something is overdue depends on which day the
 * person is looking at it from.
 */

import {
  assetHealth,
  normaliseAssetKind,
  type ArtistAsset,
  type AssetHealth,
} from './artistAssets'
import { plain, platformOf, readGenre } from './epkProfile'
import { wordCount } from './publicEpk'
import { classifyQuestion, kindByKey, QUESTION_KINDS } from './questionKinds'

export type AnswerGroupId =
  | 'story'
  | 'about'
  | 'links'
  | 'photos'
  | 'documents'
  | 'numbers'
  | 'practical'

/** In the order a person reaches for them: the bio is the most asked of all. */
export const ANSWER_GROUPS: ReadonlyArray<{ id: AnswerGroupId; title: string }> = [
  { id: 'story', title: 'Bio and story' },
  { id: 'about', title: 'About you' },
  { id: 'links', title: 'Links and recordings' },
  { id: 'photos', title: 'Press photos' },
  { id: 'documents', title: 'Stage plot and paperwork' },
  { id: 'numbers', title: 'Numbers' },
  { id: 'practical', title: 'Practical details' },
]

export interface AnswerWarning {
  /** `broken` cannot be used as it stands; `overdue` is only worth rechecking. */
  level: 'broken' | 'overdue'
  text: string
}

export interface Answer {
  id: number
  label: string
  /** What goes on the clipboard: clean text, or the address for a link. */
  copy: string
  /** Other things worth copying from the same entry, each named. */
  extras: Array<{ label: string; copy: string }>
  /** One line to recognise it by. Never the whole of a bio. */
  preview: string
  /** Words, for prose a form may put a limit on. Null where a count means nothing. */
  words: number | null
  warning: AnswerWarning | null
  /** Said quietly: not reviewed yet, review coming up. Never counted as a problem. */
  note: string | null
  /** How many fields on this artist's own applications asked this question. */
  asked: number
  isLink: boolean
}

export interface AnswerSection {
  id: AnswerGroupId
  title: string
  answers: Answer[]
}

/** A question the applications ask and nothing on file answers. */
export interface MissingAnswer {
  key: string
  label: string
  asked: number
}

export interface AnswersFeed {
  groups: AnswerSection[]
  missing: MissingAnswer[]
  /** Answers carrying a warning, across every group. */
  needsLook: number
  total: number
}

/** `asked` as the Worker counts it: question kind to the number of fields. */
export type AskedCounts = Record<string, number>

/** How many unanswered questions are named before the rest are left out. */
export const MISSING_SHOWN = 6

// ── Which group an entry belongs to ───────────────────────────────────────────

/** Kinds of fact that are a figure to quote, filed under either spelling. */
const NUMBER_KEYS = new Set(['streaming_stats', 'stat'])

/**
 * The question an entry answers.
 *
 * The stored key when the vocabulary knows it, otherwise whatever its label
 * classifies as: the same function that reads a form field, so an entry filed
 * by hand under "Monthly listeners" is found as the streaming question it is.
 * Null when neither says.
 */
function questionKeyOf(asset: ArtistAsset): string | null {
  if (asset.questionKind && kindByKey(asset.questionKind)) return asset.questionKind
  // Paperwork and pictures are not named by their labels. "Set list, 45
  // minutes" is a document, and the classifier reads "minutes" as a set length:
  // believing it would mark a question answered that nothing on file answers,
  // which is the one mistake this panel exists not to make. A gap hidden is
  // worse than a gap named twice.
  const kind = normaliseAssetKind(asset.kind)
  if (kind === 'document' || kind === 'photo') return null
  return classifyQuestion({ label: asset.label })?.key ?? null
}

/**
 * The question an entry answers for the purposes of counting and ordering.
 *
 * A figure to quote is the streaming question whatever its label says: an
 * "Instagram followers" count would otherwise be filed under Instagram, the
 * link, and borrow that question's count of how often it was asked.
 */
function effectiveKey(asset: ArtistAsset): string | null {
  return groupOf(asset) === 'numbers' ? 'streaming_stats' : questionKeyOf(asset)
}

function groupOf(asset: ArtistAsset): AnswerGroupId {
  switch (normaliseAssetKind(asset.kind)) {
    case 'photo':
      return 'photos'
    case 'document':
      return 'documents'
    case 'audio':
    case 'video':
    case 'link':
      return 'links'
    case 'bio':
      return 'story'
    case 'fact': {
      if (asset.questionKind && NUMBER_KEYS.has(asset.questionKind)) return 'numbers'
      const key = questionKeyOf(asset)
      if (key === 'streaming_stats') return 'numbers'
      switch (key ? kindByKey(key)?.category : undefined) {
        case 'identity':
          return 'about'
        case 'story':
        case 'pitch':
          return 'story'
        case 'links':
          return 'links'
        default:
          return 'practical'
      }
    }
  }
}

/**
 * What a person reaches for first when nothing has been counted yet. Questions
 * not named here follow in the order the vocabulary lists them.
 */
const RANK = [
  'bio', 'one_liner', 'artist_name', 'hometown', 'genre', 'lineup', 'contact_name', 'email', 'phone',
  'website', 'epk', 'spotify', 'youtube', 'instagram', 'facebook', 'bandcamp', 'soundcloud', 'apple_music',
  'set_length', 'tech_requirements', 'streaming_stats', 'previous_performances', 'career_highlights',
  'press_quote', 'influences', 'management', 'fee', 'travel', 'availability',
]
const UNRANKED = RANK.length + QUESTION_KINDS.length

function rankOf(key: string | null): number {
  if (!key) return UNRANKED + 1
  const named = RANK.indexOf(key)
  if (named >= 0) return named
  const listed = QUESTION_KINDS.findIndex((k) => k.key === key)
  return listed >= 0 ? RANK.length + listed : UNRANKED
}

// ── Reading one entry ─────────────────────────────────────────────────────────

/** "(100 words)" on a label is the writer's claim; the count beside it is the fact. */
const DECLARED_LENGTH = /\s*\(\s*(?:about|approx\.?|around|~)?\s*\d+\s*(?:words?|characters?|chars?)[^)]*\)\s*$/i

function addressPreview(value: string): string {
  try {
    const url = new URL(value)
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
    const shown = `${url.hostname.replace(/^www\./, '')}${path}`
    return shown.length > 48 ? `${shown.slice(0, 47)}…` : shown
  } catch {
    return value
  }
}

/** Days as the coarsest unit that is still true, because "75 days" asks for arithmetic. */
function span(days: number): string {
  if (days < 1) return 'less than a day'
  if (days === 1) return '1 day'
  if (days < 60) return `${days} days`
  const months = Math.round(days / 30)
  return months >= 24 ? `${Math.round(months / 12)} years` : `${months} months`
}

function warningOf(health: AssetHealth): AnswerWarning | null {
  if (health.problem) return { level: 'broken', text: health.problem }
  if (health.freshness === 'overdue' && health.daysUntilReview !== null) {
    return {
      level: 'overdue',
      text: `${span(-health.daysUntilReview)} past its review date. Check it before you paste it.`,
    }
  }
  return null
}

function noteOf(health: AssetHealth): string | null {
  if (health.freshness === 'unreviewed') return 'Not reviewed yet.'
  if (health.freshness === 'due_soon' && health.daysUntilReview !== null) {
    return health.daysUntilReview === 0
      ? 'Due for review today.'
      : `Due for review in ${span(health.daysUntilReview)}.`
  }
  return null
}

function read(asset: ArtistAsset, group: AnswerGroupId, key: string | null) {
  const value = (asset.value ?? '').trim()
  const kind = normaliseAssetKind(asset.kind)
  const extras: Answer['extras'] = []

  if (kind === 'photo') {
    if (asset.credit?.trim()) extras.push({ label: 'Credit', copy: asset.credit.trim() })
    return { copy: value, extras, preview: asset.credit?.trim() || addressPreview(value), isLink: true, words: null }
  }

  if (group === 'links' || group === 'documents' || kind === 'link' || kind === 'document') {
    return { copy: value, extras, preview: addressPreview(value), isLink: true, words: null }
  }

  const text = plain(value)

  // The library's name fact is often three lines: the name, what the act is,
  // how long it plays. A form's name box wants the first.
  if (key === 'artist_name') {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length > 1) extras.push({ label: 'All lines', copy: text })
    return { copy: lines[0] ?? text, extras, preview: lines.slice(0, 2).join(' · '), isLink: false, words: null }
  }

  // A genre field in the library is a clause, then the lists that go with it.
  // A genre box wants the clause; the whole of it is one button away.
  if (key === 'genre') {
    const { genre } = readGenre(value)
    if (genre && genre !== text) extras.push({ label: 'Everything', copy: text })
    return { copy: genre ?? text, extras, preview: genre ?? text.replace(/\s+/g, ' '), isLink: false, words: null }
  }

  const flat = text.replace(/\s+/g, ' ')
  return {
    copy: text,
    extras,
    preview: flat.length > 170 ? `${flat.slice(0, 169).replace(/\s+\S*$/, '')}…` : flat,
    isLink: false,
    // Only where a limit is likely. A hometown has no word count worth showing.
    words: group === 'story' ? wordCount(text) : null,
  }
}

// ── The feed ──────────────────────────────────────────────────────────────────

/** Does this entry answer this question, by its key, its label or the site it points at? */
function covers(asset: ArtistAsset, key: string): boolean {
  if (effectiveKey(asset) === key) return true
  return platformOf(asset.value ?? '')?.platform === key
}

export function buildAnswers(input: {
  assets: ArtistAsset[]
  asked: AskedCounts
  today: string
}): AnswersFeed {
  const live = input.assets.filter((a) => !a.archived && a.value && a.value.trim() !== '')

  type Row = { answer: Answer; group: AnswerGroupId; rank: number; words: number; order: number; label: string }
  const rows: Row[] = live.map((asset) => {
    const group = groupOf(asset)
    const key = effectiveKey(asset)
    const health = assetHealth(asset, input.today)
    const shown = read(asset, group, key)
    return {
      group,
      rank: rankOf(key),
      words: shown.words ?? 0,
      order: asset.sortOrder ?? 0,
      label: asset.label,
      answer: {
        id: asset.id,
        label: asset.label.replace(DECLARED_LENGTH, '').trim() || asset.label,
        copy: shown.copy,
        extras: shown.extras,
        preview: shown.preview,
        words: shown.words,
        warning: warningOf(health),
        note: noteOf(health),
        // By the stored key first, which is the one forms were counted under.
        asked: (asset.questionKind ? input.asked[asset.questionKind] : undefined) ?? (key ? input.asked[key] : 0) ?? 0,
        isLink: shown.isLink,
      },
    }
  })

  const groups: AnswerSection[] = ANSWER_GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    answers: rows
      .filter((r) => r.group === g.id)
      .sort(
        (a, b) =>
          // What is asked of this artist, most first. Where nothing is counted
          // the fixed order decides, and the shorter bio sorts before the longer
          // so that the one that fits a limit is the first you reach.
          b.answer.asked - a.answer.asked ||
          a.rank - b.rank ||
          a.words - b.words ||
          a.order - b.order ||
          a.label.localeCompare(b.label),
      )
      .map((r) => r.answer),
  })).filter((g) => g.answers.length > 0)

  const missing: MissingAnswer[] = Object.entries(input.asked)
    .filter(([key, n]) => {
      const kind = kindByKey(key)
      // `adapt` answers name the event they were written for. Nothing on file
      // can answer "why this festival" in advance, so listing it as missing
      // would be a request nobody can meet.
      if (!kind || kind.reuse === 'adapt' || n <= 0) return false
      return !live.some((a) => covers(a, key))
    })
    .map(([key, n]) => ({ key, label: kindByKey(key)!.label, asked: n }))
    .sort((a, b) => b.asked - a.asked || rankOf(a.key) - rankOf(b.key))
    .slice(0, MISSING_SHOWN)

  const answers = groups.flatMap((g) => g.answers)
  return {
    groups,
    missing,
    needsLook: answers.filter((a) => a.warning).length,
    total: answers.length,
  }
}

// ── Finding one ───────────────────────────────────────────────────────────────

/**
 * The feed narrowed by what was typed, and optionally to what needs a look.
 *
 * Every word typed has to be found somewhere in the entry, in any order, so
 * "spotify link" and "link spotify" are the same search. It looks at the name,
 * the group it is filed under and what would be pasted, because a person types
 * what the form calls it, which is often not what the library does.
 */
export function filterAnswers(
  feed: AnswersFeed,
  options: { query: string; needsLookOnly: boolean },
): AnswerSection[] {
  const words = options.query.toLowerCase().split(/\s+/).filter(Boolean)

  return feed.groups
    .map((group) => ({
      ...group,
      answers: group.answers.filter((a) => {
        if (options.needsLookOnly && !a.warning) return false
        if (words.length === 0) return true
        const haystack = `${a.label} ${group.title} ${a.copy} ${a.extras.map((e) => e.label).join(' ')}`.toLowerCase()
        return words.every((w) => haystack.includes(w))
      }),
    }))
    .filter((group) => group.answers.length > 0)
}
