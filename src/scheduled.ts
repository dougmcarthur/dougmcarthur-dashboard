// Daily cron work, in the order that matters:
//
//   1. Open the submission windows that have arrived, and queue their forms.
//   2. Read those forms and prepare answers — application forms are usually
//      only published once submissions open, so this is the first moment the
//      real questions exist.
//   3. Sweep the web for new opportunities (weekly, not daily).
//   4. Send one digest covering everything the run produced.
//
// Because the phases run in that order within a single invocation, a window
// that opens today is read and answered today, and the notification that goes
// out already has answers behind it.

import { eq, and, inArray } from 'drizzle-orm'
import { getDb, type DB } from './db'
import { gigOpportunities, reminders, taskRuns } from './db/schema'
import { prepareApplication } from './lib/applicationPrep'
import { sendDigest } from './lib/notifications'
import { runDiscovery, discoveryDue, type DiscoveredItem } from './lib/discoveryRun'
import {
  shouldPrepareNow,
  isPrepTerminal,
  isPrepRetryDue,
  today,
} from './lib/submissionWindow'
import type { Env } from './types'

/** Forms fetched + drafted per run, to stay well inside the cron time budget. */
const PREP_PER_RUN = 5

export interface ScheduledSummary {
  windowsOpened: number
  prepared: number
  prepFailed: number
  answersReady: number
  discovered: number
  digestSent: boolean
  notes: string[]
}

async function logRun(
  env: Env,
  taskId: string,
  status: 'ok' | 'error',
  summary: string,
  itemsAdded = 0,
): Promise<void> {
  const db = getDb(env.DB)
  await db.insert(taskRuns).values({
    taskId,
    runAt: new Date().toISOString(),
    status,
    summary: summary.slice(0, 500),
    itemsAdded,
  })
}

/**
 * Gigs filed for later whose window has now arrived become actionable, and
 * their forms go straight into the prep queue — this is the moment the real
 * application form is expected to exist.
 */
export async function openArrivedWindows(env: Env, todayStr = today()): Promise<number> {
  const db = getDb(env.DB)

  const waiting = await db
    .select()
    .from(gigOpportunities)
    .where(eq(gigOpportunities.status, 'awaiting_window'))

  const arrived = waiting.filter(
    (g) => g.submissionOpensAt && g.submissionOpensAt.slice(0, 10) <= todayStr,
  )
  if (arrived.length === 0) return 0

  await db
    .update(gigOpportunities)
    .set({
      status: 'approved',
      // Re-queue even if something was prepared speculatively before the
      // window opened — that was a different page.
      prepStatus: 'queued',
      prepAttempts: 0,
      prepError: null,
      updatedAt: new Date().toISOString(),
    })
    .where(
      inArray(
        gigOpportunities.id,
        arrived.map((g) => g.id),
      ),
    )

  return arrived.length
}

/** Gigs whose forms should be read now, the ones you're waiting on first. */
export async function prepCandidates(env: Env, todayStr = today()) {
  const db = getDb(env.DB)

  const rows = await db
    .select()
    .from(gigOpportunities)
    .where(
      and(
        inArray(gigOpportunities.status, ['approved', 'awaiting_window']),
        eq(gigOpportunities.loginRequired, 0),
      ),
    )

  return rows
    .filter((g) => g.applicationUrl || g.url)
    .filter((g) => {
      if (g.prepStatus === 'failed') return isPrepRetryDue(g, todayStr)
      return g.prepStatus === 'queued' || g.prepStatus === 'none' || !g.prepStatus
    })
    .filter((g) => shouldPrepareNow(g, todayStr))
    .sort((a, b) => {
      // Anything you haven't been told about yet goes first.
      const pending = (g: typeof a) => (g.answersNotifiedAt ? 1 : 0)
      if (pending(a) !== pending(b)) return pending(a) - pending(b)
      const key = (g: typeof a) => g.deadline ?? g.submissionClosesAt ?? '9999-12-31'
      return key(a).localeCompare(key(b))
    })
}

/**
 * Raises the "your answers are ready" email once prep has finished — with
 * answers to review, or with the reason the form couldn't be read. Sent once
 * per gig; `answers_notified_at` is the guard.
 */
