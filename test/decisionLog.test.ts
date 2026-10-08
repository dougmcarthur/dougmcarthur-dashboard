import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { app } from '../src/index'
import { createSession } from '../src/lib/auth'
import { recordGigDecision } from '../src/lib/decisionLog'
import { prepareApplication } from '../src/lib/applicationStaging'
import { asTenantId } from '../src/db/scope'
import { SESSION_COOKIE } from '../shared/auth'
import {
  DECISION_CONTEXT_VERSION,
  decisionRow,
  gigDecisionContext,
  isChoice,
  parseDecisionContext,
  syncDecisionContext,
} from '../shared/decisionLog'
import type { GigOpportunity, SyncTarget } from '../shared/types'
import type { PrepOutcome } from '../src/lib/applicationPrep'
import { sqliteD1 } from './support/sqliteD1'

/**
 * The decision log: what an artist chose, and what the screen showed them.
 *
 * Three things are held here. The snapshot says what the screen said and
 * nothing the artist wrote. Every door a status can change through writes a
 * row, and only those doors. And nothing about it can cost the artist the move
 * it is recording.
 */

const TODAY = '2026-10-05'

function day(offset: number): string {
  const d = new Date(`${TODAY}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

function gig(over: Partial<GigOpportunity> = {}): GigOpportunity {
  return {
    id: 7,
    name: 'Canmore Folk Festival 2027',
    type: 'festival',
    organizer: null,
    submissionMethod: null,
    audienceSize: null,
    genreFitScore: null,
    deadline: day(9),
    deadlineNote: null,
    opensAt: null,
    feeAmount: null,
    feeCurrency: null,
    fee: null,
    paid: 0,
    fitNotes: null,
    fitRationale: null,
    url: 'https://listing.example/canmore',
    status: 'discovered',
    googleEventId: null,
    snoozedUntil: null,
    snoozedAt: null,
    discoveredAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  }
}

function syncTarget(over: Partial<SyncTarget> = {}): SyncTarget {
  return {
    id: 3,
    name: 'Northern Lights Music Library',
    agencyType: 'library',
    contactEmail: 'supervisor@example.com',
    contactRole: null,
    confirmationMethod: null,
    notes: 'A private note about the supervisor.',
    pitchDraft: 'Hello — a draft pitch the artist has not sent.',
    pitchSent: null,
    status: 'draft_ready',
    snoozedUntil: null,
    snoozedAt: null,
    discoveredAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    reconciledAt: null,
    ...over,
  } as SyncTarget
}

describe('the snapshot of a gig', () => {
  it('says what the screen derived from the row, as of today', () => {
    const c = gigDecisionContext(
      gig({ location: 'Toronto, ON', country: 'CA', feeAmount: 25, feeCurrency: 'CAD', paid: 1, genreFitScore: 4 }),
      TODAY,
    )
    expect(c).toMatchObject({
      v: DECISION_CONTEXT_VERSION,
      kind: 'gig',
      name: 'Canmore Folk Festival 2027',
      category: 'festival',
      stage: 'new',
      deadline: { date: day(9), exact: true, daysLeft: 9 },
      fee: { amount: 25, currency: 'CAD', paidFlag: true },
      place: { location: 'Toronto, ON', country: 'CA' },
      fit: 4,
      score: null,
    })
    // The queue's own flag for a deadline inside fourteen days.
    expect(c.flags).toContain('due_soon')
  })

  it('moves with today, not with the clock', () => {
    expect(gigDecisionContext(gig(), TODAY).deadline.daysLeft).toBe(9)
    expect(gigDecisionContext(gig(), day(4)).deadline.daysLeft).toBe(5)
    expect(gigDecisionContext(gig(), day(10)).flags).toContain('overdue')
  })

  it('keeps a missing input missing', () => {
    const c = gigDecisionContext(gig({ deadline: null, location: null, country: null }), TODAY)
    expect(c.deadline).toMatchObject({ date: null, daysLeft: null })
    // No place, no band, nothing to cost: null, not a zero range.
    expect(c.cost).toBeNull()
    expect(c.fit).toBeNull()
    expect(c.fee).toEqual({ amount: null, currency: null, paidFlag: false })
  })

  it('counts what a cost could not count rather than reporting a cheap trip', () => {
    // An entry fee with no amount cannot be priced, so the range is a floor.
    const unpriced = gigDecisionContext(gig({ location: 'Toronto, ON', country: 'CA', paid: 1 }), TODAY)
    expect(unpriced.cost).not.toBeNull()
    expect(unpriced.cost!.unknowns).toBe(1)
    // The band came from the location, not from the row.
    expect(unpriced.cost!.inferred).toBe(true)

    const priced = gigDecisionContext(gig({ location: 'Toronto, ON', country: 'CA', paid: 1, feeAmount: 40, feeCurrency: 'CAD' }), TODAY)
    expect(priced.cost!.unknowns).toBe(0)
    expect(priced.cost!.high).toBeGreaterThan(unpriced.cost!.high - 1)
  })

  it('says a deadline recovered from prose is not exact', () => {
    const c = gigDecisionContext(gig({ deadline: 'Applications close October 20, 2026' }), TODAY)
    expect(c.deadline.exact).toBe(false)
  })

  it('records the stage the row was in before the move', () => {
    expect(gigDecisionContext(gig({ status: 'shortlisted' }), TODAY).stage).toBe('in_progress')
    expect(gigDecisionContext(gig({ status: 'submitted' }), TODAY).stage).toBe('applied')
  })
})

describe('what the snapshot is allowed to hold', () => {
  const SECRET = {
    fitRationale: 'SECRET-RATIONALE the artist or an agent wrote about this',
    fitNotes: 'SECRET-LEGACY-NOTE',
    prepNote: 'SECRET-PREP-NOTE',
    applicationUrl: 'https://secret.example/form',
    url: 'https://listing.example/canmore',
    organizer: 'SECRET-ORGANISER',
  }

  // The context is written out field by field, so a column added to
  // gig_opportunities next year cannot reach a log nobody is watching.
  it('carries no prose, no address and no link', () => {
    const json = JSON.stringify(gigDecisionContext(gig(SECRET), TODAY))
    for (const value of Object.values(SECRET)) expect(json).not.toContain(value)
  })

  it('has exactly these fields, so a new one is added on purpose', () => {
    const c = gigDecisionContext(gig({ location: 'Toronto, ON', country: 'CA' }), TODAY)
    expect(Object.keys(c).sort()).toEqual(
      ['category', 'cost', 'deadline', 'fee', 'fit', 'flags', 'kind', 'name', 'opensInDays', 'place', 'score', 'silenceDays', 'stage', 'type', 'v'].sort(),
    )
    expect(Object.keys(c.deadline).sort()).toEqual(['date', 'daysLeft', 'exact', 'note'])
    expect(Object.keys(c.fee).sort()).toEqual(['amount', 'currency', 'paidFlag'])
    expect(Object.keys(c.place).sort()).toEqual(['country', 'location'])
  })

  it('keeps a sync target to its name, kind and whether a pitch exists', () => {
    const c = syncDecisionContext(syncTarget(), TODAY)
    const json = JSON.stringify(c)
    expect(json).not.toContain('supervisor@example.com')
    expect(json).not.toContain('private note')
    expect(json).not.toContain('draft pitch')
    expect(c.hasPitch).toBe(true)
    expect(Object.keys(c).sort()).toEqual(['agencyType', 'category', 'flags', 'hasPitch', 'kind', 'name', 'score', 'status', 'v'])
  })

  it('shortens a long name rather than storing a paragraph', () => {
    expect(gigDecisionContext(gig({ name: 'x'.repeat(500) }), TODAY).name).toHaveLength(160)
  })
})

describe('reading a stored context back', () => {
  it('round-trips', () => {
    const c = gigDecisionContext(gig(), TODAY)
    expect(parseDecisionContext(JSON.stringify(c))).toEqual(c)
  })

  // "We cannot say what the screen showed" is a different claim from an empty
  // snapshot, so anything unrecognised is null.
  it('reads anything it does not recognise as null', () => {
    expect(parseDecisionContext(null)).toBeNull()
    expect(parseDecisionContext('{not json')).toBeNull()
    expect(parseDecisionContext('"gig"')).toBeNull()
    expect(parseDecisionContext(JSON.stringify({ v: 99, kind: 'gig' }))).toBeNull()
    expect(parseDecisionContext(JSON.stringify({ v: 1, kind: 'promo' }))).toBeNull()
  })
})

describe('one move as the values of a row', () => {
  const base = { entityId: 7, opportunityId: 12, via: 'gig_patch', actor: 'user', at: `${TODAY}T10:00:00.000Z` } as const
  const context = gigDecisionContext(gig(), TODAY)

  it('gives a gig move its stage and outcome in the screens’ language', () => {
    const row = decisionRow({ ...base, entity: 'gig', action: 'move', from: 'discovered', to: 'passed', context })
    expect(row).toMatchObject({ fromValue: 'discovered', toValue: 'passed', toStage: 'closed', toOutcome: 'passed' })
    expect(JSON.parse(row.context)).toEqual(context)
    const started = decisionRow({ ...base, entity: 'gig', action: 'move', from: 'discovered', to: 'shortlisted', context })
    expect(started).toMatchObject({ toStage: 'in_progress', toOutcome: null })
  })

  it('does not invent a stage for a sync target, a snooze or a removal', () => {
    const sync = decisionRow({ ...base, entity: 'sync', action: 'move', from: 'draft_ready', to: 'pitched', context: syncDecisionContext(syncTarget(), TODAY) })
    expect(sync).toMatchObject({ toStage: null, toOutcome: null })
    const snooze = decisionRow({ ...base, entity: 'gig', action: 'snooze', to: day(30), context })
    expect(snooze).toMatchObject({ toValue: day(30), toStage: null })
    const removed = decisionRow({ ...base, entity: 'gig', action: 'remove', from: 'discovered', context })
    expect(removed).toMatchObject({ toValue: null, toStage: null })
  })
})

describe('what counts as a choice', () => {
  it('is the artist moving something, not a step after a choice or a machine', () => {
    expect(isChoice({ via: 'gig_patch', actor: 'user' })).toBe(true)
    expect(isChoice({ via: 'snooze', actor: 'user' })).toBe(true)
    expect(isChoice({ via: 'application_start', actor: 'user' })).toBe(false)
    expect(isChoice({ via: 'gig_patch', actor: 'agent' })).toBe(false)
  })
})

/* ----------------------------------------------------------------------- */
/* Against the production schema                                           */
/* ----------------------------------------------------------------------- */

const OWNER = 'tnt_0001'
const OTHER = 'tnt_0002'

async function world() {
  const { d1, db } = sqliteD1()
  const env = { DB: d1, DASHBOARD_URL: 'http://localhost:8787', API_TOKEN: 'agent-secret' } as never

  // The migrations seed the owner (usr_0001 on tnt_0001); one artist beside them.
  db.exec(`INSERT INTO tenants (id, display_name, created_at) VALUES ('${OTHER}', 'Artist', '2026-01-01')`)
  db.exec(`INSERT INTO users (id, role, tenant_id, display_name, created_at) VALUES ('usr_artist', 'artist', '${OTHER}', 'Artist', '2026-01-01')`)

  const cookie = async (userId: string) => {
    const { token } = await createSession(env, { credentialId: null, label: 'test', userId })
    return `${SESSION_COOKIE}=${token}`
  }

  const addGig = (over: Record<string, unknown> = {}): number => {
    const row = {
      tenant_id: OWNER,
      name: 'Prairie Roots Festival',
      type: 'festival',
      status: 'new',
      deadline: '2099-12-31',
      location: 'Toronto, ON',
      country: 'CA',
      fit_rationale: 'SECRET-RATIONALE',
      opportunity_id: null,
      discovered_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      ...over,
    }
    const cols = Object.keys(row)
    const result = db
      .prepare(`INSERT INTO gig_opportunities (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(...(Object.values(row) as never[]))
    return Number(result.lastInsertRowid)
  }

  const addSync = (over: Record<string, unknown> = {}): number => {
    const row = {
      tenant_id: OWNER,
      name: 'Northern Lights Library',
      agency_type: 'library',
      status: 'draft_ready',
      discovered_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      ...over,
    }
    const cols = Object.keys(row)
    return Number(
      db
        .prepare(`INSERT INTO sync_targets (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(...(Object.values(row) as never[])).lastInsertRowid,
    )
  }

  const log = () => db.prepare('SELECT * FROM decision_log ORDER BY id').all() as Array<Record<string, any>>

  const send = async (user: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(
      path,
      {
        method,
        headers: {
          ...(user ? { Cookie: await cookie(user) } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env,
    )

  return { env, db, addGig, addSync, log, send }
}

describe('the table', () => {
  it('exists on the production schema, led by the tenant in both of its indexes', async () => {
    const { db } = await world()
    const indexes = db
      .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'decision_log'`)
      .all() as Array<{ name: string; sql: string | null }>
    const named = indexes.filter((i) => i.sql)
    expect(named.map((i) => i.name).sort()).toEqual(['decision_log_tenant_entity', 'decision_log_tenant_time'])
    for (const i of named) expect(i.sql).toMatch(/\(tenant_id,/)
  })

  it('refuses a row with no tenant, instead of landing it on the owner', async () => {
    const { db } = await world()
    expect(() =>
      db
        .prepare(
          `INSERT INTO decision_log (entity_type, entity_id, action, via, actor, context, decided_at)
           VALUES ('gig', 1, 'move', 'gig_patch', 'user', '{}', '2026-10-05')`,
        )
        .run(),
    ).toThrow()
  })
})

describe('moving a gig', () => {
  it('writes one row, against the row as it was and not as it became', async () => {
    const w = await world()
    const id = w.addGig({ opportunity_id: 12 })

    // The same request edits the deadline. The decision was made against the old one.
    const res = await w.send('usr_0001', 'PATCH', `/api/gigs/${id}`, { status: 'shortlisted', deadline: '2099-06-01' })
    expect(res.status).toBe(200)

    const rows = w.log()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tenant_id: OWNER,
      entity_type: 'gig',
      entity_id: id,
      opportunity_id: 12,
      action: 'move',
      from_value: 'discovered',
      to_value: 'shortlisted',
      to_stage: 'in_progress',
      to_outcome: null,
      via: 'gig_patch',
      actor: 'user',
    })
    const ctx = JSON.parse(rows[0].context)
    expect(ctx.deadline.date).toBe('2099-12-31')
    expect(ctx.stage).toBe('new')
    expect(ctx.name).toBe('Prairie Roots Festival')
  })

  it('logs a pass with its outcome, and none of what was written about the gig', async () => {
    const w = await world()
    const id = w.addGig()
    await w.send('usr_0001', 'PATCH', `/api/gigs/${id}`, { status: 'passed' })
    const [row] = w.log()
    expect(row).toMatchObject({ to_stage: 'closed', to_outcome: 'passed' })
    expect(row.context).not.toContain('SECRET-RATIONALE')
  })

  it('logs nothing for an edit that leaves the status alone', async () => {
    const w = await world()
    const id = w.addGig()
    await w.send('usr_0001', 'PATCH', `/api/gigs/${id}`, { organizer: 'Somebody' })
    // Echoing the status it already has is an edit, not a move.
    await w.send('usr_0001', 'PATCH', `/api/gigs/${id}`, { status: 'discovered', name: 'Renamed' })
    expect(w.log()).toHaveLength(0)
  })

  it('logs nothing for a move the pipeline refuses', async () => {
    const w = await world()
    const id = w.addGig({ status: 'closed', outcome: 'passed' })
    const res = await w.send('usr_0001', 'PATCH', `/api/gigs/${id}`, { status: 'booked' })
    expect(res.status).toBe(400)
    expect(w.log()).toHaveLength(0)
  })

  it('says it was a research agent when it was one', async () => {
    const w = await world()
    const id = w.addGig()
    const res = await w.send(null, 'PATCH', `/api/gigs/${id}`, { status: 'shortlisted' }, { Authorization: 'Bearer agent-secret' })
    expect(res.status).toBe(200)
    expect(w.log()[0]).toMatchObject({ actor: 'agent', via: 'gig_patch' })
  })

  it('writes nothing, for anyone, when the row belongs to somebody else', async () => {
    const w = await world()
    const id = w.addGig() // the owner's
    const res = await w.send('usr_artist', 'PATCH', `/api/gigs/${id}`, { status: 'passed' })
    expect(res.status).toBe(404)
    expect(w.log()).toHaveLength(0)
  })

  it('keeps each artist’s decisions apart', async () => {
    const w = await world()
    const mine = w.addGig()
    const theirs = w.addGig({ tenant_id: OTHER, name: 'Their Festival' })
    await w.send('usr_0001', 'PATCH', `/api/gigs/${mine}`, { status: 'shortlisted' })
    await w.send('usr_artist', 'PATCH', `/api/gigs/${theirs}`, { status: 'passed' })
    const rows = w.log()
    expect(rows.map((r) => [r.tenant_id, r.entity_id])).toEqual([
      [OWNER, mine],
      [OTHER, theirs],
    ])
  })
})

