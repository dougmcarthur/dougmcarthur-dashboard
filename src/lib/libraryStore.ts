// D1-backed helpers for the answer library, shared by the library routes and
// the approve-a-field path. The matching rules themselves live in
// answerLibrary.ts (pure); this file only reads and writes.

import { eq, and, isNull } from 'drizzle-orm'
import type { DB } from '../db'
import { answerLibrary, applicationFields } from '../db/schema'
import { harvestCandidate, type NewLibraryEntry } from './answerLibrary'
import type { ApplicationField, AnswerLibraryEntry } from '../db/schema'

/** The row occupying a (question kind, length variant) slot, if any. */
export async function findVariant(
  db: DB,
  questionKey: string,
  maxLength: number | null,
): Promise<AnswerLibraryEntry | undefined> {
  return db
    .select()
    .from(answerLibrary)
    .where(
      and(
        eq(answerLibrary.questionKey, questionKey),
        maxLength == null ? isNull(answerLibrary.maxLength) : eq(answerLibrary.maxLength, maxLength),
      ),
    )
    .get()
}

export async function insertEntry(
  db: DB,
  entry: NewLibraryEntry,
  sourceGigId?: number | null,
): Promise<AnswerLibraryEntry> {
  const ts = new Date().toISOString()
  const rows = await db
    .insert(answerLibrary)
    .values({
      questionKey: entry.questionKey,
      label: entry.label,
      category: entry.category,
      content: entry.content,
      maxLength: entry.maxLength ?? null,
      notes: entry.notes ?? null,
      pinned: 0,
      usageCount: 0,
      sourceGigId: sourceGigId ?? null,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
  return rows[0]
}

export type HarvestAction = 'created' | 'linked' | 'conflict' | 'skipped'

export interface HarvestResult {
  action: HarvestAction
  entry?: AnswerLibraryEntry
}

/**
 * Files an approved answer in the library. Only ever fills an empty slot —
 * an existing entry is never overwritten behind your back; that surfaces as a
 * conflict for you to resolve on the field itself.
 */
export async function harvestApprovedField(
  db: DB,
  field: ApplicationField,
): Promise<HarvestResult> {
  const answer = (field.answer ?? field.draftAnswer ?? '').trim()
  const candidate = harvestCandidate(
    {
      label: field.label,
      fieldKey: field.fieldKey,
      fieldType: field.fieldType,
      maxLength: field.maxLength,
      helpText: field.helpText,
      questionKind: field.questionKind,
    },
    answer,
  )
  if (!candidate) return { action: 'skipped' }

  const existing = await findVariant(db, candidate.questionKey, candidate.maxLength)

  if (existing) {
    if (existing.content.trim() === candidate.content) {
      // Same text — just record where it came from.
      if (field.libraryId !== existing.id) {
        await db
          .update(applicationFields)
          .set({ libraryId: existing.id, questionKind: candidate.questionKey })
          .where(eq(applicationFields.id, field.id))
      }
      return { action: 'linked', entry: existing }
    }
    return { action: 'conflict', entry: existing }
  }

  const entry = await insertEntry(db, candidate, field.gigId)
  await db
    .update(applicationFields)
    .set({ libraryId: entry.id, questionKind: candidate.questionKey })
    .where(eq(applicationFields.id, field.id))

  return { action: 'created', entry }
}
