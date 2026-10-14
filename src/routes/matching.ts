import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { tenantOf, type AppEnv } from '../context'
import { gigOpportunities, syncTargets } from '../db/schema'
import {
  STARTER_LIMIT,
  addMatches,
  addSyncTarget,
  findSyncTarget,
  markStarterAnswered,
  planMatches,
  planStart,
  setSuggestions,
  starterAnswered,
  starterSet,
  suggestionsOff,
} from '../lib/catalogMatch'
import { countUnknowns, groupSkipped, type Match } from '../../shared/catalogMatch'
import { pastFirstVisit } from '../../shared/startLanes'
import { countRows } from '../lib/usage'

/**
 * What Scout found for this artist from the shared catalog, and the switch for
 * more of it.
 *
 * Research is collected once for everybody. This is the per-artist half: which
 * of it is theirs, in what order, and why. The preview is the point and the
 * write follows it, like the other bulk writes here: a screen that adds twelve
 * rows to somebody's list without showing them first is one they find out about
 * afterwards. The write re-plans on the server and never trusts what the browser
 * was shown, since a plan can be minutes old and a call can have closed since.
 */
const matching = new Hono<AppEnv>()

function todayOf(c: { req: { query: (k: string) => string | undefined } }): string {
  const q = c.req.query('today')
  return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 10)
}

/** An entry as the preview shows it: the listing, and the reasons in words. */
function shown(m: Match) {
  return {
    id: m.entry.id,
    name: m.entry.name,
    category: m.entry.category,
    kind: m.entry.kind,
    location: m.entry.location,
    deadline: m.entry.deadline,
    deadlineNote: m.entry.deadlineNote,
    url: m.entry.url,
    reasons: m.reasons,
    unknowns: m.unknowns.map((u) => u.text),
  }
}

matching.get('/starter', async (c) => {
  const tenant = tenantOf(c)
  const plan = await planMatches(c.env, tenant, todayOf(c))
  const set = starterSet(plan)
  return c.json({
    said: plan.said,
    answered: await starterAnswered(c.env, tenant),
    off: await suggestionsOff(c.env, tenant),
    limit: STARTER_LIMIT,
    willAdd: set.map(shown),
    // What matched and is not in the set: beyond what they asked for, or past
    // the cap. Counted so the screen can say there is more.
    rest: plan.matches.length - set.length,
    held: plan.held,
    skipped: groupSkipped(plan.skipped),
    unknowns: countUnknowns(set),
  })
})

matching.post('/starter', async (c) => {
  const tenant = tenantOf(c)
  const now = new Date().toISOString()
  // Planned again here, not read back from the preview: a call that closed in
  // the meantime must not be added because a stale screen still listed it.
  const plan = await planMatches(c.env, tenant, todayOf(c))
  const added = await addMatches(c.env, tenant, starterSet(plan), now)
  await markStarterAnswered(c.env, tenant, now)
  return c.json({ added: added.length, names: added.map((m) => m.entry.name) })
})

/**
 * What a brand-new account is shown before it has said anything: grants open
 * to artists anywhere in Canada, festivals and showcases in its province, and
 * sync companies whose own sites say they take submissions and ask for no
 * exclusivity. See `shared/startLanes.ts`. Writes nothing.
 */
matching.get('/start', async (c) => {
  const tenant = tenantOf(c)
  const [answered, off, gigs, targets] = await Promise.all([
    starterAnswered(c.env, tenant),
    suggestionsOff(c.env, tenant),
    countRows(c.env, gigOpportunities, tenant),
    countRows(c.env, syncTargets, tenant),
  ])
  // Past a first visit: they have a list of their own, said not now, or
  // switched suggestions off. The Overview loads this on every visit, and the
  // catalog scan is the expensive half, so nothing is read for an account
  // that is not going to be shown it.
  const established = pastFirstVisit(gigs + targets)
  if (answered || off || established) return c.json({ answered, off, established, lanes: null })

  const { lanes } = await planStart(c.env, tenant, todayOf(c))
  return c.json({ answered, off, established, lanes })
})

/**
 * Add festivals, showcases and grants from the lanes. The ids are only a
 * request: each is checked against what the lanes would offer this artist now,
 * so a stale screen, or a request made by hand, can add nothing the preview
 * would not have shown.
 */
matching.post(
  '/start/add',
  zValidator('json', z.object({ ids: z.array(z.number().int().positive()).min(1).max(24) })),
  async (c) => {
    const tenant = tenantOf(c)
    const { ids } = c.req.valid('json')
    const { lanes, plan } = await planStart(c.env, tenant, todayOf(c))
    const offered = new Set([...lanes.grants.rows, ...lanes.province.rows].map((r) => r.id))
    const wanted = new Set(ids.filter((id) => offered.has(id)))
    const picked = plan.matches.filter((m) => wanted.has(m.entry.id))
    const added = await addMatches(c.env, tenant, picked, new Date().toISOString())
    return c.json({ added: added.length, names: added.map((m) => m.entry.name) })
  },
)

/**
 * Add one sync organisation to the Sync list. Only one that the lane lists,
 * and never one whose own site refuses pitches from people it does not know.
 */
matching.post('/start/sync', zValidator('json', z.object({ id: z.number().int().positive() })), async (c) => {
  const tenant = tenantOf(c)
  const { id } = c.req.valid('json')
  // Already theirs is an answer and not an error: a second tap on Add, or a
  // screen a minute behind, should land on the row that exists.
  const existing = await findSyncTarget(c.env, tenant, id)
  if (existing) return c.json({ added: false, id: existing.id, name: existing.name })

  const { plan, syncAddable } = await planStart(c.env, tenant, todayOf(c))
  const entry = plan.entries.find((e) => e.id === id)
  if (!entry || !syncAddable.has(id)) {
    return c.json({ error: 'That organisation is not one Scout can add for you right now.' }, 409)
  }
  const added = await addSyncTarget(c.env, tenant, entry, new Date().toISOString())
  return c.json({ added: true, id: added?.id ?? null, name: added?.name ?? entry.name })
})

/** "Not now": the card stops asking. The daily run is unaffected. */
matching.post('/starter/decline', async (c) => {
  await markStarterAnswered(c.env, tenantOf(c), new Date().toISOString())
  return c.json({ ok: true })
})

matching.get('/settings', async (c) => c.json({ enabled: !(await suggestionsOff(c.env, tenantOf(c))) }))

matching.put('/settings', zValidator('json', z.object({ enabled: z.boolean() })), async (c) => {
  const { enabled } = c.req.valid('json')
  await setSuggestions(c.env, tenantOf(c), enabled)
  return c.json({ enabled })
})

export default matching