describe('removing a gig', () => {
  it('keeps the decision after the row it was about is gone', async () => {
    const w = await world()
    const id = w.addGig({ status: 'shortlisted' })
    const res = await w.send('usr_0001', 'DELETE', `/api/gigs/${id}`)
    expect(res.status).toBe(200)
    expect(w.db.prepare('SELECT COUNT(*) AS n FROM gig_opportunities').get()).toEqual({ n: 0 })

    const [row] = w.log()
    expect(row).toMatchObject({ action: 'remove', entity_id: id, from_value: 'shortlisted', to_value: null, via: 'gig_delete' })
    expect(JSON.parse(row.context)).toMatchObject({ name: 'Prairie Roots Festival', stage: 'in_progress' })
  })

  it('logs nothing when there was nothing to remove', async () => {
    const w = await world()
    await w.send('usr_0001', 'DELETE', '/api/gigs/999')
    expect(w.log()).toHaveLength(0)
  })
})

describe('deferring something', () => {
  it('logs a snooze with the date it comes back, and a wake', async () => {
    const w = await world()
    const id = w.addGig()
    await w.send('usr_0001', 'POST', '/api/review/snooze', { kind: 'gig', id, until: '2099-01-01' })
    await w.send('usr_0001', 'POST', '/api/review/snooze', { kind: 'gig', id, until: null })

    const rows = w.log()
    expect(rows.map((r) => [r.action, r.from_value, r.to_value, r.via])).toEqual([
      ['snooze', null, '2099-01-01', 'snooze'],
      ['wake', '2099-01-01', null, 'snooze'],
    ])
    expect(JSON.parse(rows[0].context).stage).toBe('new')
  })

  it('does not log waking something that was not asleep', async () => {
    const w = await world()
    const id = w.addGig()
    const res = await w.send('usr_0001', 'POST', '/api/review/snooze', { kind: 'gig', id, until: null })
    expect(res.status).toBe(200)
    expect(w.log()).toHaveLength(0)
  })

  it('logs a sync target the same way, and nothing for a row that is not there', async () => {
    const w = await world()
    const id = w.addSync()
    await w.send('usr_0001', 'POST', '/api/review/snooze', { kind: 'sync', id, until: '2099-01-01' })
    const missing = await w.send('usr_0001', 'POST', '/api/review/snooze', { kind: 'sync', id: 999, until: '2099-01-01' })
    expect(missing.status).toBe(404)
    const rows = w.log()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ entity_type: 'sync', action: 'snooze', to_value: '2099-01-01' })
  })
})

