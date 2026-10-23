import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Source-level guards for the pop-out answers window.
 *
 * Each is something that typechecks, renders and works until the day somebody
 * opens the window: a copy that fails because the page that holds the code is
 * not the one that was clicked, a window asked for after an `await` and so
 * refused, a title set on the wrong document. The findings they pin were
 * measured on Chrome 155 on 2026-10-23 and are written up in
 * `docs/submission-helper-plan.md`.
 */

const read = (f: string) => readFileSync(f, 'utf8')
const prose = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const POP_OUT = 'frontend/src/components/PopOut.tsx'
const SHEET = 'frontend/src/components/AnswerSheet.tsx'
const COPY = 'frontend/src/components/CopyButton.tsx'
const ANSWERS = 'frontend/src/components/AnswersPanel.tsx'
const CLIPBOARD = 'frontend/src/clipboard.ts'
const WINDOW = 'frontend/src/popOutWindow.ts'

/** Everything the window can draw that copies. */
const DRAWN_IN_THE_WINDOW = [POP_OUT, SHEET, COPY, ANSWERS]

describe('copying from the window that was clicked', () => {
  it('writes through that window’s own clipboard', () => {
    // The page that opened the window is not focused while the window is, and
    // the browser refuses a clipboard write from a document that is not:
    // "Document is not focused". The window's own clipboard accepts it.
    const code = prose(CLIPBOARD)
    expect(code).toContain('win.navigator.clipboard.writeText')
  })

  it('falls back to selecting text and copying, which also works in the window', () => {
    expect(prose(CLIPBOARD)).toContain("execCommand('copy')")
  })

  it('lets nothing the window draws reach for the global clipboard', () => {
    // A bare `navigator.clipboard` is the app's own window, whichever window
    // the button is in. Only `win.navigator.clipboard`, with a window in front
    // of it, is allowed.
    for (const file of DRAWN_IN_THE_WINDOW) {
      expect(prose(file), file).not.toMatch(/(?<![\w.])navigator\.clipboard/)
    }
  })

  it('takes the window from the button that was pressed', () => {
    expect(prose(COPY)).toContain('windowOf(e.currentTarget)')
    expect(prose(COPY)).toContain('writeClipboard(text, win)')
  })

  it('copies from the keyboard through the sheet’s own window too', () => {
    expect(prose(SHEET)).toContain('windowOf(root.current)')
    expect(prose(SHEET)).toContain('writeClipboard(text, win)')
  })

  it('listens for keys on the window’s document, not the app’s', () => {
    // A keypress in the window is never delivered to the page that opened it.
    expect(prose(SHEET)).toContain('root.current?.ownerDocument')
    expect(prose(SHEET)).not.toMatch(/(?<![\w.])document\.addEventListener/)
  })
})

