import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { windowOf, writeClipboard } from '../clipboard'
import { Button, type ButtonVariant } from './ui/Button'

/**
 * Put text on the clipboard, and say whether it got there.
 *
 * The clipboard can refuse: a page not served securely, a browser that wants a
 * gesture it did not see, a permission somebody denied. A copy button that says
 * "Copied" over nothing is how a wrong bio ends up in a form, because whatever
 * was already on the clipboard gets pasted instead. So the label reports what
 * happened, and a refusal says so.
 *
 * The write goes through the window the button is drawn in, which is not always
 * the app's: the answers can sit in a pop-out above the form, and a click there
 * does not focus the page that holds this code. See `clipboard.ts`.
 *
 * The confirmation fades after a moment. A button that says "Copied" for the
 * rest of the session stops meaning that it just worked.
 */
export function CopyButton({
  text,
  label,
  children = 'Copy',
  variant = 'quiet',
  className = '',
  onCopied,
}: {
  text: string
  /** The accessible name, which should say what is copied: "Copy short bio". */
  label?: string
  /** What the button says before it is pressed. */
  children?: string
  variant?: ButtonVariant
  className?: string
  /** Runs after a write the clipboard accepted, and not after a refusal. */
  onCopied?: () => void
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async (e: MouseEvent<HTMLButtonElement>) => {
    // Read before the first await: the event's target is gone after it.
    const win = windowOf(e.currentTarget)
    clearTimeout(timer.current)
    let ok = false
    try {
      ok = await writeClipboard(text, win)
    } catch {
      ok = false
    }
    setState(ok ? 'copied' : 'failed')
    if (ok) onCopied?.()
    timer.current = setTimeout(() => setState('idle'), 2000)
  }

  const said = state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : ''

  return (
    <>
      <Button variant={variant} size="sm" aria-label={label || children || 'Copy'} onClick={copy} className={`shrink-0 ${className}`}>
        {said || children}
      </Button>
      {/* Outside the button, because a button with its own accessible name is
          not read again when its text changes. */}
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </>
  )
}
