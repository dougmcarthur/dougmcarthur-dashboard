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

/**
 * The application panel drafts; it never submits.
 *
 * An application filed by automation is a good way to be blacklisted, so
 * phase 3's output is text you copy into somebody else's form by hand. That is
 * a rule about what the *screen* offers as much as about what the Worker does:
 * a button labelled "Submit" would be a promise the app has no intention of
 * keeping, and the one that says "Copy" is the whole design.
 */
describe('the application panel offers to copy, never to send', () => {
  const src = readFileSync('frontend/src/pages/gigs/ApplicationPanel.tsx', 'utf8')

  it('has no button that claims to send the application', () => {
    // Button labels, not prose: `>Submit<`, `>Send draft<`, `label="Submit"`.
    const offenders = [...src.matchAll(/(?:>|label=")\s*(Submit|Send|Apply now)\b/g)].map((m) => m[1])
    expect(offenders).toEqual([])
  })

  it('offers copying instead', () => {
    expect(src).toContain('navigator.clipboard.writeText')
  })
})

describe('the cost panel shows a range, and never a blended score', () => {
  const src = readFileSync('frontend/src/pages/gigs/CostPanel.tsx', 'utf8')

  it('renders every figure through formatCostRange', () => {
    // A midpoint on screen is the failure this whole module is shaped to
    // avoid: `$1,847` is a lie with a decimal place. Any number reaching the
    // page goes through the formatter that cannot print one.
    expect(src).toContain('formatCostRange(estimate.net)')
    expect(src).toContain('formatCostRange(line.amount)')
  })

  it('names no score, value or efficiency', () => {
    // Step F's scoring half is not built. A panel that showed a single number
    // beside the cost would be claiming five weights nobody has been asked
    // for — and "both numbers are always shown" is the rule that stops a 78
    // hiding a $4,000 trip. See docs/gig-pipeline-plan.md §7.
    expect(src).not.toMatch(/\b(efficiency|weightedValue|totalScore)\b/)
  })

  it('marks a band it guessed rather than showing it as recorded', () => {
    expect(src).toContain('line.inferred')
    expect(src).toContain('estimate.unknowns')
  })
})

describe('the source panel previews before it writes', () => {
  const src = readFileSync('frontend/src/pages/artist/SourcePanel.tsx', 'utf8')

  it('reads the preview endpoint before it can call the writing one', () => {
    // Two calls, and the write is behind a button that only exists once the
    // preview has come back. A "read the documents" button that inserted
    // thirty rows on the first click would be the same mistake as an
    // application panel with a Send button: the confirmation step is the
    // feature, not the friction.
    expect(src).toContain('api.artist.sourcePreview()')
    expect(src).toContain('api.artist.source()')
    const writeAt = src.indexOf('api.artist.source()')
    const previewAt = src.indexOf('api.artist.sourcePreview()')
    expect(previewAt).toBeLessThan(writeAt)
  })

  it('says what it could not file rather than only what it could', () => {
    expect(src).toContain('data.skipped')
  })

  it('says out loud that nothing added here has been reviewed', () => {
    expect(src).toMatch(/never reviewed/)
  })
})

describe('no fixture reads the clock', () => {
  // The failure this guards has now cost two deploys. `offset()` in
  // reviewQueue.test.ts counted from local midnight and serialised it as UTC,
  // while the queue read UTC directly — identical in Winnipeg, one day out
  // under `TZ=Pacific/Auckland`, and so it passed locally and failed in CI on
  // somebody else's change. A fixture must be relative to its own TODAY.
  const testFiles = readdirSync('test')
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join('test', f))

  it('never calls new Date() or Date.now() with no argument', () => {
    const offenders: string[] = []
    for (const file of testFiles) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return
        // Quoted text first — a test *named* after this mistake is not the
        // mistake, and this file contains exactly that.
        const code = line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''")
        if (/\bnew Date\(\s*\)|\bDate\.now\(\s*\)/.test(code)) {
          offenders.push(`${file}:${i + 1} — ${line.trim()}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
