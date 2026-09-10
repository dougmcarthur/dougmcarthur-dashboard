/**
 * The oversight surface. Mounted at `/api/admin`, served only to an owner
 * whose session is in admin mode.
 *
 * What it reads is the whole design: `tenants`, `users` and the `usage_daily`
 * rollup, and nothing else. The counts the owner needs are written into that
 * rollup by the cron, by code running *as the tenant*, which emits a number —
 * the owner reads the number. See `src/lib/usage.ts`.
 *
 * The guarantee is structural rather than remembered. This router is typed
 * `AdminEnv`, whose context carries an `AdminActor` with **no tenant on it**,
 * and `scoped()` takes a `TenantId` — so a route here that reached for
 * `gig_opportunities` has nothing to pass and does not compile. That is why
 * admin mode resolves to no tenant rather than to a wildcard.
 *
 * There is no impersonation and no "act as this artist". Better Auth's admin
 * plugin offers one and it is deliberately not copied: the promise made to an
 * invited artist is that their gig notes are theirs, and a support tool that
 * quietly breaks that promise is worse than no support tool.
 *
 * The role is checked here as well as in the middleware. A hidden button is
 * still a URL, and a second check costs one comparison.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { asc, desc, eq, inArray } from 'drizzle-orm'
import { getDb } from '../db'
import { tenants, usageDaily, users } from '../db/schema'
import { asTenantId } from '../db/scope'
import { adminOf, type AdminEnv } from '../context'
import { elevationState } from '../../shared/auth'
import { previewRemoval, removeTenant } from '../lib/tenantRemoval'
import { issueInvite, listInvites, revokeInvite } from '../lib/invites'
import { MEASURED_FIELDS } from '../lib/usage'

const admin = new Hono<AdminEnv>()

/**
 * Every artist on the platform, with tenure and the latest usage sample.
 *
 * Tenure is `users.created_at` and needs no mechanism at all — it is the
 * earliest account against the tenant. The plan noticed that before anything
 * was built, and it is still true.
 */
admin.get('/artists', async (c) => {
  const db = getDb(c.env.DB)

  const [tenantRows, accountRows] = await Promise.all([
    db.select().from(tenants).orderBy(asc(tenants.createdAt)),
    db.select().from(users).orderBy(asc(users.createdAt)),
  ])

  const ids = tenantRows.map((t) => t.id)
  // One query for every tenant's samples rather than one per tenant. The table
  // is one row per tenant per day and prunes at ninety, so this stays small
  // for a long time; if it stops being small the fix is a per-tenant limit,
  // not a loop of queries.
  const usage = ids.length
    ? await db
        .select()
        .from(usageDaily)
        .where(inArray(usageDaily.tenantId, ids))
        .orderBy(desc(usageDaily.day))
    : []

  const latest = new Map<string, (typeof usage)[number]>()
  for (const row of usage) if (!latest.has(row.tenantId)) latest.set(row.tenantId, row)

  return c.json({
    items: tenantRows.map((tenant) => {
      const accounts = accountRows.filter((u) => u.tenantId === tenant.id)
      const sample = latest.get(tenant.id)
      return {
        id: tenant.id,
        // Null rather than a guess assembled from an email address. A missing
        // input is never a guess, and this is a name on a screen.
        displayName: tenant.displayName,
        // The earliest account, which is when this artist actually arrived —
        // the tenant row and the first user are written together at redemption.
        since: accounts[0]?.createdAt ?? tenant.createdAt,
        accounts: accounts.length,
        owner: accounts.some((u) => u.role === 'owner'),
        usage: sample
          ? {
              day: sample.day,
              domainRows: sample.domainRows,
              gigRows: sample.gigRows,
              promoRows: sample.promoRows,
              agentRuns: sample.agentRuns,
            }
          : null,
      }
    }),
    // Which of the rollup's columns mean something. Three of them have no
    // writer yet, and a zero the screen renders as "none" would be a worse
    // answer than saying so. See src/lib/usage.ts.
    measured: MEASURED_FIELDS,
  })
})

/**
 * What removing an artist would destroy, before it destroys it.
 *
 * A count per table, which names no column and returns no row — the size of
 * the thing, not any of its content. Same preview-then-apply shape as every
 * other bulk write here, and it matters most on the one that cannot be undone.
 */
admin.get('/artists/:id/removal', async (c) => {
  const target = await resolveTenant(c.env.DB, c.req.param('id'))
  if (!target) return c.json({ error: 'not found' }, 404)
  return c.json(await previewRemoval(c.env, target))
})

/**
 * Remove an artist and everything of theirs.
 *
 * Two guards beyond the surface itself:
 *
 * **A recent passkey assertion**, because this destroys data across a
 * boundary — the other half of the narrow rule elevation exists for.
 *
 * **The owner's own tenant is refused.** Deleting it would take the account
 * holding the oversight surface with it, and there would be nobody left to
 * undo the mistake. Leaving the platform is a different operation from
 * removing an artist from it, and this route is only the second.
 */
