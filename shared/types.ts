/**
 * Wire types — the shapes the API sends over the wire, shared by the Worker
 * and the frontend so neither can drift from the other.
 *
 * These are deliberately not the Drizzle row types. Drizzle describes what the
 * columns permit; this describes what a client can rely on receiving.
 *
 * Note `status: string` rather than a union. The union below is what the app
 * *offers* in its pickers, but production rows carry values outside it —
 * `sync_targets` alone holds `sent`, `approved` and `rejected`, none of which
 * are in `SyncStatus`. Typing the field as a union would be a claim the data
 * does not support. See docs/notes-field-audit.md.
 */

// The gig pipeline's vocabulary lives in ./gigStatus, with its phases, its
// legacy mapping and the rule that a status must say *who* decided.
export type { GigStatus } from './gigStatus'

/** Sync statuses the UI offers. Stored values are not constrained to these. */
export type SyncStatus = 'draft_ready' | 'pitched' | 'confirmed' | 'declined' | 'archived'

export interface GigOpportunity {
  id: number
  name: string
  type: string
  organizer: string | null
  submissionMethod: 'email' | 'portal' | 'form' | null
  audienceSize: number | null
  genreFitScore: number | null
  /** ISO date. Legacy rows may still hold prose — see migration 0003. */
  deadline: string | null
  /** The qualifier that used to be crammed into `deadline` ("rolling intake"). */
  deadlineNote: string | null
  /** ISO date a submission window opens, when that differs from when it closes. */
  opensAt: string | null
  feeAmount: number | null
  feeCurrency: string | null
  fee: string | null // legacy
  paid: number | null
  fitNotes: string | null // legacy
  fitRationale: string | null
  url: string | null
  status: string
  /** The pre-rename value, where there was one. See migration 0008. */
  legacyStatus?: string | null
  /**
   * ISO datetime the application went out. Null on rows that reached the
   * submitted phase before migration 0010 — never backfilled, because
   * `updated_at` would have been a guess. See `submissionSilence`.
   */
  submittedAt?: string | null
  /**
   * Where the application form lives, when that is not `url`. Written by the
   * form reader and settable by hand — see migration 0011.
   */
  applicationUrl?: string | null
  /** unread | ready | blocked | failed. Whether the form has been read. */
  prepStatus?: string | null
  prepCheckedAt?: string | null
  /** Why it could not be read, in a sentence. */
  prepNote?: string | null
  /** ISO datetime you are actually on stage. Only set once `booked`. */
  performanceStart?: string | null
  performanceEnd?: string | null
  /** Calendar id for the "apply by" deadline reminder. */
  googleEventId: string | null
  /** Calendar id for the "applications open" reminder. */
  opensEventId?: string | null
  /** Calendar id for the performance itself. */
  showEventId?: string | null
  /** ISO date this row comes back into the queue on its own. */
  snoozedUntil: string | null
  /** When the snooze was set; a later `updatedAt` wakes it. See migration 0004. */
  snoozedAt: string | null
  discoveredAt: string
  updatedAt: string
}

export interface SyncTarget {
  id: number
  name: string
  agencyType: string | null
  contactEmail: string | null
  contactRole: string | null
  confirmationMethod: string | null
  notes: string | null
  pitchDraft: string | null
  pitchSent: string | null
  status: string
  /** ISO date this row comes back into the queue on its own. */
  snoozedUntil: string | null
  /** When the snooze was set; a later `updatedAt` wakes it. See migration 0004. */
  snoozedAt: string | null
  discoveredAt: string
  updatedAt: string
  reconciledAt: string | null
}

export interface PromoDraft {
  id: number
  month: string
  title: string
  content: string
  status: string
  createdAt: string
}
