// Drafts answers for the individual fields of an application form.
//
// Primary path: Claude, given the reference docs (artist brief, EPK bio,
// writing style guide) as the source of truth, answering field-by-field.
// Fallback path (no ANTHROPIC_API_KEY): deterministic profile matching, so the
// dashboard still fills in the boilerplate fields — name, email, links, bio.

import Anthropic from '@anthropic-ai/sdk'
import type { ParsedField } from './formParser'
import { fieldKind, selectLibraryAnswer, type LibraryEntryLike } from './answerLibrary'
import { kindByKey, type QuestionKind } from './questionKinds'

export interface ReferenceDocInput {
  id: string
  title: string
  content: string
}

export interface ProfileFacts {
  name?: string
  email?: string
  location?: string
  genre?: string
  website?: string
  spotify?: string
  youtube?: string
  instagram?: string
  facebook?: string
  bandcamp?: string
  bio?: string
  shortBio?: string
  pressQuote?: string
}

export interface ArtistProfile {
  text: string
  facts: ProfileFacts
}

export interface DraftedAnswer {
  fieldKey: string
  answer: string
  confidence: 'high' | 'medium' | 'low'
  needsInput: boolean
  note?: string
  source: 'llm' | 'profile' | 'library'
  /** Canonical question kind, when the field was recognised. */
  questionKind?: string | null
  /** The library entry this answer came from or was adapted from. */
  libraryId?: number | null
}

export interface GigContext {
  name: string
  type: string
  organizer?: string | null
  url?: string | null
  deadline?: string | null
  fitRationale?: string | null
}

const MODEL = 'claude-opus-5'
const MAX_PROFILE_CHARS = 60_000

// ── Profile extraction ────────────────────────────────────────────────────────

function section(content: string, heading: RegExp): string | undefined {
  const lines = content.split('\n')
  const start = lines.findIndex((l) => /^#{2,3}\s/.test(l) && heading.test(l.replace(/^#+\s*/, '')))
  if (start === -1) return undefined
  const body: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,3}\s/.test(line) || /^---\s*$/.test(line)) break
    body.push(line)
  }
  const text = body.join('\n').trim()
  return text || undefined
}

function firstSentences(text: string, count: number): string {
  const parts = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g)
  if (!parts) return text.slice(0, 300)
  return parts.slice(0, count).join(' ').trim()
}

function pickUrl(urls: string[], match: RegExp): string | undefined {
  return urls.find((u) => match.test(u))
}

export function buildProfile(docs: ReferenceDocInput[]): ArtistProfile {
  const text = docs
    .map((d) => `# ${d.title}\n\n${d.content}`)
    .join('\n\n---\n\n')
    .slice(0, MAX_PROFILE_CHARS)

  const all = docs.map((d) => d.content).join('\n\n')
  const urls = Array.from(all.matchAll(/https?:\/\/[^\s)\]"'<>]+/g)).map((m) =>
    m[0].replace(/[.,]$/, ''),
  )
  const emails = Array.from(all.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)).map((m) => m[0])

  const bio = section(all, /^bio(graphy)?$/i)
  const nameSection = section(all, /^artist name$/i)
  const genreSection = section(all, /^genre/i)
  const pressQuote = section(all, /^press quote/i)

  const name =
    nameSection?.split('\n').find((l) => l.trim())?.replace(/\*\*/g, '').trim() ||
    docs[0]?.title.split('—')[0].trim()

  const location = (nameSection ?? all.slice(0, 2000)).match(
    /([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)*,\s*[A-Z]{2}(?:,\s*[A-Za-z]+)?)/,
  )?.[1]

  const facts: ProfileFacts = {
    name,
    email: emails.find((e) => /doug@/i.test(e)) ?? emails[0],
    location,
    genre: genreSection?.split('\n').find((l) => l.trim())?.replace(/\*\*/g, '').trim(),
    website: pickUrl(urls, /dougmcarthur\.(net|com|ca)/i) ?? pickUrl(urls, /^https?:\/\/(?!.*(spotify|youtube|youtu\.be|instagram|facebook|bandcamp|apple))/i),
    spotify: pickUrl(urls, /spotify\.com/i),
    youtube: pickUrl(urls, /youtube\.com|youtu\.be/i),
    instagram: pickUrl(urls, /instagram\.com/i),
    facebook: pickUrl(urls, /facebook\.com/i),
    bandcamp: pickUrl(urls, /bandcamp\.com/i),
    bio,
    shortBio: bio ? firstSentences(bio, 2) : undefined,
    pressQuote: pressQuote?.replace(/\s+/g, ' ').trim(),
  }

  return { text, facts }
}

// ── Deterministic fallback ────────────────────────────────────────────────────

interface Rule {
  match: RegExp
  value: (f: ProfileFacts, field: ParsedField) => string | undefined
  confidence?: 'high' | 'medium' | 'low'
}

