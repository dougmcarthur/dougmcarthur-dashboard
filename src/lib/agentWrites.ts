/**
 * The Worker's half of "an agent files rows and nothing else".
 *
 * `shared/agentRoutes.ts` limits which routes an issued token may call; this
 * limits what it may send through them, how much, and whether it is sending
 * something already on file. One middleware per create route, in front of the
 * route's own validator, and a no-op for everybody who is not an issued token —
 * a person's form and the legacy CI secret reach the same handlers unchanged.
 *
 * Four rules, in the order they are checked:
 *
 *  - **The body is the tool's body.** Each schema below is `.strict()` and
 *    names exactly the fields `scripts/agents/tools.ts` offers, so a field the
 *    tools never send — `status: 'booked'`, show dates, a `run_at` — is a 400
 *    naming it rather than something the route quietly stores.
 *    `test/agentWrites.test.ts` checks the two lists against each other.
 *  - **Text is bounded.** See `AGENT_TEXT_MAX`.
 *  - **Volume is bounded.** A trailing day's rows, per `AGENT_DAILY_LIMITS`.
 *  - **A repeat is refused, with the row it repeats.** A 409 is information,
 *    not a fault: the agent is told it is already filed and moves on.
 *
 * Every refusal is a sentence the session can act on, because `cli.ts` prints
 * it and routine.md tells the session that an error means nothing was filed.
 */

