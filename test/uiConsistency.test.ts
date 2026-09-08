import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-level guards for mistakes that typecheck and render fine.
 *
 * Both of these shipped at least once: a hover state that was a no-op because
 * it named the colour the element already had, and the same input class string
 * declared under three names in five files.
 */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return tsxFiles(p)
    return p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : []
  })
}

const FILES = tsxFiles('frontend/src')

describe('no dead hover states', () => {
  it('never sets hover:bg-X on an element already painted bg-X', () => {
    const offenders: string[] = []
    for (const file of FILES) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/"([^"]*)"/g)) {
          const cls = m[1]
          const bg = new Set([...cls.matchAll(/(?<!hover:)\bbg-([a-z0-9-]+)\b/g)].map((x) => x[1]))
          const hov = new Set([...cls.matchAll(/hover:bg-([a-z0-9-]+)\b/g)].map((x) => x[1]))
          for (const same of [...bg].filter((b) => hov.has(b))) {
            offenders.push(`${file}:${i + 1} bg-${same} + hover:bg-${same}`)
          }
        }
      })
    }
    expect(offenders).toEqual([])
  })
})

describe('form controls come from one place', () => {
  it('has no per-page copy of the input class string', () => {
    const copies = FILES.filter(
      (f) =>
        !f.includes('/ui/') &&
        /border border-line-strong rounded-md[^'"]*focus:ring-accent/.test(readFileSync(f, 'utf8')),
    )
    expect(copies).toEqual([])
  })
})

/**
 * The decision surfaces must not keep their own list of gig statuses.
 *
 * Both of them did, and both were wrong. The Review pane's action bar offered
 * a fixed four — Will apply, Applied, Pass, Archive — whatever the row's
 * status was, and the Overview deck resolved its intents through a flat table
 * in the browser. `PATCH /api/gigs/:id` validates against `nextGigStatuses`,
 * so on a submitted gig every button in the bar returned a 400, and on an
 * invited one there was no way to record a booking at all. Nothing typechecked
 * wrong and nothing rendered wrong; you only found out by clicking.
 *
 * The rule: a screen that offers a gig transition asks the pipeline which ones
 * exist. Naming one inline is how the two drift apart again.
 */
describe('gig transitions are asked for, not listed', () => {
  const read = (f: string) => readFileSync(f, 'utf8')

  it('the review action bar writes no gig status it chose itself', () => {
    const src = read('frontend/src/pages/review/DecisionBar.tsx')
    // `onGig({ status: 'shortlisted' })` and its three siblings were the bug:
    // a fixed four buttons offered whatever the row's status was, while
    // `PATCH /api/gigs/:id` validates against `nextGigStatuses`. On a
    // submitted gig every one of them returned a 400; on an invited one there
    // was no way to record a booking at all. Nothing typechecked wrong and
    // nothing rendered wrong — you found out by clicking.
    expect(src).not.toMatch(/onGig\(\{\s*status:\s*['"`]/)
    expect(src).toContain('nextGigStatuses')
  })

  it('the overview deck resolves gig intents through the shared table', () => {
    const src = read('frontend/src/components/DecisionDeck.tsx')
    // The gig column of STATUS_BY_INTENT used to live here, in the browser,
    // where nothing could consult the pipeline. It belongs beside the copy
    // that decides which actions a card may offer.
    expect(src).toContain('gig: GIG_STATUS_BY_INTENT')
    expect(src).not.toMatch(/gig:\s*\{/)
  })

  it('the timing strip asks whether a move is legal rather than listing it', () => {
    expect(read('frontend/src/components/TimingStrip.tsx')).toContain('isGigTransitionAllowed')
  })
})
