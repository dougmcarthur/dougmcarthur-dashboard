/**
 * Documents a person has to look at: a stage plot or tech rider whose words
 * are drawn rather than stored as text.
 *
 * The artist's own Manitoba Music stage plot is the example that made this: a
 * PDF from an online plot designer in which every word, the input list and the
 * notes included, is drawn as shapes, so a text extractor returns nothing. A
 * model that can look at the page reads it fine, and the research routine
 * already is one, on the artist's Claude plan rather than per-token API credit.
 * So the routine reads the file and files a transcription, and Scout treats
 * that transcription the way it treats any other document: as a clue source
 * the stage-plot survey quotes and the artist confirms.
 *
 * A reading is a suggestion's source, never an answer. Nothing here writes to
 * the plot, and the text is shown with where it came from.
 *
 * Pure: no database, no clock.
 */

/** Labels worth reading: what a sound tech is sent. Closed, like the clue vocabularies. */
const TECH_DOCUMENT = /\bstage[\s-]?plot\b|\btech(?:nical)?[\s-]?rider\b|\binput[\s-]?list\b|\bbackline\b|\btech(?:nical)?[\s-]?spec/i

export const READING_MAX = 6000
export const READINGS_MAX = 20
export const READINGS_KEY = 'documentReadings'

export interface DocumentReading {
  assetId: number
  label: string
  /** The file that was read. A different address later means a new file to read. */
  url: string
  text: string
  readAt: string
}

/** Whether a library document is one the reader should look at. */
export function wantsReading(asset: { kind: string; label: string; value: string | null; archived?: number | null }): boolean {
  if (asset.kind !== 'document' || asset.archived) return false
  if (!asset.value || !/^https:\/\//i.test(asset.value.trim())) return false
  return TECH_DOCUMENT.test(asset.label)
}

/** The stored readings, keeping only well-formed entries. */
export function parseReadings(raw: string | null | undefined): DocumentReading[] {
  if (!raw) return []
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(v)) return []
  return v
    .filter((r): r is DocumentReading => {
      const o = r as Record<string, unknown>
      return (
        !!o &&
        Number.isInteger(o.assetId) &&
        typeof o.label === 'string' &&
        typeof o.url === 'string' &&
        typeof o.text === 'string' &&
        typeof o.readAt === 'string'
      )
    })
    .slice(0, READINGS_MAX)
}

/** Documents still to read: wanted, and not read at their current address. */
export function pendingDocuments<T extends { id: number; kind: string; label: string; value: string | null; archived?: number | null }>(
  assets: T[],
  readings: DocumentReading[],
): Array<{ assetId: number; label: string; url: string }> {
  return assets
    .filter(wantsReading)
    .filter((a) => !readings.some((r) => r.assetId === a.id && r.url === a.value!.trim()))
    .map((a) => ({ assetId: a.id, label: a.label, url: a.value!.trim() }))
}

/** Add or replace one asset's reading, newest first, within the cap. */
export function withReading(readings: DocumentReading[], next: DocumentReading): DocumentReading[] {
  return [next, ...readings.filter((r) => r.assetId !== next.assetId)].slice(0, READINGS_MAX)
}