admin.delete('/artists/:id', async (c) => {
  const actor = adminOf(c)
  if (!elevationState({ now: new Date(), elevatedAt: actor.session.elevatedAt }).elevated) {
    return c.json(
      { error: 'Confirm it is you before removing an artist.', needsElevation: true },
      403,
    )
  }

  const db = getDb(c.env.DB)
  const target = await resolveTenant(c.env.DB, c.req.param('id'))
  if (!target) return c.json({ error: 'not found' }, 404)

  const accounts = await db.select().from(users).where(eq(users.tenantId, target))
  if (accounts.some((u) => u.role === 'owner')) {
    return c.json({ error: 'The owner’s own account cannot be removed here.' }, 409)
  }

  return c.json(await removeTenant(c.env, target))
})

/* --------------------------------------------------------------------- */
/* Invitations                                                            */
/* --------------------------------------------------------------------- */

/**
 * Everything issued, and what became of it.
 *
 * Invites are platform state rather than an artist's, so this is unscoped and
 * that is not an oversight: the row is about somebody who does not have a
 * tenant yet, which is the entire point of it.
 *
 * The token is not here and cannot be. It is stored hashed, and a screen that
 * could re-show a working invitation would be a screen that leaks one.
 */
admin.get('/invites', async (c) => {
  const rows = await listInvites(c.env)
  return c.json({
    items: rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      state: row.state,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      redeemedAt: row.redeemedAt,
      revokedAt: row.revokedAt,
    })),
    /**
     * Why the link is handed over rather than emailed.
     *
     * The `send_email` binding sends through an explicit allowlist in
     * wrangler.toml — two entries, both the owner's — which is a real security
     * property today rather than a limitation: the Worker cannot mail anywhere
     * else even if the code is wrong. It stops working the moment somebody
     * else needs mail, and the gate is a **domain**, not a plan: sending to an
     * arbitrary recipient needs the sending domain onboarded to Email Service.
     *
     * Reported rather than assumed, so the screen says what it can actually do
     * instead of offering a button that would throw.
     */
    canMail: false,
  })
})

/**
 * Issue one.
 *
 * A passkey touch, because this creates a credential that grants an account —
 * squarely the "changes who can get in" rule, and the largest instance of it
 * in the app.
 *
 * The address is typed by the owner and fixed here. The person redeeming does
 * not choose it: at signup there is nothing on file, so it has to come from
 * somewhere trusted, and this is that place.
 */
admin.post(
  '/invites',
  zValidator(
    'json',
    z.object({
      email: z.string().trim().email(),
      displayName: z.string().trim().max(80).optional(),
    }),
  ),
  async (c) => {
    const actor = adminOf(c)
    if (!elevationState({ now: new Date(), elevatedAt: actor.session.elevatedAt }).elevated) {
      return c.json(
        { error: 'Confirm it is you before inviting somebody.', needsElevation: true },
        403,
      )
    }

    const body = c.req.valid('json')
    const issued = await issueInvite(c.env, {
      email: body.email,
      displayName: body.displayName || null,
      issuedBy: actor.userId,
    })

    // The one and only time the token exists outside the invitee's browser.
    // Losing it means revoking and reissuing, which is the correct cost for a
    // credential — the same bargain an agent token makes.
    return c.json({ id: issued.id, token: issued.token, expiresAt: issued.expiresAt }, 201)
  },
)

/**
 * Withdraw one that has not been used.
 *
 * No passkey touch. Revoking removes access rather than granting it, and the
 * rule is narrow on purpose: a prompt you see constantly is one you stop
 * reading, and this is the safe direction of the same action.
 */
admin.delete('/invites/:id', async (c) => {
  const revoked = await revokeInvite(c.env, c.req.param('id'))
  // A redeemed invitation answers 409 rather than 404: it exists, and the
  // reason it cannot be withdrawn is that somebody already has the account.
  // Deleting the row would make that account's origin unreadable.
  if (!revoked) return c.json({ error: 'That invitation cannot be withdrawn.' }, 409)
  return c.json({ id: c.req.param('id'), revoked: true })
})

/**
 * A path segment into a tenant that exists, or null.
 *
 * `asTenantId` would happily brand any non-empty string, so the check against
 * the table is what stands between a typo and a delete that matches nothing
 * and reports success.
 */
async function resolveTenant(binding: D1Database, raw: string | undefined) {
  if (!raw?.trim()) return null
  const row = await getDb(binding).select().from(tenants).where(eq(tenants.id, raw)).get()
  return row ? asTenantId(row.id) : null
}

export default admin
