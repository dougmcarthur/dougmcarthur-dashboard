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

/** Gig statuses the UI offers. Stored values are not constrained to these. */
export type GigStatus = 'pending_review' | 'approved' | 'rejected' | 'submitted' | 'archived'

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
  googleEventId: string | null
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
