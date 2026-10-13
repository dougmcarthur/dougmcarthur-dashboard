import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { tenantOf, type AppEnv } from '../context'
import {
  STARTER_LIMIT,
  addMatches,
  markStarterAnswered,
  planMatches,
  setSuggestions,
  starterAnswered,
  starterSet,
  suggestionsOff,
} from '../lib/catalogMatch'
import { countUnknowns, groupSkipped, type Match } from '../../shared/catalogMatch'

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
