// Daily cron work: open windows that have arrived, prepare applications ahead
// of the ones coming up, and send the reminder emails that are due.

import { eq, and, inArray, isNotNull } from 'drizzle-orm'
import { getDb } from './db'
import { gigOpportunities, taskRuns } from './db/schema'
import { prepareApplication } from './lib/applicationPrep'
import { sendDueReminders } from './lib/notifications'
import { shouldPrepareNow, today, daysBetween } from './lib/submissionWindow'
import type { Env } from './types'

/** Forms fetched + drafted per run, to stay well inside the cron time budget. */
const PREP_PER_RUN = 3
/** Wait this long before retrying a prep run that errored. */
const FAILED_RETRY_DAYS = 3

export interface ScheduledSummary {
  windowsOpened: number
  prepared: number
  prepFailed: number
  remindersSent: number
  remindersFailed: number
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

/** Gigs filed for later whose window has now arrived become actionable. */
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
    .set({ status: 'approved', updatedAt: new Date().toISOString() })
    .where(
      inArray(
        gigOpportunities.id,
        arrived.map((g) => g.id),
      ),
    )

  return arrived.length
}

/** Gigs whose answers should be drafted now, most urgent first. */
export async function prepCandidates(env: Env, todayStr = today()) {
  const db = getDb(env.DB)

  const rows = await db
    .select()
    .from(gigOpportunities)
    .where(
      and(
        inArray(gigOpportunities.status, ['approved', 'awaiting_window']),
        eq(gigOpportunities.loginRequired, 0),
        isNotNull(gigOpportunities.status),
      ),
    )

  return rows
    .filter((g) => g.applicationUrl || g.url)
    .filter((g) => {
      if (g.prepStatus === 'failed') {
        return (
          !g.prepUpdatedAt ||
          daysBetween(g.prepUpdatedAt.slice(0, 10), todayStr) >= FAILED_RETRY_DAYS
        )
      }
      return g.prepStatus === 'queued' || g.prepStatus === 'none' || !g.prepStatus
    })
    .filter((g) =>
      shouldPrepareNow(
        {
          submissionOpensAt: g.submissionOpensAt,
          submissionClosesAt: g.submissionClosesAt,
          deadline: g.deadline,
          loginRequired: g.loginRequired,
          prepStatus: g.prepStatus,
        },
        todayStr,
      ),
    )
    .sort((a, b) => {
      const key = (g: typeof a) => g.submissionOpensAt ?? g.deadline ?? '9999-12-31'
      return key(a).localeCompare(key(b))
    })
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
    remindersSent: 0,
    remindersFailed: 0,
    notes: [],
  }

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

  // 2. Prepare applications for what's coming up
  try {
    const candidates = (await prepCandidates(env, todayStr)).slice(0, PREP_PER_RUN)
    for (const gig of candidates) {
      try {
        const result = await prepareApplication(env, gig.id)
        if (result.status === 'ready') {
          summary.prepared += 1
          summary.notes.push(`${gig.name}: ${result.fieldCount} fields drafted`)
        } else {
          summary.prepFailed += 1
          summary.notes.push(`${gig.name}: ${result.status} — ${result.error ?? 'no detail'}`)
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
        `prepared ${summary.prepared}, unresolved ${summary.prepFailed}`,
        summary.prepared,
      )
    }
  } catch (err) {
    summary.notes.push(`prep run failed: ${err instanceof Error ? err.message : String(err)}`)
    await logRun(env, 'applications.prepare', 'error', String(err))
  }

  // 3. Reminder emails
  try {
    const reminderResult = await sendDueReminders(env, db, todayStr)
    summary.remindersSent = reminderResult.sent
    summary.remindersFailed = reminderResult.failed
    summary.notes.push(...reminderResult.notes)
    if (reminderResult.sent + reminderResult.failed + reminderResult.skipped > 0) {
      await logRun(
        env,
        'reminders.send',
        reminderResult.failed > 0 ? 'error' : 'ok',
        `sent ${reminderResult.sent}, failed ${reminderResult.failed}, skipped ${reminderResult.skipped}`,
        reminderResult.sent,
      )
    }
  } catch (err) {
    summary.notes.push(`reminders failed: ${err instanceof Error ? err.message : String(err)}`)
    await logRun(env, 'reminders.send', 'error', String(err))
  }

  return summary
}
