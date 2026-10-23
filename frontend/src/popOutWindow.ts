/**
 * A window for the answers that stays above the form while it is filled in.
 *
 * Document Picture-in-Picture is the whole reason this is a floating window and
 * not a pop-up: a pop-up goes behind the form's tab the moment the form is
 * clicked, and a window that is behind the thing you are typing into is not a
 * helper. Where that is missing (Safari, Firefox before 151) a pop-up is the
 * fallback, and says nothing about being on top.
 *
 * What was measured, on Chrome 155 on Windows, 2026-10-23, driving the real
 * browser with trusted input (`docs/submission-helper-plan.md`):
 *
 * - The size asked for is honoured, at the screen's bottom right. The narrowest
 *   it will go is 240px wide.
 * - It is the app's own origin, so the app's code can reach into it, and it
 *   is in standards mode. Its base address is the opener's, so a relative
 *   `url()` in a copied stylesheet resolves the way it does in the app.
 * - It lives exactly as long as the page that opened it. A navigation of that
 *   page (a reload, a sign-out redirect) or closing its tab closes it; a change
 *   of the `#` route does not, which is why the app's routes are fine.
 * - The page that opened it can be in the background, and the window keeps
 *   working: a click in it runs the app's handlers and updates its own DOM.
 * - Only the window's own clipboard accepts a write from a click in it. See
 *   `clipboard.ts`.
 */

export const POP_OUT_SIZE = { width: 380, height: 640 } as const

/** What the browser's floating-window API looks like, which the DOM types do not carry yet. */
interface FloatingWindows {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>
}

function floatingWindows(): FloatingWindows | null {
  const api = (window as unknown as { documentPictureInPicture?: FloatingWindows }).documentPictureInPicture
  return api ?? null
}

/** The browser can float a window above whatever else is open. */
export function popOutFloats(): boolean {
  return floatingWindows() !== null
}

/**
 * Whether there is anywhere to put one: a floating window, or a pop-up on a
 * screen with room and a mouse. A phone gets neither, and is better served by
 * Copy in the page than by a second browser tab that looks like a window.
 */
export function popOutAvailable(): boolean {
  if (popOutFloats()) return true
  return typeof matchMedia === 'function' && matchMedia('(min-width: 1024px) and (pointer: fine)').matches
}

/** The browser would not make a window: a pop-up blocker, nearly always. */
export class PopOutBlocked extends Error {}

/**
 * Ask for the window.
 *
 * Has to be called in the click that wants it, before anything is awaited: the
 * browser hands a window to a gesture and to nothing else, and an `await` first
 * is enough to lose it.
 */
export function openAnswersWindow(): Promise<Window> {
  const floating = floatingWindows()
  if (floating) return floating.requestWindow(POP_OUT_SIZE)

  const popup = window.open(
    '',
    'scout-answers',
    `popup=yes,width=${POP_OUT_SIZE.width},height=${POP_OUT_SIZE.height}`,
  )
  if (!popup) return Promise.reject(new PopOutBlocked('The browser blocked the window.'))
  // A blank pop-up renders in quirks mode, which lays out differently from the
  // app, and a doctype cannot be added to a document once it exists. So the
  // page is written once, from a constant with nothing interpolated into it,
  // which puts it in standards mode like the floating window.
  popup.document.open()
  popup.document.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
  popup.document.close()
  return Promise.resolve(popup)
}

/**
 * Make `target` look like `source` and keep it that way.
 *
 * Copies every stylesheet, and the attributes on `<html>`, which is where the
 * app keeps the colour theme, the palette, the contrast and motion settings and
 * the text scale (`applyAppearance`). Both are watched afterwards, so switching
 * the theme in the app switches the window too. Returns the function that stops
 * watching.
 *
 * A linked stylesheet is copied by its absolute address and an inline one by
 * its text, because only the first knows where it came from; the base address
 * covers the relative `url()` inside the second for a pop-up, which does not
 * inherit one.
 */
export function mirrorAppearance(source: Document, target: Document): () => void {
  if (!target.querySelector('base')) {
    const base = target.createElement('base')
    base.href = source.baseURI
    target.head.prepend(base)
  }
  if (!target.querySelector('meta[charset]')) {
    const charset = target.createElement('meta')
    charset.setAttribute('charset', 'utf-8')
    target.head.prepend(charset)
  }

  const copySheets = () => {
    target.head.querySelectorAll('[data-popout-copy]').forEach((n) => n.remove())
    for (const node of Array.from(source.head.querySelectorAll('link[rel="stylesheet"], style'))) {
      let copy: HTMLElement
      if (node instanceof HTMLLinkElement) {
        copy = target.createElement('link')
        copy.setAttribute('rel', 'stylesheet')
        copy.setAttribute('href', node.href)
        if (node.media) copy.setAttribute('media', node.media)
      } else {
        copy = target.createElement('style')
        const sheet = (node as HTMLStyleElement).sheet
        // A sheet built by `insertRule` has no text of its own.
        copy.textContent =
          node.textContent || (sheet ? Array.from(sheet.cssRules).map((r) => r.cssText).join('\n') : '')
      }
      copy.setAttribute('data-popout-copy', '')
      target.head.append(copy)
    }
  }

  const copyRoot = () => {
    const from = source.documentElement
    const to = target.documentElement
    for (const a of Array.from(from.attributes)) to.setAttribute(a.name, a.value)
    for (const a of Array.from(to.attributes)) if (!from.hasAttribute(a.name)) to.removeAttribute(a.name)
  }

  copySheets()
  copyRoot()
  const sheets = new MutationObserver(copySheets)
  sheets.observe(source.head, { childList: true })
  const root = new MutationObserver(copyRoot)
  root.observe(source.documentElement, { attributes: true })
  return () => {
    sheets.disconnect()
    root.disconnect()
  }
}