const RULES: Rule[] = [
  { match: /e-?mail/i, value: (f) => f.email },
  { match: /(artist|band|act|performer|stage|your|full|contact)\s*name|^name$/i, value: (f) => f.name },
  { match: /spotify/i, value: (f) => f.spotify },
  { match: /youtube|video link|live video/i, value: (f) => f.youtube },
  { match: /instagram/i, value: (f) => f.instagram },
  { match: /facebook/i, value: (f) => f.facebook },
  { match: /bandcamp/i, value: (f) => f.bandcamp },
  { match: /website|web site|homepage|url|epk|press kit link/i, value: (f) => f.website },
  { match: /genre|style|category|music type/i, value: (f) => f.genre },
  {
    match: /city|hometown|location|based in|province|state|country|region/i,
    value: (f) => f.location,
  },
  { match: /press quote|review quote|quote|testimonial/i, value: (f) => f.pressQuote },
  {
    match: /bio|about (you|your|the artist)|background|description|artist statement/i,
    value: (f, field) => {
      if (!f.bio) return undefined
      const limit = field.maxLength ?? (field.fieldType === 'textarea' ? 2000 : 300)
      if (limit < 400 && f.shortBio) return f.shortBio.slice(0, limit)
      return f.bio.slice(0, limit)
    },
    confidence: 'medium',
  },
]

const NEEDS_INPUT =
  /upload|attach|file|photo|headshot|mp3|audio|stage plot|tech rider|fee|price|budget|payment|availability|date you|preferred date|how did you hear|referral/i

/** Finds the listed option a profile value actually corresponds to, if any. */
function matchOption(value: string, options: string[]): string | undefined {
  const needle = value.toLowerCase()
  return (
    options.find((o) => o.toLowerCase() === needle) ??
    options.find((o) => needle.includes(o.toLowerCase())) ??
    options.find((o) => o.toLowerCase().includes(needle))
  )
}

export function heuristicAnswers(fields: ParsedField[], profile: ArtistProfile): DraftedAnswer[] {
  return fields.map((field) => {
    const haystack = `${field.label} ${field.fieldKey} ${field.helpText ?? ''}`

    if (field.fieldType === 'file' || NEEDS_INPUT.test(haystack)) {
      return {
        fieldKey: field.fieldKey,
        answer: '',
        confidence: 'low',
        needsInput: true,
        note: 'Needs your input — this one can’t be answered from the reference docs.',
        source: 'profile',
      }
    }

    for (const rule of RULES) {
      if (!rule.match.test(haystack)) continue
      const value = rule.value(profile.facts, field)
      if (!value) continue

      // A choice field can only take one of its own options.
      if (field.options?.length) {
        const choice = matchOption(value, field.options)
        if (!choice) {
          return {
            fieldKey: field.fieldKey,
            answer: '',
            confidence: 'low',
            needsInput: true,
            note: `Pick one of: ${field.options.join(', ')}`,
            source: 'profile',
          }
        }
        return {
          fieldKey: field.fieldKey,
          answer: choice,
          confidence: 'medium',
          needsInput: false,
          source: 'profile',
        }
      }

      return {
        fieldKey: field.fieldKey,
        answer: value,
        confidence: rule.confidence ?? 'high',
        needsInput: false,
        source: 'profile',
      }
    }

    return {
      fieldKey: field.fieldKey,
      answer: '',
      confidence: 'low',
      needsInput: true,
      note: 'No match in the reference docs — draft this one yourself.',
      source: 'profile',
    }
  })
}

// ── Library-first resolution ──────────────────────────────────────────────────

export interface LibraryPass {
  /** Fields answered outright from the library, keyed by field key. */
  resolved: Map<string, DraftedAnswer>
  /** Fields still needing a draft. */
  pending: ParsedField[]
  /** Fields whose stored answer is too long for the space — adapt, don't retype. */
  adapt: Map<string, { entry: LibraryEntryLike; limit: number | null }>
  /** Canonical kind per field, whether or not the library had an answer. */
  kinds: Map<string, string>
}

/**
 * Reuses approved answers before drafting anything. A stored answer that fits is
 * used verbatim — it has already been through review, so re-drafting it would
 * only introduce drift.
 */
