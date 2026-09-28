/**
 * Retention for invitation requests: a name and an address from somebody who
 * never signed up. A handled request goes after 90 days, an unanswered one
 * after a year. The landing page promises that, so this is what keeps the
 * promise.
 */

import { and, lt, ne, or } from 'drizzle-orm'
import { getDb } from '../db'
import { inviteRequests } from '../db/schema'
import { HANDLED_RETENTION_DAYS, UNHANDLED_RETENTION_DAYS } from '../../shared/inviteRequests'
import type { Env } from '../types'

export async function pruneInviteRequests(env: Env, now: Date): Promise<void> {
  const day = 24 * 60 * 60 * 1000
  const handledCutoff = new Date(now.getTime() - HANDLED_RETENTION_DAYS * day).toISOString()
  const anyCutoff = new Date(now.getTime() - UNHANDLED_RETENTION_DAYS * day).toISOString()
  // The admin route writes `handled_at` whenever it changes the status, so a
  // handled request always has the date this measures from.
  await getDb(env.DB)
    .delete(inviteRequests)
    .where(
      or(
        and(ne(inviteRequests.status, 'new'), lt(inviteRequests.handledAt, handledCutoff)),
        lt(inviteRequests.createdAt, anyCutoff),
      ),
    )
}
