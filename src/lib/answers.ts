import { sql } from 'drizzle-orm'
import { getDb } from '../db'
import { applicationFields, artistAssets } from '../db/schema'
import { scoped, type TenantId } from '../db/scope'
import { buildAnswers, type AnswersFeed, type AskedCounts } from '../../shared/answersAtHand'
import type { ArtistAsset } from '../../shared/artistAssets'
import type { Env } from '../types'

/**
 * What the Answers panel is built from: the library, and how often this
 * artist's own applications have asked each question.
 *
 * "Asked" is a count of the fields on their applications, grouped by the
 * question kind the form reader gave each. It is read here rather than in the
 * browser because it is a query over a table the browser never sees, and both
 * reads are scoped to the artist: the library is theirs, and so is the record of
 * what they have been asked.
 */
export async function readAnswers(env: Env, tenant: TenantId, today: string): Promise<AnswersFeed> {
  const db = getDb(env.DB)

  const [assets, askedRows] = await Promise.all([
    db.select().from(artistAssets).where(scoped(artistAssets, tenant)) as Promise<ArtistAsset[]>,
    db
      .select({ key: applicationFields.questionKind, n: sql<number>`count(*)` })
      .from(applicationFields)
      .where(scoped(applicationFields, tenant, sql`${applicationFields.questionKind} IS NOT NULL`))
      .groupBy(applicationFields.questionKind),
  ])

  const asked: AskedCounts = {}
  for (const row of askedRows) if (row.key) asked[row.key] = row.n

  return buildAnswers({ assets, asked, today })
}
