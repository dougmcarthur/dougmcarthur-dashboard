import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Source-level guards for the Answers panel.
 *
 * Each is something that typechecks, renders and is wrong: a copy button that
 * says it copied when the clipboard refused, a second place to edit a library
 * entry, a request fired for a panel nobody is looking at, a header icon that
 * does not fit on a phone.
 */

const read = (f: string) => readFileSync(f, 'utf8')
const prose = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const panel = read('frontend/src/components/AnswersPanel.tsx')
const dock = read('frontend/src/components/SidePanel.tsx')
const layout = read('frontend/src/components/Layout.tsx')
const copy = read('frontend/src/components/CopyButton.tsx')

describe('copying', () => {
  it('goes through one button that reports whether the clipboard accepted it', () => {
    // "Copied" over a refused write is how whatever was already on the
    // clipboard, a stale bio, ends up in a form.
    expect(copy).toContain('catch')
    expect(copy).toContain("'Could not copy'")
    expect(prose('frontend/src/components/AnswersPanel.tsx')).not.toContain('navigator.clipboard')
    expect(panel).toContain('<CopyButton')
  })

  it('names what is copied, for a screen reader and for the second button on a row', () => {
    expect(panel).toMatch(/label=\{`Copy \$\{answer\.label\}`\}/)
    expect(panel).toMatch(/label=\{`Copy \$\{extra\.label\.toLowerCase\(\)\} for \$\{answer\.label\}`\}/)
  })

  it('announces the result outside the button, which has its own name', () => {
    expect(copy).toContain('role="status"')
  })
})

describe('what the panel does to the library', () => {
  it('reads it and nothing else', () => {
    // A second place to edit an entry is a second place for it to be wrong. The
    // panel says what is wrong and where to go.
    const code = prose('frontend/src/components/AnswersPanel.tsx')
    expect(code).not.toMatch(/api\.artist\.(patch|create|delete|reviewed|source)/)
    expect(code).toContain('api.artist.answers')
  })

  it('says what is wrong in words and with an icon, not by colour alone', () => {
    expect(panel).toContain('answer.warning.text')
    expect(panel).toContain('name="alert"')
  })

  it('never says Send', () => {
    // The app copies; it does not send. Short element labels only, so the prose
    // that tells you to paste something yourself does not trip it.
    expect(prose('frontend/src/components/AnswersPanel.tsx')).not.toMatch(/>\s*Send\b/)
  })
})

describe('what it costs', () => {
  it('is read under the artist key, so an edit on the Artist page reaches it', () => {
    // The Artist page invalidates `['artist']` after every change, and a query
    // under that prefix is invalidated with it.
    expect(panel).toContain("queryKey: ['artist', 'answers', today]")
    expect(read('frontend/src/pages/ArtistPage.tsx')).toContain("invalidateQueries({ queryKey: ['artist'] })")
  })

  it('is read for the reader\'s own day', () => {
    expect(panel).toContain('localToday()')
    expect(read('frontend/src/api.ts')).toMatch(/\/artist\/answers\?today=/)
  })

  it('is requested only while somebody can see it', () => {
    expect(dock).toContain("useAnswers({ enabled: side.panel === 'answers' })")
    // The dialog owns its own request and exists only while it is open.
    expect(panel).toContain('useAnswers({ enabled: true })')
    expect(layout).toMatch(/answersOpen && !side\.wide && <AnswersDialog/)
  })
})

describe('where it lives', () => {
  it('has a tab in the column for every panel the state knows, and none written by hand', () => {
    expect(dock).toContain('SIDE_PANELS.map')
    expect(dock).toContain('SIDE_PANEL_LABELS[id]')
  })

  it('has a way out at the top of the column for each panel', () => {
    expect(dock).toMatch(/answers: \{ label: 'Open the Artist page'/)
    expect(dock).toMatch(/notifications: \{ label: 'Open the full History'/)
  })

  it('has a header button only where the column can open, and a menu item everywhere else', () => {
    // At 320px the header has three pixels to spare. A fifth icon there pushes
    // the menu off the screen.
    expect(layout).toMatch(/admin \|\| !side\.wide \? null/)
    expect(layout).toContain("side.toggle('answers')")
    expect(layout).toMatch(/!side\.wide && \(\s*<button/)
  })

  it('hands the dialog back to the column when the window widens', () => {
    expect(layout).toMatch(/if \(side\.wide\) setAnswersOpen\(false\)/)
  })

  it('is not offered in admin mode, where the library is refused', () => {
    expect(layout).toMatch(/!admin && answersOpen/)
  })
})

describe('the Worker side', () => {
  const route = read('src/routes/artist.ts')

  it('has one route, and it reads for the signed-in artist', () => {
    expect(route).toMatch(/artist\.get\('\/answers'/)
    expect(route).toContain('readAnswers(c.env, tenantOf(c), todayOf(c))')
  })

  it('is not a route an issued agent token can reach', () => {
    // An agent's token is limited to seven routes; the library's contact details
    // are not among them.
    expect(read('shared/agentRoutes.ts')).not.toContain('/api/artist')
  })
})
