/**
 * What Scout keeps of an email you said no to: nothing but the fact you did.
 *
 * The reply scan reads organisers' mail and stores what it matched — sender,
 * subject, a 400-character excerpt, the deciding sentence, what was asked for.
 * That is the point of it while a reply is waiting on you. Once you dismiss
 * one, none of it has a job left: nothing on any screen shows a dismissed
 * reply, and there is no undo. Keeping somebody's email because nobody wrote
 * the line that deletes it is how a scanner ends up holding a mailbox it was
 * never meant to keep — and before the unmatched-mail fix every fetched
 * message was stored, pizza receipts included.
 *
 * **A tombstone stays, and it has to.** `runReplyScan` skips a message whose
 * Gmail id already has a resolution; that is what makes a scan on the cron
 * safe. Delete the row and the next scan finds the message again and proposes
 * it as new. So a dismissed row keeps its id and the decision, and loses every
 * column that says anything about the mail or who sent it.
 *
 * **The tombstone goes too, once nothing can fetch the message.** The scan
 * never looks further back than `MAX_WINDOW_DAYS`; a message older than that
 * cannot come back, so its tombstone has no job and is deleted.
 *
 * Accepted replies keep their content: the reply draft for that gig is
 * composed from the organiser's asks, and the deciding sentence is the record
 * of what they said.
 *
 * Two places apply this, and they must agree, so the values live here:
 * dismissing a reply forgets its content in the same write that records the
 * decision, and the nightly housekeeping sweep catches every dismissed row
 * that still holds some — which on the first run is all of them.
 */

import { and, eq, isNotNull, lt, ne, or } from 'drizzle-orm'
import { getDb } from '../db'
import { gigReplies } from '../db/schema'
import { scoped, type TenantId } from '../db/scope'
import { MAX_WINDOW_DAYS } from './gmailReplies'
import type { Env } from '../types'

/**
 * The columns a dismissed reply loses. `from_address` is NOT NULL, so it is
 * emptied rather than nulled. `match_signals` goes too: it records which of the
 * mail's words and domains the matcher found, which is the mail again.
 */
export const FORGOTTEN_ON_DISMISS = {
  fromAddress: '',
  fromName: null,
  subject: null,
  snippet: null,
  evidence: null,
  matchSignals: null,
  asks: null,
  unrecognisedAsks: null,
} as const

/**
 * Every other column, and why it may stay. A column added to `gig_replies`
 * belongs in one list or the other — test/replyRetention.test.ts fails until
 * it is sorted, because a new column holding mail content would otherwise be
 * kept by default, which is the failure this file exists to prevent.
 */
export const KEPT_ON_DISMISS: Record<string, string> = {
  tenantId: 'Whose decision it was.',
  id: 'The row.',
  gmailMessageId: 'The tombstone itself: how the next scan knows this was already decided.',
  gmailThreadId: "An opaque id Gmail assigns; it names nobody and says nothing about the mail.",
  gigId: 'Scout’s own guess at which gig it was about, now answered no.',
  receivedAt: 'When the tombstone can go: once the scan can no longer reach back that far.',
  inSpam: 'A folder flag.',
  classification: 'Scout’s own reading, one word from a closed list.',
  classConfidence: 'Scout’s own confidence in that reading.',
  proposedStatus: 'A status from Scout’s own pipeline.',
  matchScore: 'A number the matcher produced.',
  matchAmbiguous: 'A flag the matcher produced.',
  resolution: 'The decision.',
  resolvedAt: 'When the decision was made.',
  createdAt: 'When Scout first stored the row.',
}

/** Any content left on a row — what the sweep looks for. */
function holdsContent() {
  return or(
    ne(gigReplies.fromAddress, ''),
    isNotNull(gigReplies.fromName),
    isNotNull(gigReplies.subject),
    isNotNull(gigReplies.snippet),
    isNotNull(gigReplies.evidence),
    isNotNull(gigReplies.matchSignals),
    isNotNull(gigReplies.asks),
    isNotNull(gigReplies.unrecognisedAsks),
  )
}

/**
 * The nightly sweep, for one tenant: forget what dismissed rows still hold,
 * then delete the tombstones nothing can fetch any more.
 */
export async function pruneReplies(
  env: Env,
  tenant: TenantId,
  now = new Date(),
): Promise<{ forgotten: number; deleted: number }> {
  const db = getDb(env.DB)
  const dismissed = eq(gigReplies.resolution, 'dismissed')

  // Counted before writing: the tables are tens of rows, and a housekeeping
  // log that says what it did is worth one read.
  const holding = await db
    .select({ id: gigReplies.id })
    .from(gigReplies)
    .where(scoped(gigReplies, tenant, and(dismissed, holdsContent())))
  if (holding.length > 0) {
    await db
      .update(gigReplies)
      .set(FORGOTTEN_ON_DISMISS)
      .where(scoped(gigReplies, tenant, and(dismissed, holdsContent())))
  }

  const cutoff = new Date(now.getTime() - (MAX_WINDOW_DAYS + 1) * 86_400_000).toISOString()
  const unreachable = await db
    .select({ id: gigReplies.id })
    .from(gigReplies)
    .where(scoped(gigReplies, tenant, and(dismissed, lt(gigReplies.receivedAt, cutoff))))
  if (unreachable.length > 0) {
    await db
      .delete(gigReplies)
      .where(scoped(gigReplies, tenant, and(dismissed, lt(gigReplies.receivedAt, cutoff))))
  }

  return { forgotten: holding.length, deleted: unreachable.length }
}
