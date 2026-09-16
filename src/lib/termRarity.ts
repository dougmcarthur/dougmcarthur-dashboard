/**
 * Measure how common a word is in this mailbox, and remember the answer.
 *
 * Gmail's `messages.list` returns `resultSizeEstimate`, so one search per term
 * reports roughly how many messages contain it. That is document frequency,
 * measured against the corpus that actually matters — the artist's own mail —
 * with no index to maintain and no dependency. `shared/termRarity.ts` turns
 * the numbers into weight; this file gets the numbers.
 *
 * **Cached, because rarity moves slowly.** "winnipeg" will still be common
 * next month. A month's cache turns tens of requests per scan into tens per
 * month, and a term the cache does not hold is simply unmeasured, which scores
 * the way the matcher did before any of this existed.
 *
 * Platform-level rather than per-tenant, and that is the same reasoning the
 * reply scan itself uses: there is one `GMAIL_REFRESH_TOKEN` pointing at one
 * inbox, so "how common is this word in the mailbox" has one answer. When a
 * second artist has a mailbox of their own, this moves with the scan.
 */

import { accessToken } from './gmailReplies'
import { readSetting, writeSetting } from './settings'
import type { RarityIndex } from '../../shared/termRarity'
import type { Env } from '../types'
import type { GmailEnv } from './gmail'

const SETTING_KEY = 'termRarity'

/** A word's share of a mailbox does not change quickly. */
const CACHE_DAYS = 30

/**
 * How far back to measure. The same year for every term, so the counts are
 * comparable — measuring one term over a year and another over a month would
 * make the second look rare for the wrong reason.
 */
const CORPUS_QUERY = 'newer_than:365d'

interface StoredIndex {
  corpusSize: number | null
  counts: Record<string, number>
  /** ISO, per term, so one stale word does not expire the rest. */
  measuredAt: Record<string, string>
}

function emptyIndex(): StoredIndex {
  return { corpusSize: null, counts: {}, measuredAt: {} }
}

async function read(env: Env): Promise<StoredIndex> {
  const raw = await readSetting(env, SETTING_KEY)
  if (!raw) return emptyIndex()
  try {
    const parsed = JSON.parse(raw) as StoredIndex
    return parsed && typeof parsed === 'object' && parsed.counts ? parsed : emptyIndex()
  } catch {
    // Unreadable JSON reads as "nothing measured" rather than as an error, the
    // treatment `blocked_on` gets: a record nobody can parse is not entitled
    // to make a claim, and the matcher's unmeasured path is perfectly fine.
    return emptyIndex()
  }
}

function stale(measuredAt: string | undefined, now: Date): boolean {
  if (!measuredAt) return true
  const then = Date.parse(measuredAt)
  if (Number.isNaN(then)) return true
  return now.getTime() - then > CACHE_DAYS * 86_400_000
}

/** One search, for the count only. `maxResults=1` so Gmail returns no payload. */
async function estimate(token: string, q: string, fetchImpl: typeof fetch): Promise<number | null> {
  const res = await fetchImpl(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q, maxResults: '1' })}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return null
  const json = await res.json<{ resultSizeEstimate?: number }>()
  return typeof json.resultSizeEstimate === 'number' ? json.resultSizeEstimate : null
}

/**
 * Bring the index up to date for the terms about to be matched on, and hand
 * back what the matcher takes.
 *
 * Failure is not an error here: an unmeasured term scores as it always did, so
 * a Gmail outage costs precision rather than the scan.
 */
export async function rarityIndexFor(
  env: Env & Partial<GmailEnv>,
  terms: string[],
  now: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<RarityIndex | null> {
  const wanted = [...new Set(terms.map((t) => t.toLowerCase()).filter((t) => t.length >= 3))]
  if (wanted.length === 0) return null

  const index = await read(env)
  const missing = wanted.filter((t) => stale(index.measuredAt[t], now))
  const needsCorpus = index.corpusSize === null || stale(index.measuredAt['__corpus__'], now)

  if (missing.length === 0 && !needsCorpus) {
    return { counts: index.counts, corpusSize: index.corpusSize }
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
    return { counts: index.counts, corpusSize: index.corpusSize }
  }

  try {
    const token = await accessToken(env as GmailEnv, fetchImpl)
    const iso = now.toISOString()

    if (needsCorpus) {
      const total = await estimate(token, CORPUS_QUERY, fetchImpl)
      if (total !== null) {
        index.corpusSize = total
        index.measuredAt['__corpus__'] = iso
      }
    }

    for (const term of missing) {
      const n = await estimate(token, `${CORPUS_QUERY} "${term.replace(/"/g, '')}"`, fetchImpl)
      if (n === null) continue
      index.counts[term] = n
      index.measuredAt[term] = iso
    }

    await writeSetting(env, SETTING_KEY, JSON.stringify(index))
  } catch (err) {
    // Precision, not correctness. Say so and carry on with what is cached.
    console.error('term rarity measurement failed:', err)
  }

  return { counts: index.counts, corpusSize: index.corpusSize }
}
