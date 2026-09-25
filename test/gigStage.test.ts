import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  GIG_START_STATUS,
  flagLabel,
  gigFlag,
  gigMoves,
  gigOutcome,
  gigStage,
  gigStageLabel,
  statusesInStage,
} from '../shared/gigStage'
import { GIG_STATUSES, isGigTransitionAllowed, normaliseGigStatus } from '../shared/gigStatus'

/**
 * Four stages over fourteen stored statuses. The stored vocabulary did not
 * move (the agents POST it from outside this repo), so what is pinned here is
 * that the view over it is total, agrees with the pipeline, and is the only
 * vocabulary a screen shows.
 */

describe('every stored status has one stage', () => {
  it('maps the three phases and the end', () => {
    expect(gigStage('discovered')).toBe('new')
    expect(['shortlisted', 'preparing'].map(gigStage)).toEqual(['in_progress', 'in_progress'])
    expect(['submitted', 'acknowledged', 'info_requested', 'invited'].map(gigStage)).toEqual(
      Array(4).fill('applied'),
    )
    expect(['booked', 'declined', 'passed', 'expired', 'withdrawn', 'archived'].map(gigStage)).toEqual(
      Array(6).fill('closed'),
    )
  })

  it('reads legacy and stage spellings the same way', () => {
    expect(gigStage('approved')).toBe('in_progress')
    expect(normaliseGigStatus('in_progress')).toBe('shortlisted')
    expect(normaliseGigStatus('applied')).toBe('submitted')
    expect(normaliseGigStatus('new')).toBe('discovered')
  })

  it('filters by stage over every spelling a row might carry', () => {
    expect(statusesInStage('in_progress')).toEqual(expect.arrayContaining(['shortlisted', 'preparing', 'approved']))
    for (const stage of ['new', 'in_progress', 'applied', 'closed'] as const) {
      for (const s of statusesInStage(stage)) expect(gigStage(s)).toBe(stage)
    }
  })
})

describe('what a closed gig says', () => {
  it('names its outcome, and green is only for accepted', () => {
    expect(gigStageLabel('booked').label).toBe('Accepted')
    expect(gigStageLabel('declined').label).toBe('Not selected')
    expect(gigStageLabel('expired').label).toBe('Missed')
    // Archived never said why, and the label does not guess.
    expect(gigOutcome('archived')).toBeNull()
    expect(gigStageLabel('archived').label).toBe('Closed')
  })
})

describe('an offer is a flag, not an outcome', () => {
  it('keeps an invited gig Applied, and says the contract is what is pending', () => {
    expect(gigStage('invited')).toBe('applied')
    expect(gigFlag('invited')).toBe('offer_pending')
    expect(flagLabel('offer_pending', 'Festival')).toBe('Offer — contract pending')
    expect(flagLabel('offer_pending', 'Grant')).toBe('Offer — awaiting confirmation')
  })

  it('makes a signed contract the only way to Accepted', () => {
    const into = GIG_STATUSES.filter((s) => gigMoves(s).some((m) => m.to === 'booked'))
    expect(into).toEqual(['invited'])
    expect(gigMoves('invited', 'Showcase').find((m) => m.to === 'booked')?.label).toBe('Contract signed')
    expect(gigMoves('invited', 'Grant').find((m) => m.to === 'booked')?.label).toBe('Award confirmed')
  })

  it('clears "they need more" with Answered, which stays Applied', () => {
    const answered = gigMoves('info_requested').find((m) => m.label === 'Answered')
    expect(answered?.to).toBe('acknowledged')
    expect(gigStage(answered!.to)).toBe('applied')
  })
})

describe('moves are the pipeline, in the stage language', () => {
  it('never offers a move the PATCH route would refuse, or one that goes nowhere', () => {
    for (const from of GIG_STATUSES) {
      for (const move of gigMoves(from)) {
        expect(isGigTransitionAllowed(from, move.to), `${from} → ${move.to}`).toBe(true)
        expect(move.to).not.toBe(from)
      }
    }
  })

  it('offers nothing a person no longer does: preparing and archiving', () => {
    for (const from of GIG_STATUSES) {
      const targets = gigMoves(from).map((m) => m.to)
      expect(targets).not.toContain('preparing')
      expect(targets).not.toContain('archived')
    }
  })

  it('changes stage inside In progress only by confirming it went out', () => {
    const forward = gigMoves('shortlisted').filter((m) => gigStage(m.to) !== 'closed')
    expect(forward.map((m) => m.label)).toEqual(['Mark as submitted'])
  })

  it('starts a new gig in one of three stages, never closed', () => {
    expect(Object.keys(GIG_START_STATUS)).toEqual(['new', 'in_progress', 'applied'])
  })
})

describe('screens show stages, never stored statuses', () => {
  const FRONTEND = fileURLToPath(new URL('../frontend/src', import.meta.url))
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? files(full) : /\.tsx?$/.test(full) ? [full] : []
    })

  it('lists no stored status and renders no stored label', () => {
    // A picker over GIG_STATUSES is the fourteen-item dropdown this replaced,
    // and a stored label is a word the stage layer no longer uses.
    for (const file of files(FRONTEND)) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(/GIG_STATUSES|GIG_STATUS_META|gigStatusMeta\(/)
    }
  })
})
