/**
 * Issuing and redeeming an invitation — the half that touches D1.
 *
 * The rules live in `shared/invites.ts`; this is storage and the one flow that
 * creates an account. Three properties worth stating here because they are
 * decisions rather than plumbing:
 *
 * **The token is stored hashed and shown once.** Same treatment as a session
 * cookie, an enrolment code and an agent token. An invite grants an account,
 * which makes it the most valuable credential this app hands out, and a
 * database dump should be a list of invitations that exist rather than a set of
 * working ones. Losing the link means revoking and reissuing, which is the
 * correct cost.
 *
 * **The address is fixed at issue time.** The person redeeming does not choose
 * it, and this is the signup half of the rule the recovery address already
 * follows: at signup there is nothing on file, so the address has to come from
 * somewhere trusted, and the owner typing it is exactly that.
 *
 * **Redemption creates the tenant, the account and the first passkey in one
 * flow.** An account that exists with no credential is a state to reason about
 * and there is no reason to have one — so the invite is not spent until a
 * credential actually lands.
 */

import { and, desc, eq, isNull, lt, or } from 'drizzle-orm'
import { getDb } from '../db'
import { invites, tenants, users } from '../db/schema'
import { randomToken, sha256Hex } from './auth'
import {
  inviteExpiry,
  inviteRetentionCutoff,
  inviteState,
  type InviteState,
} from '../../shared/invites'
import type { Env } from '../types'

export interface IssuedInvite {
  id: string
  /** The only time this exists outside the invitee's browser. */
  token: string
  expiresAt: string
}

export async function issueInvite(
  env: Env,
  input: { email: string; displayName: string | null; issuedBy: string; now?: Date },
): Promise<IssuedInvite> {
  const now = input.now ?? new Date()
  const token = randomToken()
  const id = randomToken(16)
  const expiresAt = inviteExpiry(now)

  await getDb(env.DB).insert(invites).values({
    id,
    tokenHash: await sha256Hex(token),
    email: input.email,
    displayName: input.displayName,
    issuedBy: input.issuedBy,
    expiresAt,
    redeemedAt: null,
    redeemedUserId: null,
    revokedAt: null,
    createdAt: now.toISOString(),
  })

  return { id, token, expiresAt }
}

export type InviteRow = typeof invites.$inferSelect

/**
 * The invite a token names, and whether it can be used.
 *
 * Looked up by the hash of what was offered, so a wrong token finds no row
 * rather than being compared against a right one — the same reason
 * `agent_tokens` is stored hashed and read the same way.
 *
 * A token that matches nothing and a token that matches something dead are
 * deliberately *different* answers. Both are refusals, but the second can say
 * what happened, and somebody following a month-old link is better served by
 * "this expired" than by silence.
 */
export async function findInvite(
  env: Env,
  token: string,
  now = new Date(),
): Promise<{ invite: InviteRow; state: InviteState } | null> {
  const offered = token.trim()
  if (!offered) return null
  const row = await getDb(env.DB)
    .select()
    .from(invites)
    .where(eq(invites.tokenHash, await sha256Hex(offered)))
    .get()
  if (!row) return null
  return { invite: row, state: inviteState({ now, invite: row }) }
}

/** Everything issued, newest first. Invites are platform state, not an artist's. */
export async function listInvites(env: Env, now = new Date()) {
  const rows = await getDb(env.DB).select().from(invites).orderBy(desc(invites.createdAt))
  return rows.map((row) => ({ ...row, state: inviteState({ now, invite: row }) }))
}

/**
 * Withdraw an invitation that has not been used.
 *
 * Revoking rather than deleting, for the reason a revoked agent token is kept:
 * a row that is gone cannot answer "did I send that, and what happened to it".
 * Redeemed invites are left alone — the account exists, and pretending the
 * invitation never did would make the account's origin unreadable.
 */
export async function revokeInvite(env: Env, id: string, now = new Date()): Promise<boolean> {
  const db = getDb(env.DB)
  const row = await db.select().from(invites).where(eq(invites.id, id)).get()
  if (!row || row.redeemedAt) return false
  await db.update(invites).set({ revokedAt: now.toISOString() }).where(eq(invites.id, id))
  return true
}

/**
 * Forget an invitation nobody used, once it has been dead long enough.
 *
 * Revoking keeps the row so "did I send that, and what happened" has an
 * answer, and an expired one is kept for the same reason. Neither is a reason
 * to keep the name and address typed for it forever, so this is the other end
 * of that: the same invitation, ninety days after it expired or was withdrawn,
 * whichever came first (`UNUSED_INVITE_RETENTION_DAYS`).
 *
 * `redeemed_at IS NULL` is the whole boundary, and it is the same test
 * `inviteState` uses. A redeemed row is never matched here: it is the record of
 * where an account came from, and it is deleted with the account, by
 * `removeTenant`, rather than on a timer that would make that origin unreadable
 * while the account is still live.
 *
 * Invitations are platform state with no tenant column, so there is no scope
 * to apply and none to forget. The window is a handful of rows. Returns how
 * many went, for the cron to say so when it is not nothing.
 */
export async function pruneInvites(env: Env, now: Date): Promise<number> {
  const cutoff = inviteRetentionCutoff(now)
  const gone = await getDb(env.DB)
    .delete(invites)
    .where(
      and(
        isNull(invites.redeemedAt),
        or(lt(invites.expiresAt, cutoff), lt(invites.revokedAt, cutoff)),
      ),
    )
    .returning({ id: invites.id })
  return gone.length
}

export interface RedeemedAccount {
  tenantId: string
  userId: string
  /** What to call them, from the invite. Null when the owner did not say. */
  displayName: string | null
}

/**
 * Turn a valid invite into a tenant and an account.
 *
 * Called from inside the registration ceremony, after the credential has been
 * verified and immediately before it is stored — so an invite is spent only
 * when a passkey actually lands. A ceremony that fails leaves the invitation
 * usable, which is what somebody whose browser cancelled the prompt needs.
 *
 * `email` comes from the invite and nowhere else. It becomes the account's
 * recovery address, and the rule it lives under is that a recovery address is
 * never typed by the person asking for it.
 */
export async function redeemInvite(
  env: Env,
  invite: InviteRow,
  now = new Date(),
): Promise<RedeemedAccount> {
  const db = getDb(env.DB)
  const tenantId = `tnt_${randomToken(9)}`
  const userId = `usr_${randomToken(9)}`
  const stamp = now.toISOString()

  await db.insert(tenants).values({
    id: tenantId,
    displayName: invite.displayName,
    createdAt: stamp,
  })
  await db.insert(users).values({
    id: userId,
    role: 'artist',
    tenantId,
    displayName: invite.displayName,
    email: invite.email,
    createdAt: stamp,
  })
  await db
    .update(invites)
    .set({ redeemedAt: stamp, redeemedUserId: userId })
    .where(eq(invites.id, invite.id))

  return { tenantId, userId, displayName: invite.displayName }
}
