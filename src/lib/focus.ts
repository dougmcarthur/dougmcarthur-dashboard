/**
 * What this artist asked Scout for, read from their account.
 *
 * Three stored facts: the goals and reach they chose in the welcome questions,
 * the home base they set in Settings, and the province they said they live in.
 * "My province" is the home base's, and the province they said until there is a
 * home base. Never a guess: an account with neither has no province, and the
 * queue then says nothing about how far anything is.
 *
 * Read per request, like the artist's name, and handed to the queue rather than
 * fetched by it. See `shared/artistFocus.ts` for what is done with it, and
 * for the rule that it orders what is undecided and removes nothing.
 */

import { readTenantSetting } from './nudgeSettings'
import { readHome } from './travelEnrich'
import { focusFrom, type Focus } from '../../shared/artistFocus'
import { ONBOARDING_KEYS, parseGoals, parseProfile } from '../../shared/onboarding'
import type { TenantId } from '../db/scope'
import type { Env } from '../types'

export async function focusFor(env: Env, tenant: TenantId): Promise<Focus | null> {
  const [goals, profile, home] = await Promise.all([
    readTenantSetting(env, tenant, ONBOARDING_KEYS.goals),
    readTenantSetting(env, tenant, ONBOARDING_KEYS.profile),
    readHome(env, tenant),
  ])
  return focusFrom(parseGoals(goals), home?.place ?? null, parseProfile(profile)?.region)
}
