/**
 * The EPK as a page: the artist's preview, their share links, and the public
 * read those links open.
 *
 * Two routers, because they sit on opposite sides of the authentication
 * middleware. `epk` is behind it like everything else. `publicEpk` is under
 * `/api/public/`, in `PUBLIC_API_PREFIXES`, and the share token in the request
 * body is its only credential — the same arrangement as an invitation, and
 * for the same reason the token travels in a POST body read from the URL
 * fragment rather than in a path a server would log.
 *
 * What the public page may show is `shared/publicEpk.ts`'s decision, and this
 * file never widens it: the public route strips `withheld`, and returns the
 * display name, the chosen cut and the shows, nothing else about the tenant.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { artistAssets, epkShares, tenants } from '../db/schema'
import { scoped, withTenant, type TenantId } from '../db/scope'
import { tenantOf, type AppEnv } from '../context'
import type { Env } from '../types'
import { randomToken, sha256Hex } from '../lib/auth'
import { tenantForEpkShare } from '../lib/actor'
import { collectShows } from './shows'
import type { ArtistAsset, EpkAudience } from '../../shared/artistAssets'
import { buildPublicEpk } from '../../shared/publicEpk'

const AUDIENCES = ['festival', 'sync', 'press'] as const
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function audienceOf(raw: string | null | undefined): EpkAudience {
  return (AUDIENCES as readonly string[]).includes(raw ?? '') ? (raw as EpkAudience) : 'festival'
}

function dateOr(raw: string | null | undefined): string {
  return raw && ISO_DATE.test(raw) ? raw : new Date().toISOString().slice(0, 10)
}

async function assemble(env: Env, tenant: TenantId, audience: EpkAudience, today: string) {
  const db = getDb(env.DB)
  const [assets, account, shows] = await Promise.all([
    db.select().from(artistAssets).where(scoped(artistAssets, tenant)) as Promise<ArtistAsset[]>,
    db.select().from(tenants).where(eq(tenants.id, tenant)).get(),
    collectShows(env, tenant, today),
  ])
  return {
    name: account?.displayName ?? null,
    audience,
    epk: buildPublicEpk(assets, { audience, today }),
    shows: {
      upcoming: shows.upcoming,
      // A year of past dates is a history; a profile wants the recent ones.
      past: shows.past.slice(0, 8),
    },
  }
}

/* --------------------------------------------------------------------- */
/* The artist's side                                                      */
/* --------------------------------------------------------------------- */

export const epk = new Hono<AppEnv>()

/** Exactly what a share link would show, plus what it leaves out and why. */
epk.get('/preview', async (c) => {
  const out = await assemble(c.env, tenantOf(c), audienceOf(c.req.query('audience')), dateOr(c.req.query('today')))
  return c.json(out)
})

epk.get('/shares', async (c) => {
  const rows = await getDb(c.env.DB)
    .select()
    .from(epkShares)
    .where(scoped(epkShares, tenantOf(c)))
    .orderBy(desc(epkShares.createdAt))
  // What exists, never what it is: the token is stored hashed and not
  // returned, like an agent token's.
  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      label: r.label,
      audience: r.audience,
      createdAt: r.createdAt,
      lastViewedAt: r.lastViewedAt,
      revokedAt: r.revokedAt,
    })),
  })
})

const ShareSchema = z.object({
  label: z.string().trim().min(1).max(80),
  audience: z.enum(AUDIENCES),
})

/**
 * A new link. No passkey touch: it publishes what the artist has already
 * reviewed, and changes nothing about who can sign in — the narrow rule
 * elevation keeps. The screen says plainly that anyone holding the link can
 * read the page.
 */
epk.post('/shares', zValidator('json', ShareSchema), async (c) => {
  const { label, audience } = c.req.valid('json')
  const token = randomToken()
  const id = randomToken(16)
  await getDb(c.env.DB)
    .insert(epkShares)
    .values(
      withTenant(tenantOf(c), {
        id,
        tokenHash: await sha256Hex(token),
        audience,
        label,
        createdAt: new Date().toISOString(),
        lastViewedAt: null,
        revokedAt: null,
      }),
    )
  // The one time the token exists outside the link the artist hands out.
  return c.json({ id, label, audience, token }, 201)
})

/** Revoked, not deleted: "this link stopped working" should stay answerable. */
epk.delete('/shares/:id', async (c) => {
  const tenant = tenantOf(c)
  const id = c.req.param('id')
  const db = getDb(c.env.DB)
  const row = await db.select().from(epkShares).where(scoped(epkShares, tenant, eq(epkShares.id, id))).get()
  if (!row) return c.json({ error: 'not found' }, 404)
  await db
    .update(epkShares)
    .set({ revokedAt: new Date().toISOString() })
    .where(scoped(epkShares, tenant, eq(epkShares.id, id)))
  return c.json({ id, revoked: true })
})

/* --------------------------------------------------------------------- */
/* The public side                                                        */
/* --------------------------------------------------------------------- */

export const publicEpk = new Hono<{ Bindings: Env }>()

const ReadSchema = z.object({
  token: z.string().min(1).max(200),
  today: z.string().regex(ISO_DATE).optional(),
})

publicEpk.post('/epk', zValidator('json', ReadSchema), async (c) => {
  const { token, today } = c.req.valid('json')
  const share = await tenantForEpkShare(c.env, token)
  if (!share) {
    // One answer for unknown and withdrawn alike.
    return c.json({ error: 'This link is not active. Ask the artist for a current one.' }, 404)
  }
  const out = await assemble(c.env, share.tenant, audienceOf(share.audience), dateOr(today))
  const { withheld: _withheld, ...visible } = out.epk
  return c.json({ ...out, epk: visible })
})