export function applyLibrary(fields: ParsedField[], library: LibraryEntryLike[]): LibraryPass {
  const resolved = new Map<string, DraftedAnswer>()
  const adapt = new Map<string, { entry: LibraryEntryLike; limit: number | null }>()
  const kinds = new Map<string, string>()
  const pending: ParsedField[] = []

  for (const field of fields) {
    const kind = fieldKind(field)
    if (kind) kinds.set(field.fieldKey, kind.key)

    if (!kind || library.length === 0) {
      pending.push(field)
      continue
    }

    const match = selectLibraryAnswer(field, kind.key, library)
    if (!match) {
      pending.push(field)
      continue
    }

    // A "why this festival" answer names the festival it was written for.
    // Reuse it as source material, never as the submitted text.
    if (kind.reuse === 'adapt') {
      adapt.set(field.fieldKey, { entry: match.entry, limit: match.limit })
      pending.push(field)
      continue
    }

    if (match.fits) {
      resolved.set(field.fieldKey, {
        fieldKey: field.fieldKey,
        answer: match.entry.content,
        confidence: 'high',
        needsInput: false,
        source: 'library',
        questionKind: kind.key,
        libraryId: match.entry.id,
        note: undefined,
      })
      continue
    }

    // Too long for this form: let the drafting step condense it.
    adapt.set(field.fieldKey, { entry: match.entry, limit: match.limit })
    pending.push(field)
  }

  return { resolved, pending, adapt, kinds }
}

/**
 * Fallback when there's no API key and a stored answer can't be dropped in as-is:
 * offer the text, but say plainly what still needs doing to it.
 */
function useUnadaptedEntry(
  field: ParsedField,
  entry: LibraryEntryLike,
  limit: number | null,
  kind?: QuestionKind,
): DraftedAnswer {
  const needsRetarget = kind?.reuse === 'adapt'
  const tooLong = limit != null && entry.content.length > limit

  const note = needsRetarget
    ? 'Written for a different event — retarget the specifics before submitting.'
    : `Your stored answer is ${entry.content.length} characters and this field allows ${limit} — trim it before submitting.`

  return {
    fieldKey: field.fieldKey,
    answer: entry.content,
    confidence: 'low',
    needsInput: needsRetarget || tooLong,
    source: 'library',
    questionKind: kind?.key ?? null,
    libraryId: entry.id,
    note,
  }
}

// ── Claude-drafted answers ────────────────────────────────────────────────────

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field_key: { type: 'string' },
          answer: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          needs_input: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['field_key', 'answer', 'confidence', 'needs_input', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['answers'],
  additionalProperties: false,
} as const

const SYSTEM_PROMPT = `You prepare festival, showcase, and competition applications for a working musician, drafting each answer ahead of the submission window so it only needs review.

Everything factual comes from the reference docs below. They are the only source of truth: never invent venues, dates, streaming numbers, press coverage, awards, or credits that don't appear there. Where a field asks for something the docs don't cover — an uploaded file, a fee, a specific date, a stage plot — leave the answer empty, set needs_input true, and say in the note exactly what's needed.

Write in the artist's own voice as the style guide describes it, in first person, and answer the question that was actually asked rather than pasting the bio into every box. Respect the field: a short-answer box gets a phrase, a paragraph box gets prose, a select or radio field gets one of its listed options copied verbatim. When a character limit is given, stay under it.

Some answers have already been approved on earlier applications and are listed as the answer library. They are the established wording — match their voice, and never contradict them. Where a field carries an approved answer to adapt, work from that text rather than writing something new: keep its facts and phrasing, cut it to fit a tighter limit, and replace anything specific to the event it was written for with what's true of this one. An answer that names the wrong festival is worse than no answer.

Set confidence to high when the docs answer the field directly, medium when you shaped or condensed them to fit, low when you're extrapolating. Use the note only when the reviewer needs to know something — what you assumed, what's missing, what to verify — and leave it as an empty string otherwise.

Reference docs:

`

