import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'

/**
 * A dialog, in `ui/` because the next one should not be hand-rolled.
 *
 * Three things a hand-rolled overlay usually forgets, and each is the kind of
 * fault that renders fine and fails a person: Escape does nothing, focus stays
 * behind the overlay so a keyboard lands on the page underneath, and the page
 * keeps scrolling while the dialog sits still.
 *
 * Not `<dialog>`: `showModal()` is imperative, and reconciling an imperative
 * open/close with React state is how a dialog ends up open in the DOM and
 * invisible on screen. A plain overlay with the three behaviours written down
 * is less clever and easier to be sure about.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  closeLabel = 'Close',
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  closeLabel?: string
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    // Move focus into the dialog. Without this a keyboard is still on the page
    // behind the overlay, which is invisible to a mouse and ruinous otherwise.
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()

    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  // The backdrop dims and softens the page; it does not hide it. Seeing where
  // you were is what tells you the dialog is a detour you can leave, not a new
  // screen you have been moved to. A near-opaque canvas wash did the opposite,
  // and in the light theme it lightened the page rather than dimming it.
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim/40 backdrop-blur-sm p-4 sm:items-center"
      // A click on the backdrop closes; a click inside must not bubble out to
      // it, which is the other half people forget.
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="w-full max-w-lg rounded-xl border border-line-strong bg-raised shadow-pop outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-muted break-words">{subtitle}</p> : null}
          </div>
          <Button variant="quiet" size="sm" className="shrink-0" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
