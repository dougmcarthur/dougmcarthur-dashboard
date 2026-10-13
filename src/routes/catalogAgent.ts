import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, gte, isNull, or, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { opportunities } from '../db/schema'
import { tenantOf, type AppEnv } from '../context'
import { isOwnerTenant } from '../lib/actor'
import { catalogueEntry } from '../lib/catalog'
import {
  CATALOG_AMOUNT_MAX,
  CATALOG_DAILY_LIMIT,
  CATALOG_TEXT_MAX as MAX,
  factsFromAgent,
  genreProblem,
  residentProblem,
} from '../../shared/catalogAgent'
import { windowStart } from '../../shared/agentWrites'

/**
 * Research writes to the shared catalog directly.
 *
 * Until now an entry could exist only as a side effect of filing a gig into the
 * owner's own list, which meant the catalog was what fit the owner, and "already
 * known" meant "on the owner's list". Research is collected once for every
 * artist, so it records what exists here, tagged, and does not judge whether it
 * fits anybody: that is each artist's match, made in the Worker.
 *
 * Only the platform's own agents may write here: an agent credential issued to
 * the owner. A page the agent read is a stranger's claim, so what it files goes
 * through the catalog's own rules (a later sighting fills gaps and never
 * overwrites, nothing is delivered to an artist for three days unless the owner
 * approves it) and is bounded, strictly, in the same way a gig is.
 */
const catalog = new Hono<AppEnv>()

/** An agent writing as the owner's tenant, and nobody else. */
async function platformAgentOnly(c: Context<AppEnv>) {
  const actor = c.get('actor')
  if (actor.kind === 'agent' && (await isOwnerTenant(c.env, tenantOf(c)))) return null
  return c.json({ error: 'Only the research agents write to the shared catalog.' }, 403)
}

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
const amount = z.number().nonnegative().max(CATALOG_AMOUNT_MAX)
const age = z.number().int().min(0).max(120)

/**
 * `create_catalog_entry`. Strict, so a field the tool never sends is a 400
 * naming it. `url` is required: a listing nobody can open is not an
 * opportunity, and the catalog keys on it.
 */
export const CatalogEntrySchema = z
  .object({
    name: z.string().min(1).max(MAX.name),
    type: z.string().min(1).max(MAX.short),
    url: webAddress,
    applicationUrl: webAddress.optional(),
    organizer: text(MAX.name).optional(),
    deadline: text(MAX.name).optional(),
    deadlineNote: text(MAX.note).optional(),
    opensAt: text(40).optional(),
    location: text(MAX.name).optional(),
    country: text(MAX.short).optional(),
    feeAmount: amount.optional(),
    feeCurrency: text(8).optional(),
    paysAmount: amount.optional(),
    paysCurrency: text(8).optional(),
    genres: text(MAX.list).optional(),
    residentOf: text(MAX.list).optional(),
    membership: text(MAX.list).optional(),
    minAge: age.optional(),
    maxAge: age.optional(),
    eligibilityNote: text(MAX.note).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const genres = genreProblem(value.genres)
    if (genres) ctx.addIssue({ code: 'custom', path: ['genres'], message: genres })
    const residents = residentProblem(value.residentOf)
    if (residents) ctx.addIssue({ code: 'custom', path: ['residentOf'], message: residents })
  })

/**
 * What the catalog already holds that is still open, so the agent does not file
 * it again. The same question `list_existing_gigs` answered, asked of the shared
 * list instead of the owner's, and in the same small shape: name, address,
 * deadline, place.
 */
catalog.get('/known', async (c) => {
  const refused = await platformAgentOnly(c)
  if (refused) return refused
  const q = c.req.query('today')
  const today = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 10)
  const rows = await getDb(c.env.DB)
    .select({
      id: opportunities.id,
      name: opportunities.name,
      category: opportunities.category,
      url: opportunities.url,
      deadline: opportunities.deadline,
      deadlineNote: opportunities.deadlineNote,
      location: opportunities.location,
    })
    .from(opportunities)
    // Open, or undated: a closed call is not a duplicate of the one that
    // reopens next year, and the key includes the year for that reason.
    .where(or(isNull(opportunities.deadline), gte(opportunities.deadline, today)))
    .limit(2000)
  return c.json(rows)
})

catalog.post('/', zValidator('json', CatalogEntrySchema), async (c) => {
  const refused = await platformAgentOnly(c)
  if (refused) return refused

  const now = new Date()
  const [{ n }] = await getDb(c.env.DB)
    .select({ n: sql<number>`count(*)` })
    .from(opportunities)
    .where(and(sql`${opportunities.foundBy} = 'agent'`, gte(opportunities.firstSeenAt, windowStart(now))))
  if (n >= CATALOG_DAILY_LIMIT) {
    return c.json(
      { error: `The catalog has taken ${CATALOG_DAILY_LIMIT} new entries from research in the last day. Stop here; the next run continues.` },
      429,
    )
  }

  const { facts, applicationUrl } = factsFromAgent(c.req.valid('json'))
  const { id, created } = await catalogueEntry(c.env, facts, { applicationUrl }, now.toISOString(), true, 'agent')
  return c.json({ id, created }, created ? 201 : 200)
})

export default catalog
