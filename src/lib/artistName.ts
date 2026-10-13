/**
 * Whose notes these are, by name.
 *
 * The research agents wrote their notes about the artist they were working for,
 * so the prose carries a name, and reading it correctly means knowing which. It
 * comes from the account (`tenants.display_name`), never from this repository:
 * see `artistNames` in `shared/reviewParse.ts`.
 *
 * An account with no name set gets `the artist` and nothing more, which is the
 * wording rows written for no one in particular use. That means a note written
 * about somebody by name keeps the name until the account has one, so the
 * welcome questions ask for it.
 */

import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { tenants } from '../db/schema'
import type { TenantId } from '../db/scope'
import { artistNames, type ArtistNames } from '../../shared/reviewParse'
import type { Env } from '../types'

export async function artistNamesFor(env: Env, tenant: TenantId): Promise<ArtistNames> {
  const row = await getDb(env.DB)
    .select({ displayName: tenants.displayName })
    .from(tenants)
    .where(eq(tenants.id, tenant))
    .get()
  return artistNames(row?.displayName)
}
