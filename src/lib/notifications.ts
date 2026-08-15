// One email a day, or none at all.
//
// Everything the run produced — new finds, answers ready to review, forms that
// need doing by hand, deadlines coming up — goes into a single digest. If
// nothing happened, nothing is sent: an email that says "no news" trains you to
// ignore the ones that don't.

import { eq, and, lte, inArray } from 'drizzle-orm'
import type { DB } from '../db'
import { reminders, gigOpportunities, applicationFields } from '../db/schema'
import { sendEmail, gmailSendConfigured } from './gmail'
import { daysBetween, today } from './submissionWindow'
import type { DiscoveredItem } from './discoveryRun'
import type { Env } from '../types'

export const DEFAULT_DASHBOARD_URL = 'https://dashboard.dougmcarthur.net'

export interface DigestGig {
  id: number
  name: string
  type?: string | null
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

export interface DigestInput {
  discovered: DiscoveredItem[]
  answersReady: Array<{ gig: DigestGig; prep: PrepSummary }>
  needsAttention: DigestGig[]
  deadlines: Array<{ gig: DigestGig; days: number | null }>
  dashboardUrl?: string
  todayStr?: string
}

export interface ComposedEmail {
  subject: string
  body: string
}

function gigLink(dashboardUrl: string, id: number): string {
  return `${dashboardUrl.replace(/\/$/, '')}/#gigs/${id}`
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Builds the digest, or returns null when there's nothing worth your attention.
 * The subject leads with the thing most likely to make you open it.
 */
export function buildDigest(input: DigestInput): ComposedEmail | null {
  const {
    discovered,
    answersReady,
    needsAttention,
    deadlines,
    dashboardUrl = DEFAULT_DASHBOARD_URL,
    todayStr = today(),
  } = input

  if (
    discovered.length === 0 &&
    answersReady.length === 0 &&
    needsAttention.length === 0 &&
    deadlines.length === 0
  ) {
    return null
  }

  const headline: string[] = []
  if (answersReady.length) headline.push(`${plural(answersReady.length, 'application')} ready`)
  if (discovered.length) headline.push(`${plural(discovered.length, 'new opportunity', 'new opportunities')}`)
  if (deadlines.length) headline.push(`${plural(deadlines.length, 'deadline')}`)
  if (!headline.length && needsAttention.length) {
    headline.push(`${plural(needsAttention.length, 'application')} needs you`)
  }

  const sections: string[] = []

  // Ready to review first — it's the actionable one.
  if (answersReady.length) {
    sections.push('READY TO REVIEW')
    for (const { gig, prep } of answersReady) {
      const drafted = prep.total - prep.needsInput
      sections.push(
        `• ${gig.name}`,
        `  Submissions are open and the form is answered: ${prep.total} fields, ${drafted} drafted${
          prep.needsInput > 0 ? `, ${prep.needsInput} need you` : ''
        }.`,
        gig.deadline ? `  Deadline ${gig.deadline}.` : '',
        `  ${gigLink(dashboardUrl, gig.id)}`,
        '',
      )
    }
  }

  if (discovered.length) {
    sections.push('NEW OPPORTUNITIES')
    for (const item of discovered) {
      sections.push(
        `• ${item.name}  (fit ${item.fitScore}/5)`,
        item.detail ? `  ${item.detail}` : '',
        `  ${item.url}`,
        item.kind === 'gigs' ? `  Review: ${gigLink(dashboardUrl, item.id)}` : '',
        '',
      )
    }
    sections.push(
      'These are waiting in the review queue — approve the ones worth doing and their answers get prepared when the window opens.',
      '',
    )
  }

  if (needsAttention.length) {
    sections.push('NEEDS DOING BY HAND')
    for (const gig of needsAttention) {
      sections.push(
        `• ${gig.name}`,
        `  ${gig.prepError ?? 'The form could not be read automatically.'}`,
        `  ${gigLink(dashboardUrl, gig.id)}`,
        '',
      )
    }
  }

  if (deadlines.length) {
    sections.push('DEADLINES')
    for (const { gig, days } of deadlines) {
      const when =
        days === null
          ? 'soon'
          : days < 0
            ? `${plural(Math.abs(days), 'day')} ago`
            : days === 0
              ? 'today'
              : `in ${plural(days, 'day')}`
      sections.push(
        `• ${gig.name} — due ${when}${gig.deadline ? ` (${gig.deadline})` : ''}, still ${(gig.status ?? 'approved').replace(/_/g, ' ')}`,
        `  ${gigLink(dashboardUrl, gig.id)}`,
        '',
      )
    }
  }

  const body = [
    `Music HQ — ${todayStr}`,
    '',
    ...sections,
    '—',
    dashboardUrl,
  ]
    .filter((line) => line !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

  return { subject: `Music HQ — ${headline.join(', ')}`, body }
}

export interface DigestResult {
  sent: boolean
  reminderIds: number[]
  skipped: number
  notes: string[]
}

/**
 * Collects everything due, sends one email, and marks the reminders it covered
 * as sent. A reminder whose gig has moved on (submitted, rejected, archived) is
 * dismissed rather than reported.
 */
export async function sendDigest(
  env: Env,
  db: DB,
  discovered: DiscoveredItem[] = [],
  todayStr: string = today(),
): Promise<DigestResult> {
  const result: DigestResult = { sent: false, reminderIds: [], skipped: 0, notes: [] }

  const due = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.status, 'pending'), lte(reminders.scheduledFor, todayStr)))
    .orderBy(reminders.scheduledFor)
    .limit(50)

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

