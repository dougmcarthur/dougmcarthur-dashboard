/**
 * The survey's published summary: one snapshot, in `app_settings`, that the
 * owner reviews and then publishes, and that the public results page reads.
 *
 * It is a stored snapshot and never a view of the responses, for the reason the
 * notice gives: respondents are told that a small group is never reported, and
 * a page computed on every visit would report one the moment the tenth person
 * in a category had not yet answered. What is public is what somebody looked at
 * and pressed a button on. `shared/surveyPublic.ts` builds it from an allow-list
 * and has the rules; this file keeps it and says whether it has gone stale.
 *
 * A settings row rather than a table: there is at most one, it is a few
 * kilobytes, it is replaced whole, and it has no relation to any response.
 * Absent means nothing is published, which is where a deployment starts.
 */

import { clearSetting, readSetting, writeSetting } from './settings'
import { PUBLIC_VERSION, type PublicResults } from '../../shared/surveyPublic'
import type { Env } from '../types'

export const PUBLICATION_KEY = 'survey.published'

/** What the owner's screen knows about what is public, without carrying the page. */
export interface PublicationSummary {
  publishedAt: string
  n: number
  leftOut: PublicResults['leftOut']
  /** Responses have come in, or the exclusions changed, since this was published. */
  outOfDate: boolean
}

/**
 * The stored snapshot, or null. A row that will not parse, or was written by a
 * version of the page this code does not know, is treated as nothing published:
 * an unreadable page is worse than an honest "not yet".
 */
export async function readPublication(env: Env): Promise<PublicResults | null> {
  const raw = await readSetting(env, PUBLICATION_KEY)
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<PublicResults> | null
    if (!v || v.version !== PUBLIC_VERSION || typeof v.n !== 'number' || typeof v.publishedAt !== 'string') return null
    return v as PublicResults
  } catch {
    return null
  }
}

export async function writePublication(env: Env, results: PublicResults): Promise<void> {
  await writeSetting(env, PUBLICATION_KEY, JSON.stringify(results))
}

export async function clearPublication(env: Env): Promise<void> {
  await clearSetting(env, PUBLICATION_KEY)
}

/**
 * A digest of everything in a snapshot except when it was built. The owner sees
 * a preview, then presses Publish; if responses arrive in between, what would be
 * published is no longer what was looked at, so the press carries the digest of
 * the preview and the Worker refuses when it has changed. What is reviewed is
 * what is shown.
 */
export async function fingerprint(results: PublicResults): Promise<string> {
  const { publishedAt: _, ...rest } = results
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(rest)))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function summarisePublication(published: PublicResults | null, current: PublicResults | null): Promise<PublicationSummary | null> {
  if (!published) return null
  return {
    publishedAt: published.publishedAt,
    n: published.n,
    leftOut: published.leftOut,
    // With nothing to compare against (too few responses to build a preview), the published page cannot be called stale.
    outOfDate: current ? (await fingerprint(published)) !== (await fingerprint(current)) : false,
  }
}
