/**
 * The first-run checklist. See `shared/onboarding.ts` for what each step
 * means and why the checklist is derived rather than stored.
 *
 * Three things are stored, all in `tenant_settings`, all the artist's own:
 * the goals they chose, whether they hid the checklist, and nothing else. A
 * hidden checklist is only hidden — every step is still readable on Help, and
 * showing it again is one button there.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { artistAssets, artistConnectors, googleGrants, passkeyCredentials, referenceDocs, tenants } from '../db/schema'
import { scoped } from '../db/scope'
import { tenantOf, type AppEnv } from '../context'
import { countRows } from '../lib/usage'
import { grantConfigured } from '../lib/googleGrant'
import { clearTenantSetting, readTenantSetting, writeTenantSetting } from '../lib/nudgeSettings'
import {
  GOALS,
  GOAL_NOTE_MAX,
  REACH,
  nextSteps,
  onboardingSteps,
  parseGoals,
  type OnboardingFacts,
} from '../../shared/onboarding'

export const ONBOARDING_KEYS = {
  goals: 'onboarding.goals',
  hiddenAt: 'onboarding.hiddenAt',
} as const

const onboarding = new Hono<AppEnv>()

onboarding.get('/', async (c) => {
  const tenant = tenantOf(c)
  const actor = c.get('actor')
  const db = getDb(c.env.DB)

  const [tenantRow, libraryEntries, documents, connectorRows, grants, passkeys, goalsRaw, hiddenAt] =
    await Promise.all([
      db.select().from(tenants).where(eq(tenants.id, tenant)).get(),
      countRows(c.env, artistAssets, tenant),
      countRows(c.env, referenceDocs, tenant),
      db
        .select({ kind: artistConnectors.kind })
        .from(artistConnectors)
        .where(scoped(artistConnectors, tenant)),
      countRows(c.env, googleGrants, tenant),
      // Passkeys belong to a person rather than to the artist, so they are
      // counted for whoever is asking. An agent token has none, and is never
      // the one reading a checklist anyway.
      actor.kind === 'user'
        ? db
            .select({ count: sql<number>`count(*)` })
            .from(passkeyCredentials)
            .where(eq(passkeyCredentials.userId, actor.userId))
            .get()
            .then((r) => r?.count ?? 0)
        : Promise.resolve(0),
      readTenantSetting(c.env, tenant, ONBOARDING_KEYS.goals),
      readTenantSetting(c.env, tenant, ONBOARDING_KEYS.hiddenAt),
    ])

  const kinds = connectorRows.map((r) => r.kind)
  const facts: OnboardingFacts = {
    displayName: tenantRow?.displayName ?? null,
    libraryEntries,
    documents,
    profileConnected: kinds.some((k) => k === 'manitoba_music' || k.startsWith('association:')),
    googleConnected: grants > 0,
    googleAvailable: grantConfigured(c.env),
    bandsintownConnected: kinds.includes('bandsintown'),
    passkeys,
  }
  const goals = parseGoals(goalsRaw)

  return c.json({
    ...onboardingSteps(facts, goals),
    goals,
    next: nextSteps(goals),
    hidden: hiddenAt !== null,
    options: { goals: GOALS, reach: REACH },
  })
})

const GoalsSchema = z.object({
  goals: z.array(z.enum(GOALS.map((g) => g.id) as [string, ...string[]])).max(GOALS.length),
  reach: z.array(z.enum(REACH.map((r) => r.id) as [string, ...string[]])).max(REACH.length),
  note: z.string().trim().max(GOAL_NOTE_MAX).nullable().optional(),
})

onboarding.put('/goals', zValidator('json', GoalsSchema), async (c) => {
  const body = c.req.valid('json')
  const value = { goals: [...new Set(body.goals)], reach: [...new Set(body.reach)], note: body.note || null }
  await writeTenantSetting(c.env, tenantOf(c), ONBOARDING_KEYS.goals, JSON.stringify(value))
  return c.json({ goals: parseGoals(JSON.stringify(value)) })
})

onboarding.post('/hide', async (c) => {
  await writeTenantSetting(c.env, tenantOf(c), ONBOARDING_KEYS.hiddenAt, new Date().toISOString())
  return c.json({ hidden: true })
})

onboarding.post('/show', async (c) => {
  await clearTenantSetting(c.env, tenantOf(c), ONBOARDING_KEYS.hiddenAt)
  return c.json({ hidden: false })
})

export default onboarding