  const answersReady: DigestInput['answersReady'] = []
  const needsAttention: DigestGig[] = []
  const deadlines: DigestInput['deadlines'] = []
  const covered: number[] = []
  const stale: number[] = []

  for (const reminder of due) {
    const gig = gigById.get(reminder.entityId)

    // Moved on — nothing to chase.
    if (
      reminder.entityType === 'gig' &&
      (!gig || ['submitted', 'rejected', 'archived'].includes(gig.status ?? ''))
    ) {
      stale.push(reminder.id)
      continue
    }

    const prep = prepByGig.get(reminder.entityId) ?? { total: 0, needsInput: 0, approved: 0 }

    if (reminder.reminderType === 'answers_ready') {
      if (gig!.prepStatus === 'ready' && prep.total > 0) {
        answersReady.push({ gig: gig as DigestGig, prep })
      } else {
        needsAttention.push(gig as DigestGig)
      }
    } else {
      deadlines.push({
        gig: gig as DigestGig,
        days: gig!.deadline ? daysBetween(todayStr, gig!.deadline) : null,
      })
    }
    covered.push(reminder.id)
  }

  if (stale.length) {
    await db
      .update(reminders)
      .set({ status: 'dismissed' })
      .where(inArray(reminders.id, stale))
    result.skipped += stale.length
  }

  const digest = buildDigest({ discovered, answersReady, needsAttention, deadlines, todayStr })
  if (!digest) return result

  if (!gmailSendConfigured(env)) {
    result.notes.push('Gmail send not configured — digest not sent, items left pending')
    result.skipped += covered.length
    return result
  }

  try {
    await sendEmail(env, { to: env.NOTIFY_EMAIL!, ...digest })
    if (covered.length) {
      await db
        .update(reminders)
        .set({
          status: 'sent',
          sentAt: new Date().toISOString(),
          subject: digest.subject,
          body: digest.body,
          error: null,
        })
        .where(inArray(reminders.id, covered))
    }
    result.sent = true
    result.reminderIds = covered
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result.notes.push(`digest send failed: ${message}`)
    if (covered.length) {
      await db.update(reminders).set({ error: message }).where(inArray(reminders.id, covered))
    }
  }

  return result
}
