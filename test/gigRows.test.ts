import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GIG_STATUSES } from '../shared/gigStatus'
import { gigStatusFromStored, storedGigState } from '../shared/gigStage'
import { readGig } from '../src/db/gigRows'

/**
 * Storage holds a stage, an outcome and a flag (migration 0030); the code
 * reasons in fourteen statuses. The translation happens in src/db/gigRows.ts,
 * and a query that skips it reads `closed` as a gig nobody has looked at — so
 * this pins the round trip and that no query goes around it.
 */

describe('the round trip', () => {
  it('brings every status back as itself, except the two that were never phases', () => {
    for (const s of GIG_STATUSES) {
      const back = gigStatusFromStored(storedGigState(s))
      const expected = s === 'preparing' ? 'shortlisted' : s === 'acknowledged' ? 'submitted' : s
      expect(back, s).toBe(expected)
    }
  })

  it('stores the stage in status, with the outcome and the flag beside it', () => {
    expect(storedGigState('booked')).toEqual({ status: 'closed', outcome: 'accepted', flag: null })
    expect(storedGigState('invited')).toEqual({ status: 'applied', outcome: null, flag: 'offer_pending' })
    expect(storedGigState('info_requested')).toEqual({ status: 'applied', outcome: null, flag: 'reply_owed' })
    expect(storedGigState('archived')).toEqual({ status: 'closed', outcome: null, flag: null })
    // What the agents POST still lands where it should.
    expect(storedGigState('approved')).toEqual({ status: 'in_progress', outcome: null, flag: null })
  })

  it('reads a row written before migration 0030 exactly as it did', () => {
    expect(readGig({ status: 'declined', outcome: null, flag: null }).status).toBe('declined')
    expect(readGig({ status: 'approved' }).status).toBe('shortlisted')
  })

  it('never reads a closed row as new', () => {
    expect(readGig({ status: 'closed', outcome: 'passed', flag: null }).status).toBe('passed')
    expect(readGig({ status: 'closed', outcome: null, flag: null }).status).toBe('archived')
  })
})

describe('no query goes around the translation', () => {
  const SRC = fileURLToPath(new URL('../src', import.meta.url))
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : []
    })

  /**
   * Files that read gig rows without their status, each with its reason.
   * A count or a list of calendar ids has no status to translate.
   */
  const EXEMPT: Record<string, string> = {
    'lib/usage.ts': 'counts rows, reads no column',
    'lib/tenantRemoval.ts': 'counts and deletes by tenant',
    'db/schema.ts': 'declares the table',
  }

  it('translates every select from gig_opportunities', () => {
    for (const file of files(SRC)) {
      const rel = relative(SRC, file)
      const src = readFileSync(file, 'utf8')
      if (!/\.from\(gigOpportunities\)/.test(src) || EXEMPT[rel]) continue
      // Either the file translates what it reads, or every select in it names
      // its columns and none of them is `status`.
      const translates = /readGigs?\(|\.then\(readGigs\)|gigStatusFromStored\(/.test(src)
      const selectsStatusRaw = /\.select\(\)\s*\.from\(gigOpportunities\)|gigOpportunities\.status/.test(src)
      expect(translates || !selectsStatusRaw, `${rel} reads gig rows without src/db/gigRows.ts`).toBe(true)
    }
  })

  it('never writes a status string into the column directly', () => {
    for (const file of files(SRC)) {
      const src = readFileSync(file, 'utf8')
      if (!/(insert|update)\(gigOpportunities\)/.test(src)) continue
      expect(src, relative(SRC, file)).not.toMatch(/updates\.status\s*=|status:\s*normaliseGigStatus\(b\.status\)/)
    }
  })
})
