import { describe, it, expect } from 'vitest'
import { consentSteps } from '../shared/surveyConsent'
import { CONSENT } from '../shared/surveyInstrument'

/**
 * The welcome is one paragraph to a screen. These hold the two things that can
 * go wrong quietly when it is split up: a point of the notice that never gets a
 * screen, and the notice growing back into a wall of text under a heading.
 */

const words = (s: string) => s.trim().split(/\s+/).length

describe('the welcome steps', () => {
  const steps = consentSteps(CONSENT.points.length)

  it('opens on the welcome and ends on the agreement, and no other step is either', () => {
    expect(steps[0]).toEqual({ kind: 'welcome' })
    expect(steps[steps.length - 1]).toEqual({ kind: 'agree' })
    expect(steps.filter((s) => s.kind === 'welcome')).toHaveLength(1)
    expect(steps.filter((s) => s.kind === 'agree')).toHaveLength(1)
  })

  it('gives every point of the notice exactly one screen, in order', () => {
    const shown = steps.flatMap((s) => (s.kind === 'point' ? [s.index] : []))
    expect(shown).toEqual(CONSENT.points.map((_, i) => i))
  })

  it('grows with the notice, so a point added later cannot be left without a screen', () => {
    for (const n of [0, 1, 5, 9]) expect(consentSteps(n)).toHaveLength(n + 2)
  })
})

describe('what each welcome screen says', () => {
  it('heads every point with a whole sentence, since the heading is all there is above its paragraph', () => {
    for (const p of CONSENT.points) {
      expect(p.lead.en, p.lead.en).toMatch(/^[A-Z][^]*[.?]$/)
      expect(words(p.lead.en), p.lead.en).toBeGreaterThanOrEqual(3)
    }
    expect(CONSENT.confirm.en).toMatch(/^[A-Z][^]*[.?]$/)
  })

  it('keeps each paragraph to what fits a phone screen at a readable size', () => {
    expect(words(CONSENT.intro.en)).toBeLessThanOrEqual(80)
    for (const p of CONSENT.points) expect(words(p.body.en), p.lead.en).toBeLessThanOrEqual(80)
  })

  it('has no em dash in anything a respondent reads here', () => {
    const all = [CONSENT.title, CONSENT.lede, CONSENT.intro, CONSENT.confirm, CONSENT.agree]
      .map((t) => t.en)
      .concat(CONSENT.points.flatMap((p) => [p.lead.en, p.body.en]))
    for (const s of all) expect(s, s).not.toContain('\u2014')
  })
})
