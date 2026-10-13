/**
 * What a research agent may record in the shared catalog, and how it becomes an
 * entry.
 *
 * Research is collected once, for every artist, so what it writes is not a gig
 * on anybody's list: it is a fact about a listing. The agent says what exists,
 * tagged with where it is, what music it is for and who may apply, and does
 * **not** judge whether it fits anyone. That judgement is per artist and is made
 * in the Worker (`shared/catalogMatch.ts`), which is what lets research cost the
 * same however many artists there are.
 *
 * The input is flat on purpose. The agent's tool schema has strings, numbers
 * and booleans and no arrays, so a list is a comma-separated string here and is
 * parsed once, in this file, into the JSON the catalog stores. Every field is
 * bounded, because the agent reads pages written by strangers.
 *
 * Pure: no clock and no database.
 */

import { GENRES } from './onboarding'
import { gigCategory, isoDate, type CatalogFacts } from './opportunityCatalog'
import { PROVINCES, regionOf } from './regions'
import { STATE_POINTS } from './regionDistance'

export const CATALOG_TEXT_MAX = {
  name: 200,
  short: 120,
  note: 500,
  url: 2048,
  list: 300,
} as const

/** Entries an agent may add in a trailing day. A broad sweep is a few dozen; this is a runaway. */
export const CATALOG_DAILY_LIMIT = 300

/** The largest fee or payment a listing could plausibly state. */
export const CATALOG_AMOUNT_MAX = 1_000_000

const GENRE_IDS = new Set<string>(GENRES.map((g) => g.id))
const REGION_CODES = new Set<string>([...Object.keys(PROVINCES), ...Object.keys(STATE_POINTS)])

export interface CatalogAgentInput {
  name: string
  type: string
  url: string
  applicationUrl?: string
  organizer?: string
  deadline?: string
  deadlineNote?: string
  opensAt?: string
  location?: string
  country?: string
  feeAmount?: number
  feeCurrency?: string
  paysAmount?: number
  paysCurrency?: string
  /** Comma-separated genre ids from the closed list, e.g. "folk, roots". */
  genres?: string
  /** Comma-separated province or state codes whose residents may apply, e.g. "MB, SK". */
  residentOf?: string
  /** Comma-separated organisations whose members may apply. */
  membership?: string
  minAge?: number
  maxAge?: number
  eligibilityNote?: string
}

/** Comma-separated into a clean list: trimmed, no blanks, no repeats. */
export function splitList(raw: string | undefined | null): string[] {
  return [...new Set((raw ?? '').split(',').map((item) => item.trim()).filter(Boolean))]
}

/** Why a genre list does not fit, or null. The closed list is the point: two agents must mean the same word. */
export function genreProblem(raw: string | undefined): string | null {
  const unknown = splitList(raw).filter((g) => !GENRE_IDS.has(g.toLowerCase()))
  return unknown.length
    ? `Unknown genre ${unknown.map((g) => `"${g}"`).join(', ')}. Use only: ${[...GENRE_IDS].join(', ')}.`
    : null
}

/** Why a residents list does not fit, or null. */
export function residentProblem(raw: string | undefined): string | null {
  const unknown = splitList(raw).filter((r) => !REGION_CODES.has(r.toUpperCase()))
  return unknown.length
    ? `Unknown region ${unknown.map((r) => `"${r}"`).join(', ')}. Use two-letter province or state codes, like MB or TX.`
    : null
}

const clip = (s: string | undefined, max: number): string | null => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

/**
 * The listing facts an agent's input states, as the catalog stores them.
 *
 * Nothing is inferred beyond the place: the region is read from the location,
 * since a place that names one has said where it is. A genre the agent did not
 * tag stays null, which is "no claim" and never "open to anything".
 */
export function factsFromAgent(input: CatalogAgentInput): { facts: CatalogFacts; applicationUrl: string | null } {
  const deadline = isoDate(input.deadline)
  const genres = splitList(input.genres).map((g) => g.toLowerCase())
  const residentOf = splitList(input.residentOf).map((r) => r.toUpperCase())
  const membership = splitList(input.membership).slice(0, 10)

  const eligibility = {
    ...(residentOf.length ? { residentOf } : {}),
    ...(membership.length ? { membership } : {}),
    ...(input.minAge !== undefined ? { minAge: input.minAge } : {}),
    ...(input.maxAge !== undefined ? { maxAge: input.maxAge } : {}),
    ...(clip(input.eligibilityNote, CATALOG_TEXT_MAX.note) ? { notes: clip(input.eligibilityNote, CATALOG_TEXT_MAX.note)! } : {}),
  }

  const fee = typeof input.feeAmount === 'number' && input.feeAmount > 0 ? input.feeAmount : null
  const pays = typeof input.paysAmount === 'number' && input.paysAmount > 0 ? input.paysAmount : null
  const location = clip(input.location, CATALOG_TEXT_MAX.name)

  return {
    applicationUrl: input.applicationUrl?.trim() || null,
    facts: {
      category: gigCategory(input.type),
      name: clip(input.name, 160) ?? 'Untitled',
      organizer: clip(input.organizer, 120),
      kind: clip(input.type, 60),
      url: input.url.trim(),
      deadline,
      // Prose in the deadline field is a fact about the call, kept as a short
      // note only when it was not a date.
      deadlineNote: clip(input.deadlineNote ?? (deadline ? undefined : input.deadline), 80),
      location,
      country: clip(input.country, 20),
      feeAmount: fee,
      feeCurrency: fee !== null ? clip(input.feeCurrency, 3) : null,
      region: regionOf(location)?.code ?? null,
      genres: genres.length ? JSON.stringify(genres) : null,
      eligibility: Object.keys(eligibility).length ? JSON.stringify(eligibility) : null,
      opensAt: isoDate(input.opensAt),
      paysAmount: pays,
      paysCurrency: pays !== null ? clip(input.paysCurrency, 3) : null,
    },
  }
}
