/**
 * The logged-out landing page's two routes. Public — under
 * `PUBLIC_API_PREFIXES` — so each is written as if the whole internet is
 * calling it, because it is.
 *
 * `GET /opportunities` reads the shared catalog and nothing else: the table
 * has no column for anything an artist decided, so no bug in here can print
 * one. `POST /invite-requests` stores a name, an address and a message from
 * somebody with no account, and rings the owner's bell. It sends no email —
 * the address is typed by a stranger, which is exactly the recipient
 * `shared/recipients.ts` refuses — and it answers the same way whether or not
 * a request was stored, apart from an honest "slow down".
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { inviteRequests, opportunities } from '../db/schema'
import type { RootEnv } from '../context'
import { ownerTenant } from '../lib/actor'
import { recordEvent } from '../lib/notificationEvents'
import { sha256Hex } from '../lib/auth'
import { publicListing, type CatalogCategory } from '../../shared/opportunityCatalog'
import {
  INVITE_REQUEST_LIMITS,
  inviteRequestTitle,
} from '../../shared/inviteRequests'

const site = new Hono<RootEnv>()

site.get('/opportunities', async (c) => {
  const rows = await getDb(c.env.DB)
    .select()
    .from(opportunities)
    .where(eq(opportunities.public, 1))
    .orderBy(desc(opportunities.firstSeenAt))
    .limit(400)
  const today = new Date().toISOString().slice(0, 10)
  const listing = publicListing(
    rows.map((r) => ({ ...r, category: r.category as CatalogCategory, public: r.public === 1 })),
    today,
  )
  // Minutes-stale is fine for a page about calls that close in weeks, and it
  // keeps a busy landing page from being a D1 read per visitor.
  c.header('Cache-Control', 'public, max-age=300')
  return c.json({ categories: listing, asOf: today })
})

const RequestSchema = z.object({
  name: z.string().trim().min(1).max(INVITE_REQUEST_LIMITS.name),
  email: z.string().trim().email().max(INVITE_REQUEST_LIMITS.email),
  message: z.string().trim().min(INVITE_REQUEST_LIMITS.messageMin).max(INVITE_REQUEST_LIMITS.message),
  /** A field a person never sees. Anything in it is a form-filling bot. */
  website: z.string().max(200).optional(),
})

site.post('/invite-requests', zValidator('json', RequestSchema), async (c) => {
  const body = c.req.valid('json')
  const accepted = { ok: true, message: 'Thanks — your request is in. We’ll reply by email.' }

  // A bot gets the same answer as a person, so it learns nothing to adapt to.
  if (body.website) return c.json(accepted)

  const db = getDb(c.env.DB)
  const now = new Date()
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // The sender's address, salted and hashed, for a per-sender limit. The raw
  // address is never stored: a rate limit needs to recognise a repeat, not
  // know who it was.
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const requesterHash = await sha256Hex(`${c.env.TOKEN_ENCRYPTION_KEY ?? 'scout'}:${ip}`)

  const [mine, everyone] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(inviteRequests)
      .where(and(eq(inviteRequests.requesterHash, requesterHash), gte(inviteRequests.createdAt, since)))
      .get(),
    db
      .select({ n: sql<number>`count(*)` })
      .from(inviteRequests)
      .where(gte(inviteRequests.createdAt, since))
      .get(),
  ])
  if ((mine?.n ?? 0) >= INVITE_REQUEST_LIMITS.perSenderPerDay) {
    return c.json({ error: 'We already have your request — we’ll be in touch.' }, 429)
  }
  if ((everyone?.n ?? 0) >= INVITE_REQUEST_LIMITS.perDay) {
    return c.json({ error: 'We’ve had a lot of requests today. Please try again tomorrow.' }, 429)
  }

  await db.insert(inviteRequests).values({
    name: body.name,
    email: body.email.toLowerCase(),
    message: body.message,
    requesterHash,
    status: 'new',
    createdAt: now.toISOString(),
    handledAt: null,
  })

  // The owner hears about it in the bell, as an event: "somebody asked on
  // Tuesday" is not recoverable from Wednesday's state.
  const owner = await ownerTenant(c.env)
  if (owner) {
    await recordEvent(c.env, owner, {
      kind: 'signup',
      tier: 'info',
      title: inviteRequestTitle(body.name),
      body: body.message.length > 200 ? `${body.message.slice(0, 199)}…` : body.message,
      href: '#settings/account',
      action: 'Read it in admin mode',
      createdAt: now.toISOString(),
    })
  }

  return c.json(accepted)
})

export default site
