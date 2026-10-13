/**
 * The refusal for anything that reads the deployment's own mailbox.
 *
 * Reply matching and the sent-mail reconcile read `GMAIL_REFRESH_TOKEN`, which
 * is one inbox: the owner's. They search it with the *requesting artist's* gig
 * names and contact addresses, so for anybody else they would put the owner's
 * subjects, senders and message bodies into that artist's account — and the
 * overlap is not a corner case, because the point of a shared catalog is that
 * two artists apply to the same festival.
 *
 * The cron already ran these for the owner's tenant alone. The routes did not,
 * which is how a button on every artist's screen could do what the schedule
 * was careful never to. An artist's own mailbox is a grant they would make,
 * like Gmail drafting, and is not built.
 */

import type { Context } from 'hono'
import { tenantOf, type AppEnv } from '../context'
import { isOwnerTenant } from './actor'

/** What the screen says, so the route and the empty state agree. */
export const MAILBOX_NOT_AVAILABLE =
  'Reading replies from your mail is not available on your account yet. Scout can only read the mailbox it was set up with.'

/** A response to return, or null when this request may go on. */
export async function refuseUnlessMailboxOwner(c: Context<AppEnv>): Promise<Response | null> {
  if (await isOwnerTenant(c.env, tenantOf(c))) return null
  return c.json({ error: MAILBOX_NOT_AVAILABLE }, 403)
}
