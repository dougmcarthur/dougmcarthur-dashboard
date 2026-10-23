/**
 * Put text on the clipboard, from the window the person is actually using.
 *
 * Which window matters now that the answers can sit in a pop-out above the
 * form. The browser lets only a *focused* document write to the clipboard, and
 * clicking in the pop-out focuses the pop-out and not the page that opened it.
 * A handler written in the app's own window therefore fails when it calls
 * `navigator.clipboard`: the page that owns the code is not the one that was
 * clicked, and the browser says "Document is not focused". The pop-out's own
 * `navigator.clipboard` works, and so does `execCommand` on a textarea in its
 * own document, which is the fallback here for a browser that refuses the
 * first. Measured on Chrome 155, 2026-10-23, with the opener in the background
 * and in the foreground alike.
 *
 * So every copy takes the window it was clicked in. Never reach for the global
 * `navigator.clipboard` in anything the pop-out can draw: it typechecks, runs
 * and works until the day somebody opens the pop-out, and then it silently does
 * not.
 *
 * Returns whether the text got there. A copy button that says "Copied" over a
 * refused write is how whatever was on the clipboard already ends up in a form.
 */
export async function writeClipboard(text: string, win: Window = window): Promise<boolean> {
  try {
    await win.navigator.clipboard.writeText(text)
    return true
  } catch {
    return selectAndCopy(text, win.document)
  }
}

/** The older way: select the text in a textarea and ask the document to copy it. */
function selectAndCopy(text: string, doc: Document): boolean {
  const box = doc.createElement('textarea')
  box.value = text
  box.setAttribute('readonly', '')
  box.setAttribute('aria-hidden', 'true')
  box.style.position = 'fixed'
  box.style.top = '0'
  box.style.opacity = '0'
  doc.body.appendChild(box)
  box.select()
  try {
    return doc.execCommand('copy')
  } catch {
    return false
  } finally {
    box.remove()
  }
}

/** The window an element is drawn in, which is not `window` inside the pop-out. */
export function windowOf(el: Element | null | undefined): Window {
  return el?.ownerDocument.defaultView ?? window
}
