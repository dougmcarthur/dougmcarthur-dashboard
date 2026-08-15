// Runs a discovery sweep and writes what survives the gate into the review
// queues. Kept separate from discovery.ts so the matching and gating rules stay
// pure and testable, and the D1 work lives in one place.

import { desc, eq, and } from 'drizzle-orm'
import { getDb, type DB } from '../db'
import { gigOpportunities, syncTargets, referenceDocs, taskRuns } from '../db/schema'
import { buildProfile } from './answerEngine'
import {
  discover,
  gateCandidates,
  type DiscoveryKind,
  type GigCandidate,
  type SyncCandidate,
  type ExistingRow,
} from './discovery'
import { daysBetween, today } from './submissionWindow'
import type { Env } from '../types'

/** A sweep this often is plenty — festival calendars don't move daily. */
export const DISCOVERY_INTERVAL_DAYS = 7

export interface DiscoveredItem {
  id: number
  name: string
  kind: DiscoveryKind
  detail: string
  url: string
  fitScore: number
}

export interface DiscoveryOutcome {
  kind: DiscoveryKind
  added: DiscoveredItem[]
  rejected: Array<{ name: string; reason: string }>
  searchCount: number
  error?: string
}

const TASK_ID: Record<DiscoveryKind, string> = {
  gigs: 'discovery.gigs',
  sync: 'discovery.sync',
}

/**
 * Has enough time passed since the last sweep? Checked against task_runs rather
 * than a second cron trigger — one daily cron stays easier to reason about, and
 * the free plan only allows five per account.
 */
export async function discoveryDue(
  db: DB,
  kind: DiscoveryKind,
  todayStr = today(),
  intervalDays = DISCOVERY_INTERVAL_DAYS,
): Promise<boolean> {
  const last = await db
    .select()
    .from(taskRuns)
    .where(and(eq(taskRuns.taskId, TASK_ID[kind]), eq(taskRuns.status, 'ok')))
    .orderBy(desc(taskRuns.runAt))
    .limit(1)
    .get()

  if (!last) return true
  return daysBetween(last.runAt.slice(0, 10), todayStr) >= intervalDays
}

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)) ? value.slice(0, 10) : null
}

async function existingGigs(db: DB): Promise<ExistingRow[]> {
  const rows = await db
    .select({
      name: gigOpportunities.name,
      url: gigOpportunities.url,
      applicationUrl: gigOpportunities.applicationUrl,
    })
    .from(gigOpportunities)
  return rows.map((r) => ({ name: r.name, url: r.url ?? r.applicationUrl }))
}

async function existingSync(db: DB): Promise<ExistingRow[]> {
  const rows = await db.select({ name: syncTargets.name, url: syncTargets.url }).from(syncTargets)
  return rows.map((r) => ({ name: r.name, url: r.url }))
}

export async function runDiscovery(env: Env, kind: DiscoveryKind): Promise<DiscoveryOutcome> {
  const db = getDb(env.DB)
  const empty: DiscoveryOutcome = { kind, added: [], rejected: [], searchCount: 0 }

  if (!env.ANTHROPIC_API_KEY) {
    return { ...empty, error: 'ANTHROPIC_API_KEY not set — discovery skipped' }
  }

  const docs = await db.select().from(referenceDocs)
  if (docs.length === 0) {
    return { ...empty, error: 'No reference docs — nothing to match opportunities against' }
  }

  const profile = buildProfile(docs)
  const existing = kind === 'gigs' ? await existingGigs(db) : await existingSync(db)

  const run = await discover(env.ANTHROPIC_API_KEY, kind, profile, existing)
  const ts = new Date().toISOString()

  if (kind === 'gigs') {
    const { accepted, rejected } = gateCandidates(run.candidates as GigCandidate[], existing)
    const added: DiscoveredItem[] = []

    for (const c of accepted) {
      const inserted = await db
        .insert(gigOpportunities)
        .values({
          name: c.name,
          type: c.type || 'opportunity',
          organizer: c.organizer || null,
          url: c.url,
          applicationUrl: c.applicationUrl || null,
          submissionOpensAt: isoDate(c.submissionOpensAt),
          deadline: isoDate(c.deadline),
          feeAmount: typeof c.feeAmount === 'number' ? c.feeAmount : null,
          paid: c.paid ? 1 : 0,
          loginRequired: c.loginRequired ? 1 : 0,
          genreFitScore: c.fitScore,
          fitRationale: c.fitRationale,
          status: 'pending_review',
          prepStatus: 'none',
          discoveredBy: 'discovery',
          sourceNote: c.sourceNote || null,
          discoveredAt: ts,
          updatedAt: ts,
        })
        .returning({ id: gigOpportunities.id })

      added.push({
        id: inserted[0].id,
        name: c.name,
        kind,
        detail: [
          c.type,
          isoDate(c.submissionOpensAt) ? `opens ${isoDate(c.submissionOpensAt)}` : '',
          isoDate(c.deadline) ? `deadline ${isoDate(c.deadline)}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        url: c.url,
        fitScore: c.fitScore,
      })
    }

    await db.insert(taskRuns).values({
      taskId: TASK_ID.gigs,
      runAt: ts,
      status: 'ok',
      summary: `${added.length} added, ${rejected.length} filtered, ${run.searchCount} searches`,
      itemsAdded: added.length,
    })

    return { kind, added, rejected, searchCount: run.searchCount }
  }

  const { accepted, rejected } = gateCandidates(run.candidates as SyncCandidate[], existing)
  const added: DiscoveredItem[] = []

  for (const c of accepted) {
    const inserted = await db
      .insert(syncTargets)
      .values({
        name: c.name,
        agencyType: c.agencyType || null,
        contactEmail: c.contactEmail || null,
        contactRole: c.contactRole || null,
        url: c.url,
        notes: c.fitRationale,
        status: 'draft_ready',
        discoveredBy: 'discovery',
        sourceNote: c.sourceNote || null,
        discoveredAt: ts,
        updatedAt: ts,
      })
      .returning({ id: syncTargets.id })

    added.push({
      id: inserted[0].id,
      name: c.name,
      kind,
      detail: [c.agencyType, c.contactEmail].filter(Boolean).join(' · '),
      url: c.url,
      fitScore: c.fitScore,
    })
  }

  await db.insert(taskRuns).values({
    taskId: TASK_ID.sync,
    runAt: ts,
    status: 'ok',
    summary: `${added.length} added, ${rejected.length} filtered, ${run.searchCount} searches`,
    itemsAdded: added.length,
  })

  return { kind, added, rejected, searchCount: run.searchCount }
}
