import { useEffect, useRef, useState } from 'react'
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
 * The confirmation fades after a moment. A button that says "Copied" for the
 * rest of the session stops meaning that it just worked.
 */
export function CopyButton({
  text,
  label,
  children = 'Copy',
  variant = 'quiet',
  className = '',
}: {
  text: string
  /** The accessible name, which should say what is copied: "Copy short bio". */
  label: string
  /** What the button says before it is pressed. */
  children?: string
  variant?: ButtonVariant
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
    timer.current = setTimeout(() => setState('idle'), 2000)
  }

  const said = state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : ''

  return (
    <>
      <Button variant={variant} size="sm" aria-label={label} onClick={copy} className={`shrink-0 ${className}`}>
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