async function notifyAnswersReady(db: DB, gigId: number, todayStr: string): Promise<void> {
  const ts = new Date().toISOString()
  await db.insert(reminders).values({
    entityType: 'gig',
    entityId: gigId,
    reminderType: 'answers_ready',
    scheduledFor: todayStr,
    status: 'pending',
    channel: 'email',
    createdAt: ts,
  })
  await db
    .update(gigOpportunities)
    .set({ answersNotifiedAt: ts })
    .where(eq(gigOpportunities.id, gigId))
}

export async function runScheduledTasks(
  env: Env,
  todayStr = today(),
): Promise<ScheduledSummary> {
  const db = getDb(env.DB)
  const summary: ScheduledSummary = {
    windowsOpened: 0,
    prepared: 0,
    prepFailed: 0,
    answersReady: 0,
    discovered: 0,
    digestSent: false,
    notes: [],
  }
  const discovered: DiscoveredItem[] = []

  // 1. Windows that have arrived
  try {
    summary.windowsOpened = await openArrivedWindows(env, todayStr)
    if (summary.windowsOpened > 0) {
      await logRun(
        env,
        'windows.open',
        'ok',
        `${summary.windowsOpened} submission window(s) opened`,
        summary.windowsOpened,
      )
    }
  } catch (err) {
    summary.notes.push(`window check failed: ${err instanceof Error ? err.message : String(err)}`)
    await logRun(env, 'windows.open', 'error', String(err))
  }

  // 2. Read the forms that are now live and prepare answers
  try {
    const candidates = (await prepCandidates(env, todayStr)).slice(0, PREP_PER_RUN)
    for (const gig of candidates) {
      try {
        const result = await prepareApplication(env, gig.id)
        if (result.status === 'ready') {
          summary.prepared += 1
          summary.notes.push(`${gig.name}: ${result.fieldCount} fields prepared`)
        } else {
          summary.prepFailed += 1
          summary.notes.push(`${gig.name}: ${result.status} — ${result.error ?? 'no detail'}`)
        }

        // 3. Anything finished — answers or a dead end — is worth an email.
        if (!gig.answersNotifiedAt && isPrepTerminal(result.status, result.attempts)) {
          await notifyAnswersReady(db, gig.id, todayStr)
          summary.answersReady += 1
        }
      } catch (err) {
        summary.prepFailed += 1
        summary.notes.push(
          `${gig.name}: prep threw — ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
    if (candidates.length > 0) {
      await logRun(
        env,
        'applications.prepare',
        summary.prepFailed > 0 && summary.prepared === 0 ? 'error' : 'ok',
        `prepared ${summary.prepared}, unresolved ${summary.prepFailed}, notified ${summary.answersReady}`,
        summary.prepared,
      )
    }
  } catch (err) {
    summary.notes.push(`prep run failed: ${err instanceof Error ? err.message : String(err)}`)
    await logRun(env, 'applications.prepare', 'error', String(err))
  }

  // 4. Sweep for new opportunities — weekly, gated on the last successful run
  try {
    for (const kind of ['gigs', 'sync'] as const) {
      if (!(await discoveryDue(db, kind, todayStr))) continue
      const outcome = await runDiscovery(env, kind)
      if (outcome.error) {
        summary.notes.push(`discovery (${kind}): ${outcome.error}`)
        continue
      }
      discovered.push(...outcome.added)
      summary.discovered += outcome.added.length
      summary.notes.push(
        `discovery (${kind}): ${outcome.added.length} added, ${outcome.rejected.length} filtered, ${outcome.searchCount} searches`,
      )
    }
  } catch (err) {
    summary.notes.push(`discovery failed: ${err instanceof Error ? err.message : String(err)}`)
    await logRun(env, 'discovery', 'error', String(err))
  }

  // 5. One digest covering everything above
  try {
    const digest = await sendDigest(env, db, discovered, todayStr)
    summary.digestSent = digest.sent
    summary.notes.push(...digest.notes)
    if (digest.sent || digest.skipped > 0) {
      await logRun(
        env,
        'digest.send',
        'ok',
        digest.sent
          ? `digest sent covering ${digest.reminderIds.length} item(s) and ${discovered.length} new find(s)`
          : `nothing sent, ${digest.skipped} item(s) left pending`,
        digest.sent ? 1 : 0,
      )
    }
  } catch (err) {
    summary.notes.push(`digest failed: ${err instanceof Error ? err.message : String(err)}`)
    await logRun(env, 'digest.send', 'error', String(err))
  }

  return summary
}
