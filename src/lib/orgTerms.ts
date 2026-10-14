/**
 * What a sync organisation's own site says, kept on the shared catalog entry.
 *
 * A pitch gate lives on one artist's `sync_targets` row, which is right for a
 * target they are about to write to and no use to somebody who arrived an hour
 * ago with no rows. What a company's website says about taking submissions and
 * about exclusivity is a fact about the company, so it is mirrored onto the
 * catalog entry the row is linked to, where a new account can be shown it.
 *
 * Four rules, all inherited:
 *
 *  - **Only the owner's research reaches the catalog.** The address a target is
 *    read from is typed by whoever owns the row, so another artist could point
 *    a catalog organisation's name at a page of their choosing. The same lock
 *    `agentMayPublish` puts on filing a listing is put on its terms: a
 *    stranger's claim about a page is not shown to everybody else.
 *  - **Toward caution, never away.** A refusal replaces anything and an
 *    invitation fills only an empty policy, which is `foldFinding` applied to
 *    the catalog's columns rather than a second copy of the rule.
 *  - **A read that did not read is not a read.** A site that would not open
 *    leaves `terms_read_at` empty, so "never looked" is still told apart from
 *    "looked and found nothing", and a dead site is retried and not believed.
 *  - **The artist's own override stays theirs.** `policy_overridden_at` is a
 *    decision about one person's pitch and is never mirrored.
 */

import { and, eq, isNotNull, isNull, inArray } from 'drizzle-orm'
import { getDb } from '../db'
import { opportunities, syncTargets } from '../db/schema'
import { scoped, type TenantId } from '../db/scope'
import { isOwnerTenant } from './actor'
import { foldExclusivity, type ExclusivityColumns, type ExclusivityReading } from '../../shared/syncExclusivity'
import {
  foldFinding,
  refusalRetracted,
  type TermsColumns,
  type TermsFinding,
} from '../../shared/syncTerms'
import type { Env } from '../types'

type Entry = typeof opportunities.$inferSelect
type Target = typeof syncTargets.$inferSelect

const policyOf = (entry: Entry): TermsColumns => ({
  submissionPolicy: entry.submissionPolicy,
  policyEvidence: entry.policyEvidence,
  policyUrl: entry.policyUrl,
  policyCheckedAt: entry.policyCheckedAt,
  policyOverriddenAt: null,
})

const exclusivityOf = (entry: Entry): ExclusivityColumns => ({
  exclusivity: entry.exclusivity,
  exclusivityEvidence: entry.exclusivityEvidence,
  exclusivityUrl: entry.exclusivityUrl,
  termsReadAt: entry.termsReadAt,
})

/**
 * A stored row's state, said as a finding, for the pass that mirrors without
 * reading a site. The row's evidence is carried verbatim: a refusal keeps its
 * sentence and a silent or unreachable read keeps what was done.
 */
export function findingOfRow(row: Pick<Target, 'submissionPolicy' | 'policyEvidence' | 'policyUrl'>): TermsFinding {
  const quote = row.policyEvidence ?? ''
  if (row.submissionPolicy === 'closed' || row.submissionPolicy === 'open') {
    return { policy: row.submissionPolicy, quote, url: row.policyUrl, note: quote }
  }
  return { policy: null, quote: null, url: row.policyUrl, note: quote }
}

export interface OrgTermsInput {
  /** The target's own website, which fills the entry's only when that is empty. */
  site: string | null
  finding: TermsFinding
  /** When the policy was read. Not `now` for a row mirrored without a read. */
  checkedAt: string
  /** What the pages said about exclusivity. Ignored unless `read`. */
  exclusivity: (ExclusivityReading & { url: string | null }) | null
  /** Whether any page was actually read. A site that would not open is not a read. */
  read: boolean
}

/**
 * Fold one reading into one catalog entry. Does nothing for an entry that is not
 * a sync organisation, and nothing at all for a tenant that is not the owner.
 */
export async function recordOrgTerms(
  env: Env,
  tenant: TenantId,
  entryId: number,
  input: OrgTermsInput,
): Promise<boolean> {
  if (!(await isOwnerTenant(env, tenant))) return false
  const db = getDb(env.DB)
  const entry = await db.select().from(opportunities).where(eq(opportunities.id, entryId)).get()
  if (!entry || entry.category !== 'sync') return false

  // A refusal the current rules would not have made is withdrawn here for the
  // reason it is on the artist's row: nothing else could, since automation only
  // ever moves toward caution.
  const cleared = entry.submissionPolicy === 'closed' && refusalRetracted(entry.policyEvidence)
  const before: TermsColumns = cleared
    ? { ...policyOf(entry), submissionPolicy: null, policyEvidence: null, policyUrl: null, policyCheckedAt: null }
    : policyOf(entry)

  const policy = foldFinding(before, input.finding, input.checkedAt)
  const exclusivity = input.read
    ? foldExclusivity(exclusivityOf(entry), input.exclusivity, input.checkedAt)
    : exclusivityOf(entry)

  await db
    .update(opportunities)
    .set({
      site: entry.site ?? input.site,
      submissionPolicy: policy.submissionPolicy,
      policyEvidence: policy.policyEvidence,
      policyUrl: policy.policyUrl,
      policyCheckedAt: policy.policyCheckedAt,
      exclusivity: exclusivity.exclusivity,
      exclusivityEvidence: exclusivity.exclusivityEvidence,
      exclusivityUrl: exclusivity.exclusivityUrl,
      termsReadAt: exclusivity.termsReadAt,
    })
    .where(eq(opportunities.id, entryId))
  return true
}

/**
 * Put what the owner's targets already say onto their catalog entries, with no
 * network. The targets read before this existed would otherwise stay invisible
 * to a new account until their sites came up for a re-read, which is sixty days.
 *
 * Returns how many entries were written.
 */
export async function mirrorTargetTerms(env: Env, tenant: TenantId): Promise<number> {
  if (!(await isOwnerTenant(env, tenant))) return 0
  const rows = await getDb(env.DB)
    .select()
    .from(syncTargets)
    .where(scoped(syncTargets, tenant, isNotNull(syncTargets.opportunityId), isNotNull(syncTargets.policyCheckedAt)))

  let written = 0
  for (const row of rows) {
    if (row.opportunityId === null || !row.policyCheckedAt) continue
    const done = await recordOrgTerms(env, tenant, row.opportunityId, {
      site: row.website,
      finding: findingOfRow(row),
      checkedAt: row.policyCheckedAt,
      exclusivity: null,
      // No pages were read by this pass, so exclusivity is left exactly as it was.
      read: false,
    })
    if (done) written++
  }
  return written
}

/**
 * The owner's targets whose catalog entry has never been looked at for
 * exclusivity. A read of a site that would not open does not count as a look,
 * so these come round again; the caller keeps that from being every night.
 */
export async function targetsUnreadForExclusivity(env: Env, tenant: TenantId): Promise<Target[]> {
  if (!(await isOwnerTenant(env, tenant))) return []
  const db = getDb(env.DB)
  const rows = await db
    .select()
    .from(syncTargets)
    .where(scoped(syncTargets, tenant, isNotNull(syncTargets.opportunityId)))
  const ids = rows.map((r) => r.opportunityId).filter((id): id is number => id !== null)
  if (ids.length === 0) return []

  const unread = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(and(inArray(opportunities.id, ids), eq(opportunities.category, 'sync'), isNull(opportunities.termsReadAt)))
  const unreadIds = new Set(unread.map((r) => r.id))
  return rows.filter((r) => r.opportunityId !== null && unreadIds.has(r.opportunityId))
}
