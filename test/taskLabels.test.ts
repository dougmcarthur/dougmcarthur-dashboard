import { describe, it, expect } from 'vitest'
import { TASK_LABELS, taskLabel } from '../shared/taskLabels'

describe('taskLabel', () => {
  it('names the tasks that exist', () => {
    expect(taskLabel('gig-festival-scan')).toBe('Gig research')
    expect(taskLabel('sync-pitch-research')).toBe('Sync licensing research')
    expect(taskLabel('monthly-promo-checkin')).toBe('Monthly promo check-in')
  })

  it('humanises an id it has never seen', () => {
    // The agents live outside this repo and send whatever task_id they like.
    // A lookup table alone renders the next new one as a slug again.
    expect(taskLabel('press-photo-audit')).toBe('Press photo audit')
    expect(taskLabel('some_new_agent')).toBe('Some new agent')
  })

  it('uses sentence case, because these appear mid-sentence', () => {
    // "Gig research has not run in 28 days" is English. "Gig Research Has Not
    // Run" is a headline pretending to be one.
    expect(taskLabel('a-b-c')).toBe('A b c')
  })

  it('never returns an empty label', () => {
    expect(taskLabel('')).toBe('An automated task')
    expect(taskLabel('   ')).toBe('An automated task')
    expect(taskLabel('--')).toBe('An automated task')
  })

  it('leaves no known id rendering as its own slug', () => {
    // Shape, not punctuation: "Monthly promo check-in" is a hyphenated
    // English phrase and perfectly fine. What must never appear is the
    // all-lowercase-hyphenated form an identifier takes.
    const SLUG = /^[a-z0-9]+([-_][a-z0-9]+)+$/
    for (const [id, label] of Object.entries(TASK_LABELS)) {
      expect(label, id).not.toMatch(SLUG)
      expect(label, id).not.toBe(id)
    }
  })
})

import { runTitle } from '../src/routes/taskRuns'

/**
 * The title a finished run puts in the bell.
 *
 * Stored verbatim on the `notification_events` row, so whatever this returns
 * is what somebody reads — and what they read for the next thirty days,
 * because that is the retention window. Worth a test for that reason alone.
 */
describe('runTitle', () => {
  it('names the task rather than identifying it', () => {
    expect(runTitle('gig-festival-scan', 'ok', 3)).toBe('Gig research added 3 items')
    expect(runTitle('gig-festival-scan', 'ok', 1)).toBe('Gig research added 1 item')
    expect(runTitle('gig-festival-scan', 'ok', 0)).toBe('Gig research ran, nothing new')
  })

  it('reads as a sentence when a run fails', () => {
    // The old copy was "gig-festival-scan run failed" — an identifier and a
    // grammar mistake in five words.
    expect(runTitle('gig-festival-scan', 'failed', 0)).toBe('Gig research failed')
    expect(runTitle('sync-pitch-research', 'incomplete', 0)).toBe('Sync licensing research finished incomplete')
  })

  it('never prints a slug, even for an agent nobody has heard of', () => {
    const title = runTitle('brand-new-agent', 'ok', 2)
    expect(title).toBe('Brand new agent added 2 items')
    expect(title).not.toContain('brand-new-agent')
  })
})
