// Composes and sends the reminder emails: window opening soon, window open
// today, and the pre-deadline nudge. Composition is pure so the wording can be
// tested and previewed without sending anything.

import { eq, and, lte, inArray } from 'drizzle-orm'
import type { DB } from '../db'
import { reminders, gigOpportunities, applicationFields } from '../db/schema'
import { sendEmail, gmailSendConfigured } from './gmail'
import { daysBetween, today } from './submissionWindow'
import type { Env } from '../types'

export const DEFAULT_DASHBOARD_URL = 'https://dashboard.dougmcarthur.net'

export interface ReminderGig {
  id: number
  name: string
  type: string
  organizer?: string | null
  status?: string | null
  deadline?: string | null
  submissionOpensAt?: string | null
  applicationUrl?: string | null
  url?: string | null
  prepStatus?: string | null
  prepError?: string | null
}

export interface PrepSummary {
  total: number
  needsInput: number
  approved: number
}

export interface ComposedEmail {
  subject: string
  body: string
}

function prepLine(gig: ReminderGig, prep: PrepSummary): string {
  switch (gig.prepStatus) {
    case 'ready': {
      const ready = prep.total - prep.needsInput
      const parts = [`${prep.total} fields drafted`, `${ready} ready to review`]
      if (prep.needsInput > 0) parts.push(`${prep.needsInput} still need you`)
      if (prep.approved > 0) parts.push(`${prep.approved} already approved`)
      return `Your answers are prepared — ${parts.join(', ')}.`
    }
    case 'blocked':
      return `Answers aren't prepared: ${gig.prepError ?? 'the form could not be read automatically.'}`
    case 'failed':
      return `Prep failed last time: ${gig.prepError ?? 'unknown error'}. You can re-run it from the dashboard.`
    case 'queued':
      return 'Answers are queued to be prepared and should be ready shortly.'
    default:
      return 'No answers have been prepared for this one yet.'
  }
}

export function composeReminderEmail(
  reminderType: string,
  gig: ReminderGig,
  prep: PrepSummary,
  dashboardUrl: string = DEFAULT_DASHBOARD_URL,
  todayStr: string = today(),
): ComposedEmail {
  const link = `${dashboardUrl.replace(/\/$/, '')}/#gigs/${gig.id}`
  const formLink = gig.applicationUrl || gig.url
  const tail = [
    '',
    `Review and edit the answers: ${link}`,
    formLink ? `Application form: ${formLink}` : '',
    '',
    '— Music HQ',
  ]
    .filter((l) => l !== null)
    .join('\n')

  if (reminderType === 'window_opens') {
    return {
      subject: `Submissions open today — ${gig.name}`,
      body: [
        `The submission window for ${gig.name} opens today${gig.submissionOpensAt ? ` (${gig.submissionOpensAt})` : ''}.`,
        '',
        prepLine(gig, prep),
        gig.deadline ? `\nDeadline: ${gig.deadline}.` : '',
        tail,
      ].join('\n'),
    }
  }

  if (reminderType === 'window_soon') {
    const days = gig.submissionOpensAt ? daysBetween(todayStr, gig.submissionOpensAt) : null
    const when = days === null ? 'soon' : days <= 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`
    return {
      subject: `Submissions open ${when} — ${gig.name}`,
      body: [
        `${gig.name} opens for submissions ${when}${gig.submissionOpensAt ? ` (${gig.submissionOpensAt})` : ''}.`,
        '',
        prepLine(gig, prep),
        '',
        'Reviewing now means submitting is a paste-and-send job on the day.',
        tail,
      ].join('\n'),
    }
  }

  // pre_deadline
  const days = gig.deadline ? daysBetween(todayStr, gig.deadline) : null
  const when =
    days === null
      ? 'soon'
      : days < 0
        ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
        : days === 0
          ? 'today'
          : `in ${days} day${days === 1 ? '' : 's'}`

  return {
    subject:
      days !== null && days < 0
        ? `Deadline passed ${when} — ${gig.name}`
        : `Deadline ${when} — ${gig.name}`,
    body: [
      `${gig.name}${gig.organizer ? ` (${gig.organizer})` : ''} is due ${when}${gig.deadline ? ` — ${gig.deadline}` : ''}, and it's still marked ${(gig.status ?? 'approved').replace(/_/g, ' ')}.`,
      '',
      prepLine(gig, prep),
      tail,
    ].join('\n'),
  }
}

export interface ReminderRunResult {
  sent: number
  failed: number
  skipped: number
  notes: string[]
}

/** Sends every pending reminder whose date has arrived, once. */
export async function sendDueReminders(
  env: Env,
  db: DB,
  todayStr: string = today(),
): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { sent: 0, failed: 0, skipped: 0, notes: [] }

  const due = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.status, 'pending'), lte(reminders.scheduledFor, todayStr)))
    .orderBy(reminders.scheduledFor)
    .limit(25)

  if (due.length === 0) return result

  if (!gmailSendConfigured(env)) {
    result.skipped = due.length
    result.notes.push('Gmail send not configured — reminders left pending')
    return result
  }

  const gigIds = Array.from(
    new Set(due.filter((r) => r.entityType === 'gig').map((r) => r.entityId)),
  )
  const gigs = gigIds.length
    ? await db.select().from(gigOpportunities).where(inArray(gigOpportunities.id, gigIds))
    : []
  const gigById = new Map(gigs.map((g) => [g.id, g]))

  const fields = gigIds.length
    ? await db.select().from(applicationFields).where(inArray(applicationFields.gigId, gigIds))
    : []

  const prepByGig = new Map<number, PrepSummary>()
  for (const f of fields) {
    const summary = prepByGig.get(f.gigId) ?? { total: 0, needsInput: 0, approved: 0 }
    summary.total += 1
    if (f.needsInput && !f.answer) summary.needsInput += 1
    if (f.approved) summary.approved += 1
    prepByGig.set(f.gigId, summary)
  }

  const dashboardUrl = DEFAULT_DASHBOARD_URL

  for (const reminder of due) {
    const gig = gigById.get(reminder.entityId)

    // A gig that's been submitted, rejected, or archived doesn't need chasing.
    if (
      reminder.entityType === 'gig' &&
      (!gig || ['submitted', 'rejected', 'archived'].includes(gig.status ?? ''))
    ) {
      await db
        .update(reminders)
        .set({ status: 'dismissed' })
        .where(eq(reminders.id, reminder.id))
      result.skipped += 1
      continue
    }

    const prep = prepByGig.get(reminder.entityId) ?? { total: 0, needsInput: 0, approved: 0 }
    const email = composeReminderEmail(
      reminder.reminderType,
      gig as ReminderGig,
      prep,
      dashboardUrl,
      todayStr,
    )

    try {
      await sendEmail(env, { to: env.NOTIFY_EMAIL!, ...email })
      await db
        .update(reminders)
        .set({
          status: 'sent',
          sentAt: new Date().toISOString(),
          subject: email.subject,
          body: email.body,
          error: null,
        })
        .where(eq(reminders.id, reminder.id))
      result.sent += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db.update(reminders).set({ error: message }).where(eq(reminders.id, reminder.id))
      result.failed += 1
      result.notes.push(`${gig?.name ?? reminder.entityId}: ${message}`)
    }
  }

  return result
}
