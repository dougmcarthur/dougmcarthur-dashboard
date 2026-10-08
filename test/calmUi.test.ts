import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * What makes the app read as calm, held at source level.
 *
 * Each of these typechecks and renders, and each came back by itself in a
 * different screen until something failed. The owner has asked for the same
 * things more than once: no small capitals over a heading, no coloured bar down
 * the edge of a card, colour kept for what it means, and no more on the first
 * screen than the first screen needs. `test/surveyUi.test.ts` pins the survey
 * pages; this is the same for the rest of the app.
 */

const root = new URL('../frontend/src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(tsx|ts|css)$/.test(name) ? [path] : []
  })
}

const files = walk(root).map((path) => ({
  path,
  name: relative(root, path).replace(/\\/g, '/'),
  text: readFileSync(path, 'utf8').replace(/\r\n/g, '\n'),
}))

const read = (name: string) => {
  const f = files.find((x) => x.name === name)
  if (!f) throw new Error(`no ${name}`)
  return f.text
}

describe('no small capitals', () => {
  // Stage directions on a stage plot are part of the drawing, which prints:
  // UPSTAGE and AUDIENCE are conventions of the form, not a caption over a
  // heading.
  const ALLOWED = new Set(['pages/artist/StageCards.tsx'])

  it('does not set text in uppercase anywhere but a stage plot drawing', () => {
    const hits = files
      .filter((f) => !ALLOWED.has(f.name))
      .flatMap((f) =>
        f.text
          .split('\n')
          .map((line, i) => ({ f: f.name, line: i + 1, text: line }))
          // A comment may say the word; a class may not.
          .filter((l) => /\buppercase\b/.test(l.text) && !/^\s*(\*|\/\/|\/\*)/.test(l.text) && !/^\s*\*/.test(l.text)),
      )
    expect(hits.map((h) => `${h.f}:${h.line}`)).toEqual([])
  })

  it('does not put a house-mark caption over the sign-in heading', () => {
    for (const f of ['components/LoginScreen.tsx', 'components/JoinScreen.tsx']) {
      expect(read(f), f).toContain('Sun Dogs Music Scout</h1>')
    }
  })
})

describe('no coloured edge on a card or a row', () => {
  const EDGE = /border-[lt]-(?:\d|\[\d+px\])/
  const COLOUR = /\b(?:border-)?(?:accent|danger|warn|success)(?:-solid|-line|-fg)?\b/
  const COLOURED_SIDE = /border-[lt]-(?:accent|danger|warn|success)/

  // A diff marks which lines were added and removed, and the tint is not the
  // only thing saying so there: the removed ones are struck through. That is a
  // gutter carrying data, not a stripe decorating a card.
  const ALLOWED = new Set(['components/PitchDiff.tsx'])

  it('has no accent, clay, ochre or green bar down one side', () => {
    const hits = files
      .filter((f) => !ALLOWED.has(f.name))
      .flatMap((f) =>
        f.text
          .split('\n')
          .map((line, i) => ({ f: f.name, line: i + 1, text: line }))
          .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.text))
          .filter((l) => COLOURED_SIDE.test(l.text) || (EDGE.test(l.text) && COLOUR.test(l.text))),
      )
    expect(hits.map((h) => `${h.f}:${h.line}  ${h.text.trim().slice(0, 90)}`)).toEqual([])
  })
})

describe('clay is for what is broken or destructive', () => {
  it('does not paint a pass, a decline or a missed deadline as danger', () => {
    expect(read('pages/review/DecisionBar.tsx')).not.toMatch(/no:\s*'danger'/)
    expect(read('pages/review/DecisionBar.tsx')).not.toMatch(/label: 'Declined', variant: 'danger'/)
    expect(read('pages/GigsPage.tsx')).not.toMatch(/'good' : 'danger'/)
    expect(read('pages/SyncPage.tsx')).not.toContain('variant="danger"')
    expect(read('components/DecisionDeck.tsx')).not.toContain('border-danger-line text-danger-fg hover:bg-danger-bg')
  })
})

describe('the first screens carry less', () => {
  it('keeps the Review filters to four chips and one More control', () => {
    const src = read('pages/ReviewPage.tsx')
    const primary = /const PRIMARY_FILTERS[^=]*=\s*\[([^\]]*)\]/.exec(src)
    expect(primary, 'PRIMARY_FILTERS').not.toBeNull()
    expect(primary![1].split(',').filter((s) => s.trim()).length).toBeLessThanOrEqual(4)
    expect(src).toContain('aria-label="More filters"')
  })

  it('keeps the Artist page to six tabs, with the checklists as one', () => {
    const src = read('pages/ArtistPage.tsx')
    const block = /tabs=\{\[([\s\S]*?)\]\}/.exec(src)
    expect(block, 'tabs block').not.toBeNull()
    expect((block![1].match(/\{ id: '/g) ?? []).length).toBeLessThanOrEqual(6)
    expect(src).not.toContain('Checklist —')
  })

  it('opens the setup checklist as one line unless it is asked for', () => {
    expect(read('components/OnboardingCard.tsx')).toContain('useState(showDone)')
  })

  it('shows a gig row\'s inline move on hover and focus, not on every row at once', () => {
    expect(read('pages/GigsPage.tsx')).toContain('row-actions flex gap-1 justify-end')
  })

  it('does not count a deployment-wide block once per integration it blocks', () => {
    expect(read('components/IntegrationsCard.tsx')).not.toMatch(/!r\.serverReady\s*\|\|\s*rowNeedsAttention/)
  })
})