describe('a sync target', () => {
  it('logs a status change and not an edit', async () => {
    const w = await world()
    const id = w.addSync()
    await w.send('usr_0001', 'PATCH', `/api/sync/${id}`, { notes: 'edited' })
    await w.send('usr_0001', 'PATCH', `/api/sync/${id}`, { status: 'draft_ready' })
    expect(w.log()).toHaveLength(0)

    await w.send('usr_0001', 'PATCH', `/api/sync/${id}`, { status: 'pitched' })
    const [row] = w.log()
    expect(row).toMatchObject({
      entity_type: 'sync',
      action: 'move',
      from_value: 'draft_ready',
      to_value: 'pitched',
      to_stage: null,
      via: 'sync_patch',
    })
    expect(JSON.parse(row.context)).toMatchObject({ kind: 'sync', category: 'sync', status: 'draft_ready' })
  })
})

describe('starting an application', () => {
  const FORM: PrepOutcome = {
    status: 'ready',
    note: null,
    title: 'ARTIST APPLICATION',
    url: 'https://example.festivalpro.com/form/1',
    fields: [{ fieldKey: '1', label: 'Band/Artist Name', fieldType: 'text', required: true, position: 0 }],
  }
  const read = (async () => FORM) as never

  it('is logged as a step after the choice, not as a choice', async () => {
    const w = await world()
    const id = w.addGig({ status: 'shortlisted', url: 'https://example.festivalpro.com/form/1' })
    const result = await prepareApplication(w.env, asTenantId(OWNER), id, { requested: true, read, now: `${TODAY}T10:00:00.000Z` })
    expect(result.ok).toBe(true)

    const [row] = w.log()
    expect(row).toMatchObject({ from_value: 'shortlisted', to_value: 'preparing', to_stage: 'in_progress', via: 'application_start' })
    expect(isChoice(row as never)).toBe(false)
  })

  it('is not logged when the nightly revisit reads a form, because nothing moved', async () => {
    const w = await world()
    const id = w.addGig({ status: 'shortlisted', url: 'https://example.festivalpro.com/form/1' })
    await prepareApplication(w.env, asTenantId(OWNER), id, { requested: false, read, now: `${TODAY}T03:00:00.000Z` })
    expect(w.log()).toHaveLength(0)
  })
})