import type { MiddlewareHandler } from 'hono'
import { gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { gigOpportunities, promoDrafts, syncTargets, taskRuns } from '../db/schema'
import { scoped, type TenantId } from '../db/scope'
import type { AppEnv } from '../context'
import { isIssuedAgent } from './actor'
import {
  AGENT_DAILY_LIMITS,
  AGENT_FEE_MAX,
  AGENT_TEXT_MAX as MAX,
  duplicateGig,
  duplicateSyncTarget,
  overDailyLimit,
  windowStart,
  type AgentWriteKind,
} from '../../shared/agentWrites'

/** Only http and https: the form reader fetches these, and a listing is a web page. */
const webAddress = z
  .string()
  .max(MAX.url)
  .url()
  .refine((value) => {
    try {
      const { protocol } = new URL(value)
      return protocol === 'https:' || protocol === 'http:'
    } catch {
      return false
    }
  }, 'must be an http or https address')

const text = (max: number) => z.string().max(max)

/**
 * `create_gig_opportunity` plus the `status` the runners add. Only
 * `discovered` is accepted: an agent finds opportunities and the artist
 * decides what becomes of them, so a row arriving further along is a claim no
 * research run has the standing to make — and one the nightly reconcile would
 * act on.
 */
export const AgentGigSchema = z
  .object({
    name: z.string().min(1).max(MAX.name),
    type: z.string().min(1).max(MAX.short),
    url: webAddress.optional().or(z.literal('')),
    applicationUrl: webAddress.optional(),
    organizer: text(MAX.name).optional(),
    deadline: text(MAX.name).optional(),
    deadlineNote: text(MAX.note).optional(),
    opensAt: text(MAX.date).optional(),
    location: text(MAX.name).optional(),
    country: text(MAX.short).optional(),
    paid: z.boolean().optional(),
    feeAmount: z.number().nonnegative().max(AGENT_FEE_MAX).optional(),
    feeCurrency: text(8).optional(),
    fitRationale: text(MAX.prose).optional(),
    status: z.literal('discovered').optional(),
  })
  .strict()

/** `create_sync_target`. No `status`: a new target is `draft_ready`. */
export const AgentSyncSchema = z
  .object({
    name: z.string().min(1).max(MAX.name),
    agencyType: text(MAX.short).optional(),
    contactEmail: z.string().email().max(MAX.email).optional().or(z.literal('')),
    contactRole: text(MAX.name).optional(),
    notes: text(MAX.prose).optional(),
    pitchDraft: text(MAX.pitch).optional(),
  })
  .strict()

/** `create_promo_draft`. */
export const AgentPromoSchema = z
  .object({
    month: z.string().min(1).max(MAX.date),
    title: z.string().min(1).max(MAX.name),
    content: z.string().min(1).max(MAX.prose),
  })
  .strict()

/**
 * What `logRun` posts. No `run_at`: the Worker's clock stamps a run, because
 * `stalledTasks` measures silence from the newest stamp and one dated next
 * year would make a stopped schedule read as alive for as long.
 */
export const AgentTaskRunSchema = z
  .object({
    task_id: z.string().min(1).max(80),
    status: z.string().min(1).max(24),
    summary: text(MAX.summary).optional(),
    items_added: z.number().int().min(0).max(1000).optional(),
  })
  .strict()

const SCHEMAS = {
  gig: AgentGigSchema,
  sync: AgentSyncSchema,
  promo: AgentPromoSchema,
  taskRun: AgentTaskRunSchema,
} as const satisfies Record<AgentWriteKind, z.ZodTypeAny>

/** The first few problems, as one sentence a session can read from stderr. */
function describe(error: z.ZodError): string {
  const issues = error.issues
    .slice(0, 4)
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
  return `This is not a body the agent tools send. ${issues.join('; ')}.`
}

/** This tenant's rows of the kind, stamped since `since`. */
async function rowsSince(env: AppEnv['Bindings'], kind: AgentWriteKind, tenant: TenantId, since: string): Promise<number> {
  const db = getDb(env.DB)
  const count = sql<number>`count(*)`
  switch (kind) {
    case 'gig': {
      const [row] = await db
        .select({ n: count })
        .from(gigOpportunities)
        .where(scoped(gigOpportunities, tenant, gte(gigOpportunities.discoveredAt, since)))
      return row.n
    }
    case 'sync': {
      const [row] = await db
        .select({ n: count })
        .from(syncTargets)
        .where(scoped(syncTargets, tenant, gte(syncTargets.discoveredAt, since)))
      return row.n
    }
    case 'promo': {
      const [row] = await db
        .select({ n: count })
        .from(promoDrafts)
        .where(scoped(promoDrafts, tenant, gte(promoDrafts.createdAt, since)))
      return row.n
    }
    case 'taskRun': {
      const [row] = await db
        .select({ n: count })
        .from(taskRuns)
        .where(scoped(taskRuns, tenant, gte(taskRuns.runAt, since)))
      return row.n
    }
  }
}

async function repeatOf(
  env: AppEnv['Bindings'],
  kind: 'gig' | 'sync',
  tenant: TenantId,
  body: Record<string, any>,
): Promise<string | null> {
  const db = getDb(env.DB)
  if (kind === 'gig') {
    const known = await db
      .select({
        id: gigOpportunities.id,
        name: gigOpportunities.name,
        url: gigOpportunities.url,
        applicationUrl: gigOpportunities.applicationUrl,
      })
      .from(gigOpportunities)
      .where(scoped(gigOpportunities, tenant))
    const same = duplicateGig(body as { name: string; url?: string; applicationUrl?: string }, known)
    return same ? `Already on file as gig #${same.id}, "${same.name}". Not filed again.` : null
  }
  const known = await db
    .select({ id: syncTargets.id, name: syncTargets.name, contactEmail: syncTargets.contactEmail })
    .from(syncTargets)
    .where(scoped(syncTargets, tenant))
  const same = duplicateSyncTarget(body as { name: string; contactEmail?: string }, known)
  return same ? `Already on file as sync target #${same.id}, "${same.name}". Not filed again.` : null
}

/**
 * Put in front of a create route's validator. Passes everything that is not an
 * issued agent token straight through.
 */
export function agentWrite(kind: AgentWriteKind): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const actor = c.get('actor')
    if (!isIssuedAgent(actor)) return next()

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'The body is not valid JSON.' }, 400)
    }

    const parsed = SCHEMAS[kind].safeParse(body)
    if (!parsed.success) return c.json({ error: describe(parsed.error) }, 400)

    const filedToday = await rowsSince(c.env, kind, actor.tenant, windowStart(new Date()))
    if (overDailyLimit(kind, filedToday)) {
      return c.json(
        {
          error:
            `This account has reached the ${AGENT_DAILY_LIMITS[kind]} a day the agents may add. ` +
            'Stop filing, and say so in the run log.',
        },
        429,
      )
    }

    if (kind === 'gig' || kind === 'sync') {
      const repeat = await repeatOf(c.env, kind, actor.tenant, parsed.data as Record<string, any>)
      if (repeat) return c.json({ error: repeat }, 409)
    }

    return next()
  }
}
