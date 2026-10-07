import { describe, it, expect } from 'vitest'
import { asTenantId } from '../src/db/scope'
import { readAnswers } from '../src/lib/answers'
import { sqliteD1 } from './support/sqliteD1'

/**
 * The Answers panel's two reads, run for real against the production schema.
 *
 * `buildAnswers` is covered without a database in `answersAtHand.test.ts`. What
 * it cannot cover is what it is handed: whose library, and whose record of what
 * has been asked. A count that missed the tenant would order one artist's
 * answers by another's applications, and list a stranger's unanswered question
 * as this artist's gap.
 */

const TODAY = '2026-10-07'
const OWNER = asTenantId('tnt_0001')
const OTHER = asTenantId('tnt_0002')

function database() {
  const { d1, db } = sqliteD1()

  const asset = (o: { tenant?: string; kind: string; label: string; value?: string; questionKind?: string | null; archived?: number }) =>
    db
      .prepare(
        `INSERT INTO artist_assets (tenant_id, kind, label, value, question_kind, review_by, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, '2027-06-01', ?, '2026-01-01', '2026-01-01')`,
      )
      .run(o.tenant ?? OWNER, o.kind, o.label, o.value ?? 'A value', o.questionKind ?? null, o.archived ?? 0)

  const field = (o: { tenant?: string; gig: number; key: string; questionKind: string | null }) =>
    db
      .prepare(
        `INSERT INTO application_fields (tenant_id, gig_id, field_key, label, question_kind, created_at, updated_at)
         VALUES (?, ?, ?, 'A question', ?, '2026-01-01', '2026-01-01')`,
      )
      .run(o.tenant ?? OWNER, o.gig, o.key, o.questionKind)

  return { env: { DB: d1 } as never, asset, field }
}

describe('what the panel reads', () => {
  it('lists this artist\'s answers and nobody else\'s', async () => {
    const t = database()
    t.asset({ kind: 'bio', label: 'Mine', questionKind: 'bio' })
    t.asset({ tenant: OTHER, kind: 'bio', label: 'A stranger\'s bio', questionKind: 'bio' })
    const feed = await readAnswers(t.env, OWNER, TODAY)
    expect(feed.groups.flatMap((g) => g.answers.map((a) => a.label))).toEqual(['Mine'])
  })

  it('leaves out what was archived', async () => {
    const t = database()
    t.asset({ kind: 'bio', label: 'Old', archived: 1 })
    t.asset({ kind: 'bio', label: 'Current' })
    expect((await readAnswers(t.env, OWNER, TODAY)).total).toBe(1)
  })

  it('counts how often this artist\'s applications asked each question, and orders by it', async () => {
    const t = database()
    t.asset({ kind: 'link', label: 'Bandcamp', value: 'https://a.bandcamp.com', questionKind: 'bandcamp' })
    t.asset({ kind: 'link', label: 'Website', value: 'https://example.test', questionKind: 'website' })
    // Website outranks Bandcamp with nothing counted. Asked four times, Bandcamp leads.
    for (const gig of [1, 2, 3, 4]) t.field({ gig, key: `f${gig}`, questionKind: 'bandcamp' })
    t.field({ gig: 1, key: 'w', questionKind: 'website' })
    const links = (await readAnswers(t.env, OWNER, TODAY)).groups[0].answers
    expect(links.map((a) => [a.label, a.asked])).toEqual([['Bandcamp', 4], ['Website', 1]])
  })

  it('does not order one artist\'s answers by another artist\'s applications', async () => {
    const t = database()
    t.asset({ kind: 'link', label: 'Bandcamp', value: 'https://a.bandcamp.com', questionKind: 'bandcamp' })
    t.asset({ kind: 'link', label: 'Website', value: 'https://example.test', questionKind: 'website' })
    for (const gig of [1, 2, 3, 4]) t.field({ tenant: OTHER, gig, key: `f${gig}`, questionKind: 'bandcamp' })
    const links = (await readAnswers(t.env, OWNER, TODAY)).groups[0].answers
    expect(links.map((a) => a.label)).toEqual(['Website', 'Bandcamp'])
    expect(links.every((a) => a.asked === 0)).toBe(true)
  })

  it('names a question the applications ask and nothing on file answers', async () => {
    const t = database()
    t.asset({ kind: 'bio', label: 'Bio', questionKind: 'bio' })
    t.field({ gig: 1, key: 'a', questionKind: 'set_length' })
    t.field({ gig: 2, key: 'a', questionKind: 'set_length' })
    expect((await readAnswers(t.env, OWNER, TODAY)).missing).toEqual([{ key: 'set_length', label: 'Set length', asked: 2 }])
  })

  it('does not name a stranger\'s unanswered question as this artist\'s gap', async () => {
    const t = database()
    t.field({ tenant: OTHER, gig: 1, key: 'a', questionKind: 'set_length' })
    expect((await readAnswers(t.env, OWNER, TODAY)).missing).toEqual([])
  })

  it('ignores a field the form reader could not classify', async () => {
    const t = database()
    t.field({ gig: 1, key: 'a', questionKind: null })
    expect((await readAnswers(t.env, OWNER, TODAY)).missing).toEqual([])
  })

  it('reads the day it is given, so an entry is overdue on the reader\'s calendar', async () => {
    const t = database()
    t.asset({ kind: 'fact', label: 'Monthly listeners', questionKind: 'streaming_stats' })
    expect((await readAnswers(t.env, OWNER, '2026-10-07')).needsLook).toBe(0)
    expect((await readAnswers(t.env, OWNER, '2027-07-01')).needsLook).toBe(1)
  })
})
