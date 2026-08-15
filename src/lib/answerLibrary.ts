// Selection and harvesting rules for the reusable answer library.
// Pure functions — the DB reads/writes live in the routes and prep run.

import { classifyQuestion, kindByKey, targetLength, type QuestionKind } from './questionKinds'
import type { ProfileFacts } from './answerEngine'

export interface LibraryEntryLike {
  id: number
  questionKey: string
  label: string
  category: string
  content: string
  maxLength: number | null
  pinned?: number | null
}

export interface LibraryMatch {
  entry: LibraryEntryLike
  /** False when the stored answer is longer than the field allows. */
  fits: boolean
  limit: number | null
}

export interface NewLibraryEntry {
  questionKey: string
  label: string
  category: string
  content: string
  maxLength: number | null
  notes?: string
}

export interface FieldLike {
  label: string
  fieldKey?: string
  fieldType?: string
  maxLength?: number | null
  helpText?: string | null
}

/**
 * Picks the stored variant to reuse for a field: the fullest answer that fits
 * the space available. When nothing fits, the shortest is returned with
 * fits=false so the caller can condense it rather than silently overflowing.
 */
export function selectLibraryAnswer(
  field: FieldLike,
  questionKey: string,
  entries: LibraryEntryLike[],
): LibraryMatch | undefined {
  const candidates = entries.filter((e) => e.questionKey === questionKey)
  if (candidates.length === 0) return undefined

  const limit = targetLength(field)
  if (limit === null) {
    const fullest = [...candidates].sort((a, b) => b.content.length - a.content.length)[0]
    return { entry: fullest, fits: true, limit }
  }

  const fitting = candidates
    .filter((e) => e.content.length <= limit)
    .sort((a, b) => b.content.length - a.content.length)

  if (fitting.length > 0) return { entry: fitting[0], fits: true, limit }

  const shortest = [...candidates].sort((a, b) => a.content.length - b.content.length)[0]
  return { entry: shortest, fits: false, limit }
}

/** The kind a field maps to, if any — the join between forms and the library. */
export function fieldKind(field: FieldLike): QuestionKind | undefined {
  return classifyQuestion({
    label: field.label,
    fieldKey: field.fieldKey,
    fieldType: field.fieldType,
    helpText: field.helpText,
  })
}

/**
 * What an approved answer should be stored as. Length-sensitive kinds (bios,
 * pitches) keep the field's limit so short and long variants coexist; the rest
 * are stored once, as the canonical answer.
 */
export function harvestCandidate(
  field: FieldLike & { questionKind?: string | null },
  answer: string,
): NewLibraryEntry | undefined {
  const key = field.questionKind ?? fieldKind(field)?.key
  if (!key) return undefined

  const kind = kindByKey(key)
  if (!kind) return undefined

  const content = answer.trim()
  if (!content) return undefined

  // Volatile per-application answers are never worth storing.
  if (kind.key === 'how_did_you_hear' || kind.key === 'availability') return undefined

  return {
    questionKey: kind.key,
    label: kind.label,
    category: kind.category,
    content,
    maxLength: kind.lengthSensitive ? (field.maxLength ?? null) : null,
  }
}

/**
 * Bootstraps the library from the reference docs so the first application
 * already has something to reuse.
 */
export function seedEntriesFromProfile(facts: ProfileFacts): NewLibraryEntry[] {
  const entries: NewLibraryEntry[] = []
  const add = (
    questionKey: string,
    content: string | undefined,
    maxLength: number | null = null,
  ) => {
    const kind = kindByKey(questionKey)
    if (!kind || !content?.trim()) return
    entries.push({
      questionKey,
      label: kind.label,
      category: kind.category,
      content: content.trim(),
      maxLength,
      notes: 'Seeded from the reference docs',
    })
  }

  add('artist_name', facts.name)
  add('email', facts.email)
  add('hometown', facts.location)
  add('genre', facts.genre)
  add('website', facts.website)
  add('spotify', facts.spotify)
  add('youtube', facts.youtube)
  add('instagram', facts.instagram)
  add('facebook', facts.facebook)
  add('bandcamp', facts.bandcamp)
  add('press_quote', facts.pressQuote)
  add('bio', facts.bio)
  // A short variant only earns its place if it's meaningfully shorter.
  if (facts.shortBio && facts.bio && facts.shortBio.length < facts.bio.length) {
    add('bio', facts.shortBio, 300)
  }

  return entries
}