describe('opening the window', () => {
  it('asks for it before anything is awaited', () => {
    // The browser hands a window to a click and to nothing else, and an
    // `await` ahead of the request is enough to lose the click.
    expect(prose(WINDOW)).not.toMatch(/\bawait\b/)
    expect(prose(POP_OUT)).not.toMatch(/\bawait\b/)
    expect(prose(WINDOW)).toContain('floating.requestWindow(POP_OUT_SIZE)')
  })

  it('draws a pop-up in standards mode, as the floating window already is', () => {
    expect(prose(WINDOW)).toContain('<!doctype html>')
  })

  it('follows the app’s theme and settings while it is open', () => {
    // The theme, palette, contrast, motion and text scale are all attributes
    // and variables on <html>.
    expect(prose(WINDOW)).toMatch(/observe\(source\.documentElement, \{ attributes: true \}\)/)
    expect(prose(WINDOW)).toContain('node.href')
  })

  it('closes a pop-up when the page that made it goes', () => {
    // A floating window ends with its page. A pop-up does not, and one left
    // behind is a window whose buttons do nothing.
    expect(prose(POP_OUT)).toContain("window.addEventListener('pagehide'")
  })

  it('keeps the window’s own document from scrolling', () => {
    // The copy buttons carry absolutely positioned screen-reader text. With no
    // positioned ancestor it is placed against the document and stretches it,
    // which drew a second scrollbar and let a scroll push the header away.
    expect(prose(POP_OUT)).toMatch(/className="relative flex h-dvh flex-col overflow-hidden/)
    expect(prose(POP_OUT)).toMatch(/role="tabpanel" className="relative [^"]*overflow-hidden"/)
    expect(prose(SHEET)).toMatch(/ref=\{root\} tabIndex=\{-1\} className="relative /)
  })

  it('moves the highlighted row into view by scrolling the list, not the page', () => {
    // `scrollIntoView` scrolls every ancestor that can move, the document of
    // the window included.
    expect(prose(SHEET)).not.toContain('scrollIntoView')
  })

  it('notices when the window is closed from its own title bar', () => {
    expect(prose(POP_OUT)).toContain("win.addEventListener('pagehide', gone)")
  })

  it('titles the window on its own document, never the tab', () => {
    expect(prose(POP_OUT)).not.toMatch(/(?<![\w.])document\.title/)
    expect(prose(POP_OUT)).toContain('doc.title =')
  })

  it('is not offered where there is nowhere to put one', () => {
    expect(prose(POP_OUT)).toMatch(/if \(!popOut\.available\) return null/)
  })

  it('is not offered in admin mode, where the library it shows is refused', () => {
    expect(prose('frontend/src/components/Layout.tsx')).toContain('enabled={!props.admin}')
  })

  it('lives in the layout, so changing page does not end it', () => {
    expect(prose('frontend/src/components/Layout.tsx')).toMatch(/<PopOutProvider[\s\S]*<LayoutFrame/)
  })
})

describe('what the window offers', () => {
  it('copies and approves, and has nothing that claims to send', () => {
    // The app drafts and never sends, and this window cannot even reach the form.
    for (const file of [POP_OUT, SHEET]) {
      const offenders = [...prose(file).matchAll(/(?:>|label=")\s*(Submit|Send|Apply now)\b/g)].map((m) => m[1])
      expect(offenders, file).toEqual([])
    }
    expect(prose(SHEET)).toContain('<CopyButton')
  })

  it('writes one thing to the application, and it is approving an answer that was read', () => {
    // Editing stays on the application panel: a second place to edit an answer
    // is a second place for it to be wrong.
    const code = prose(SHEET)
    expect(code).toContain("{ answerState: 'approved' }")
    expect(code).not.toMatch(/patchField\([^)]*\{\s*answer:/)
    expect(code).not.toContain('useAnswerEdit')
  })

  it('reads the application under the same key as the panel, so the two agree', () => {
    expect(prose(POP_OUT)).toContain("queryKey: ['application', gigId ?? 0]")
    expect(prose(SHEET)).toContain("['application', gigId]")
  })

  it('opens on the answers when the form could not be read', () => {
    expect(prose(POP_OUT)).toMatch(/fields\.length === 0\)\s*\?\s*'answers'/)
  })
})

describe('how it reads and looks', () => {
  // The owner asked for none of the hallmarks of generated text and design.
  const SCREENS = [POP_OUT, SHEET, COPY]

  it('has no em dash in anything a person reads', () => {
    for (const file of SCREENS) expect(prose(file), file).not.toContain('—')
  })

  it('has no small capitals caption over a heading', () => {
    for (const file of SCREENS) expect(prose(file), file).not.toMatch(/<Caption|\buppercase\b|tracking-wide/)
  })

  it('has no coloured bar down the edge of a card', () => {
    for (const file of SCREENS) expect(prose(file), file).not.toMatch(/\bborder-[lr]-\d/)
  })

  it('says nothing a person has to read in the faintest text colour', () => {
    for (const file of SCREENS) {
      expect([...prose(file).matchAll(/(?<!disabled:)text-faint/g)].length, file).toBe(0)
    }
  })
})
