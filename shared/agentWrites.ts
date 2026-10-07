/**
 * How much, and what, an issued agent token may write.
 *
 * `agentRoutes.ts` says which doors the token opens. This is the other half:
 * what it may carry through them. The routines that hold a token are Claude Code
 * sessions with a shell, reading pages written by strangers, and a session that
 * a page has talked round does not have to go through `cli.ts` — it can send
 * the route any body the route accepts. A route written for the artist's own
 * form accepts a lot: a gig already `booked` with show dates (which the nightly
 * reconcile would put on the calendar), a text field of any length, a thousand
 * rows. None of that is a thing research files, so the Worker refuses it.
 *
 * Pure: no clock, no database. `now` is an argument and the rows to compare
 * against are handed in.
 */

import { normaliseUrl, slug } from './opportunityCatalog'

export type AgentWriteKind = 'gig' | 'sync' | 'promo' | 'taskRun'

/**
 * Field ceilings. Generous next to anything the agents write — a gig row
 * averages 1.8 KB and a pitch is 150 words — so a limit hit is a runaway or an
 * attack, not a long week. `pitchDraft` is the one to be careful with: the
 * prompt asks for 150 words and the tool nudges at 190, but a hard rejection
 * would lose a draft over an encoding limit, so the ceiling sits far above it.
 */
export const AGENT_TEXT_MAX = {
  name: 200,
  short: 120,
  date: 40,
  note: 500,
  url: 2048,
  email: 254,
  prose: 8000,
  pitch: 10_000,
  summary: 4000,
} as const

/** The largest fee a listing could plausibly state. */
export const AGENT_FEE_MAX = 1_000_000

/**
 * Rows a token may add to a tenant in a trailing day.
 *
 * Sized against what the agents actually do — the gig sweep files a handful a
 * week, the sync agent three a run, the promo agent three a month, and each
 * posts one run log — with room for a first run against an empty account. The
 * count is the tenant's rows of that kind, not just the token's, because rows
 * carry no record of who filed them; a person adding sixty gigs in a day to
 * their own account would hold the agent off until tomorrow, which costs less
 * than it sounds.
 */
export const AGENT_DAILY_LIMITS: Record<AgentWriteKind, number> = {
  gig: 60,
  sync: 25,
  promo: 12,
  taskRun: 30,
}

export const AGENT_WINDOW_MS = 24 * 60 * 60 * 1000

/** The ISO instant a trailing day began, for comparing against stored stamps. */
export function windowStart(now: Date): string {
  return new Date(now.getTime() - AGENT_WINDOW_MS).toISOString()
}

export function overDailyLimit(kind: AgentWriteKind, rowsInWindow: number): boolean {
  return rowsInWindow >= AGENT_DAILY_LIMITS[kind]
}

export interface KnownGig {
  id: number
  name: string
  url: string | null
  applicationUrl: string | null
}

export interface KnownSyncTarget {
  id: number
  name: string
  contactEmail: string | null
}

/**
 * A page address worth matching on: one with a path and no query.
 *
 * `normaliseUrl` drops the query and keeps only host and path, so two listings
 * that differ by `?id=` would otherwise read as one. And a bare host is not a
 * listing: two programmes announced from the same funder's home page are two
 * opportunities.
 */
function pageKey(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    if (new URL(raw.trim()).search) return null
  } catch {
    return null
  }
  const key = normaliseUrl(raw)
  return key && key.includes('/') ? key : null
}

/**
 * The gig already on file that this one repeats, if any.
 *
 * By name, and by the page it sits on. The prompt asks the agent to compare
 * against `list_existing_gigs` "under any spelling", which is a judgement made
 * by a model reading a list; this is the same question asked of the data, and
 * it is the one that still answers when two runs overlap or a model drifts.
 * Deliberately narrower than "similar": a false match drops a real find.
 */
export function duplicateGig(
  incoming: { name: string; url?: string | null; applicationUrl?: string | null },
  known: KnownGig[],
): KnownGig | null {
  const name = slug(incoming.name)
  const pages = [pageKey(incoming.url), pageKey(incoming.applicationUrl)].filter((k): k is string => k !== null)
  for (const row of known) {
    if (name && slug(row.name) === name) return row
    if (pages.length) {
      const theirs = [pageKey(row.url), pageKey(row.applicationUrl)]
      if (theirs.some((page) => page !== null && pages.includes(page))) return row
    }
  }
  return null
}

/** The sync target already on file: the same name, or the same contact address. */
export function duplicateSyncTarget(
  incoming: { name: string; contactEmail?: string | null },
  known: KnownSyncTarget[],
): KnownSyncTarget | null {
  const name = slug(incoming.name)
  const email = incoming.contactEmail?.trim().toLowerCase() || null
  for (const row of known) {
    if (name && slug(row.name) === name) return row
    if (email && row.contactEmail?.trim().toLowerCase() === email) return row
  }
  return null
}
