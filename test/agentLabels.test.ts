import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { titleLabel } from '../shared/humanise'
import { buildReviewQueue } from '../shared/reviewQueue'

/**
 * Two labels on the Gigs and Promo screens that were wrong in production.
 *
 * Promo: the research agents name what they file, and three drafts arrived
 * titled like files (`august-show-run-social`), which the screen printed as
 * written. A title with a space in it was written for a person and stays as it
 * is; only a whole value that is one slug is turned into words.
 *
 * Fee: `paid` is what the artist pays to be considered (the edit form says
 * "Costs money to enter"). The fee cell had been changed to say "pays artists",
 * the opposite, so a CAD 100 entry fee read as pay. It also drew in the green
 * that means good news.
 */

describe('titleLabel', () => {
  it('turns a slug into words', () => {
    expect(titleLabel('august-show-run-social')).toBe('August show run social')
    expect(titleLabel('album-update-newsletter-blurb')).toBe('Album update newsletter blurb')
    expect(titleLabel('magic_august_disconnect_social')).toBe('Magic august disconnect social')
  })

  it('leaves a title somebody wrote for a person exactly as written', () => {
    expect(titleLabel('Social caption: spring show, Apr 4')).toBe('Social caption: spring show, Apr 4')
    expect(titleLabel("What's cooking")).toBe("What's cooking")
    expect(titleLabel('Delegate mode at BreakOut West')).toBe('Delegate mode at BreakOut West')
  })

  it('leaves a single word and a hyphenated phrase with spaces alone', () => {
    expect(titleLabel('Magic')).toBe('Magic')
    expect(titleLabel('Year-end recap for December')).toBe('Year-end recap for December')
  })

  it('says nothing for nothing', () => {
    expect(titleLabel(null)).toBe('')
    expect(titleLabel('  ')).toBe('')
  })
})

describe('where a promo title reaches a person', () => {
  it('is a readable title in the Review queue and on the Overview deck', () => {
    const queue = buildReviewQueue({
      promo: [
        { id: 1, month: '2026-08', title: 'august-show-run-social', content: 'x', status: 'draft', createdAt: '2026-08-01' },
      ],
      today: '2026-11-17',
    })
    expect(queue.map((i) => i.title)).toEqual(['August show run social'])
  })

  it('is read through titleLabel on the Promo page', () => {
    const page = readFileSync('frontend/src/pages/PromoDraftsPage.tsx', 'utf8')
    expect(page).toContain('titleLabel(draft.title)')
    // The raw field is only ever read once, to be turned into words.
    expect(page.match(/draft\.title/g)).toHaveLength(1)
  })
})

describe('the fee cell', () => {
  const page = readFileSync('frontend/src/pages/GigsPage.tsx', 'utf8')
  const cell = page.slice(page.indexOf('function FeeCell'), page.indexOf('function GigActions'))

  it('says a flagged fee costs money to enter, never that the gig pays artists', () => {
    expect(cell).toContain('costs to enter')
    expect(page).not.toContain('pays artists')
  })

  it('does not draw a cost in the colour that means good news', () => {
    expect(cell).not.toContain('text-success-fg')
  })
})

describe('the agent is asked for a readable title', () => {
  it('in the tool it is handed and in the routine it follows', () => {
    const tools = readFileSync('scripts/agents/tools.ts', 'utf8')
    const prompt = readFileSync('scripts/agents/prompts/monthly-promo-checkin.md', 'utf8')
    expect(tools).toContain('Not a file name or slug')
    expect(prompt).toContain('never a file name')
  })
})