function buildUserPrompt(
  gig: GigContext,
  formTitle: string | null,
  fields: ParsedField[],
  library: LibraryEntryLike[] = [],
  adapt: Map<string, { entry: LibraryEntryLike; limit: number | null }> = new Map(),
): string {
  const context = [
    `Opportunity: ${gig.name}`,
    `Type: ${gig.type}`,
    gig.organizer ? `Organiser: ${gig.organizer}` : '',
    gig.deadline ? `Deadline: ${gig.deadline}` : '',
    gig.url ? `Link: ${gig.url}` : '',
    gig.fitRationale ? `Why this is a fit: ${gig.fitRationale}` : '',
    formTitle ? `Form: ${formTitle}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const fieldList = fields.map((f) => {
    const adapted = adapt.get(f.fieldKey)
    return {
      field_key: f.fieldKey,
      label: f.label,
      type: f.fieldType,
      required: f.required,
      max_length: f.maxLength ?? null,
      options: f.options ?? null,
      help_text: f.helpText ?? null,
      ...(adapted
        ? {
            approved_answer_to_adapt: adapted.entry.content,
            adapt_to_length: adapted.limit,
          }
        : {}),
    }
  })

  const librarySection = library.length
    ? `\nAnswer library — already approved on earlier applications:\n\n${JSON.stringify(
        library.map((e) => ({
          question: e.label,
          written_for_length: e.maxLength ?? null,
          content: e.content,
        })),
        null,
        2,
      )}\n`
    : ''

  return `${context}
${librarySection}
These are the fields still needing an answer. Return one answer per field, using the exact field_key given.

${JSON.stringify(fieldList, null, 2)}`
}

export async function llmAnswers(
  apiKey: string,
  gig: GigContext,
  formTitle: string | null,
  fields: ParsedField[],
  profile: ArtistProfile,
  library: LibraryEntryLike[] = [],
  adapt: Map<string, { entry: LibraryEntryLike; limit: number | null }> = new Map(),
): Promise<DraftedAnswer[]> {
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16_000,
    system: SYSTEM_PROMPT + profile.text,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: ANSWER_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [
      { role: 'user', content: buildUserPrompt(gig, formTitle, fields, library, adapt) },
    ],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to draft answers for this form')
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const parsed = JSON.parse(text) as {
    answers: Array<{
      field_key: string
      answer: string
      confidence: 'high' | 'medium' | 'low'
      needs_input: boolean
      note?: string
    }>
  }

  const byKey = new Map(parsed.answers.map((a) => [a.field_key, a]))

  // Anchor on the parsed fields so a field the model skipped still gets a row.
  return fields.map((field) => {
    const adapted = adapt.get(field.fieldKey)
    const a = byKey.get(field.fieldKey)
    if (!a) {
      return {
        fieldKey: field.fieldKey,
        answer: '',
        confidence: 'low' as const,
        needsInput: true,
        note: 'No draft was returned for this field.',
        source: 'llm' as const,
      }
    }
    return {
      fieldKey: field.fieldKey,
      answer: a.answer ?? '',
      confidence: a.confidence ?? 'medium',
      needsInput: Boolean(a.needs_input) || !a.answer,
      note:
        a.note ||
        (adapted ? `Adapted from your stored “${adapted.entry.label}” answer.` : undefined),
      source: 'llm' as const,
      libraryId: adapted?.entry.id ?? null,
    }
  })
}

export interface DraftRun {
  answers: DraftedAnswer[]
  usedLlm: boolean
  /** How many fields were answered outright from the library. */
  libraryHits: number
  llmError?: string
}

/**
 * Resolves every field: approved answers from the library first, a draft for
 * whatever is left. Answers come back in the order the fields were parsed.
 */
export async function draftAnswers(
  apiKey: string | undefined,
  gig: GigContext,
  formTitle: string | null,
  fields: ParsedField[],
  profile: ArtistProfile,
  library: LibraryEntryLike[] = [],
): Promise<DraftRun> {
  const { resolved, pending, adapt, kinds } = applyLibrary(fields, library)

  const withKinds = (answers: DraftedAnswer[]): DraftedAnswer[] =>
    answers.map((a) => ({ ...a, questionKind: a.questionKind ?? kinds.get(a.fieldKey) ?? null }))

  const collect = (drafted: DraftedAnswer[]): DraftedAnswer[] => {
    const byKey = new Map(withKinds(drafted).map((a) => [a.fieldKey, a]))
    return fields.map((f) => resolved.get(f.fieldKey) ?? byKey.get(f.fieldKey)!).filter(Boolean)
  }

  if (pending.length === 0) {
    return {
      answers: withKinds([...resolved.values()]),
      usedLlm: false,
      libraryHits: resolved.size,
    }
  }

  if (apiKey) {
    try {
      const drafted = await llmAnswers(apiKey, gig, formTitle, pending, profile, library, adapt)
      return { answers: collect(drafted), usedLlm: true, libraryHits: resolved.size }
    } catch (err) {
      // A drafting failure shouldn't lose the parsed form — fall back so the
      // library answers and boilerplate fields still land, and the rest is flagged.
      const fallback = heuristicAnswers(pending, profile).map((a) => {
        const adapted = adapt.get(a.fieldKey)
        const field = pending.find((f) => f.fieldKey === a.fieldKey)!
        const kind = kinds.get(a.fieldKey)
        return adapted
          ? useUnadaptedEntry(field, adapted.entry, adapted.limit, kind ? kindByKey(kind) : undefined)
          : a
      })
      return {
        answers: collect(fallback),
        usedLlm: false,
        libraryHits: resolved.size,
        llmError: err instanceof Error ? err.message : String(err),
      }
    }
  }

  const fallback = heuristicAnswers(pending, profile).map((a) => {
    const adapted = adapt.get(a.fieldKey)
    const field = pending.find((f) => f.fieldKey === a.fieldKey)!
    const kind = kinds.get(a.fieldKey)
    return adapted
      ? useUnadaptedEntry(field, adapted.entry, adapted.limit, kind ? kindByKey(kind) : undefined)
      : a
  })
  return { answers: collect(fallback), usedLlm: false, libraryHits: resolved.size }
}