describe('the log never costs the artist the move', () => {
  it('swallows a failed write and says so', async () => {
    const { env } = await world()
    const broken = { DB: { prepare: () => { throw new Error('D1 is down') } } } as never
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ok = await recordGigDecision(
      broken,
      asTenantId(OWNER),
      { ...gig(), tenantId: OWNER, opportunityId: null } as never,
      { action: 'move', from: 'discovered', to: 'passed', via: 'gig_patch', actor: 'user', at: `${TODAY}T10:00:00.000Z` },
    )
    expect(ok).toBe(false)
    expect(spy).toHaveBeenCalledWith('decision log write failed:', expect.any(Error))
    spy.mockRestore()
    expect(env).toBeTruthy()
  })
})

/* ----------------------------------------------------------------------- */
/* Source-level                                                            */
/* ----------------------------------------------------------------------- */

const SRC = join(__dirname, '..', 'src')

function sourceFiles(dir = ''): string[] {
  return readdirSync(join(SRC, dir)).flatMap((entry) => {
    const rel = dir ? `${dir}/${entry}` : entry
    if (statSync(join(SRC, rel)).isDirectory()) return sourceFiles(rel)
    return rel.endsWith('.ts') ? [rel] : []
  })
}

const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

describe('every door a status moves through', () => {
  // The files that decide something about a gig or a sync target, and so have
  // to say so. A new writer of a status that is not in this list fails below,
  // which is the point: the log has a hole exactly where one is forgotten.
  const DECIDERS = [
    'routes/gigs.ts',
    'routes/review.ts',
    'routes/sync.ts',
    'routes/syncReconcile.ts',
    'lib/applicationStaging.ts',
  ]

  it('logs from every file that writes a decision', () => {
    for (const file of DECIDERS) {
      expect(read(file), file).toMatch(/record(Gig|Sync)Decision\(/)
    }
  })

  it('has no other writer of a gig status', () => {
    const writers = sourceFiles()
      .filter((rel) => rel !== 'db/gigRows.ts')
      .filter((rel) => read(rel).includes('gigStatusColumns('))
    expect(writers.sort(), 'a file writes a gig status without being listed as a decider').toEqual(
      DECIDERS.filter((f) => read(f).includes('gigStatusColumns(')).sort(),
    )
  })

  // Written for a reason each, like the exemptions in tenantScope.test.ts.
  const SYNC_EXEMPT: Record<string, string> = {
    'lib/catalog.ts': 'writes `opportunity_id`, the link to the shared catalog, and nothing about a status',
    'routes/backfill.ts': 'fills columns derived from the note, behind a preview, and never a status',
  }

  it('has no other writer of a sync target', () => {
    const writers = sourceFiles().filter((rel) => /\.update\(\s*syncTargets\s*\)|\.update\(\s*table\s*\)/.test(read(rel)))
    const unexplained = writers.filter((rel) => !DECIDERS.includes(rel) && !(rel in SYNC_EXEMPT))
    expect(unexplained, 'a file updates sync_targets without logging or a written reason').toEqual([])
  })
})

describe('the log is append-only', () => {
  it('is never updated or deleted from, except by removing the whole tenant', () => {
    for (const rel of sourceFiles()) {
      const source = read(rel)
      expect(source, rel).not.toMatch(/\.update\(\s*decisionLog\s*\)/)
      // A tenant's removal reaches it through DOMAIN_TABLES, not by name.
      if (rel !== 'db/scope.ts') expect(source, rel).not.toMatch(/\.delete\(\s*decisionLog\s*\)/)
    }
  })

  it('is deleted with the artist it belongs to', () => {
    const block = /export const DOMAIN_TABLES = \[([\s\S]*?)\] as const/.exec(read('db/scope.ts'))?.[1] ?? ''
    expect(block).toContain('decisionLog')
  })
})
