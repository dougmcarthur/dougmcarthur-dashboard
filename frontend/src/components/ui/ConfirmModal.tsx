import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'

export interface ConfirmModalProps {
  /** Whether the dialog is visible */
  open: boolean
  /** Invoked when cancelled, dismissed by Escape, or backdrop clicked */
  onClose: () => void
  /** Invoked when confirmation action is clicked */
  onConfirm: () => void | Promise<void>
  /** Title of the prompt (e.g. "Delete gig?") */
  title: string
  /** Explanatory description of consequences */
  description?: ReactNode
  /** Label on the confirm button (default: "Delete" if destructive, else "Confirm") */
  confirmLabel?: string
  /** Label on the cancel button (default: "Cancel") */
  cancelLabel?: string
  /**
   * Whether the action is destructive/irreversible.
   * If true, confirm button uses variant="danger"; else variant="primary".
   */
  destructive?: boolean
  /** Whether the confirm action is currently loading/processing */
  busy?: boolean
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
}: ConfirmModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const resolvedConfirmLabel = confirmLabel ?? (destructive ? 'Delete' : 'Confirm')

  useEffect(() => {
    if (!open) return

    const previous = document.activeElement as HTMLElement | null

    // Safe auto-focus on Cancel button to prevent accidental Enter confirmation
    const timer = requestAnimationFrame(() => {
      cancelRef.current?.focus({ preventScroll: true })
    })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      // Accessible Focus Trap within dialog
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return

        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      cancelAnimationFrame(timer)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? 'confirm-dialog-desc' : undefined}
        tabIndex={-1}
        className="w-full max-w-md sm:my-auto rounded-xl border border-line-strong bg-raised shadow-pop outline-none p-5 sm:p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5">
          <h2 id="confirm-dialog-title" className="text-base font-semibold text-ink">
            {title}
          </h2>
          {description ? (
            <div
              id="confirm-dialog-desc"
              className="text-xs sm:text-sm text-muted leading-relaxed whitespace-pre-line"
            >
              {description}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
          <Button
            ref={cancelRef}
            variant="quiet"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            disabled={busy}
          >
            {resolvedConfirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export interface ConfirmOptions {
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
}

export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean
    options: ConfirmOptions
    resolve: (value: boolean) => void
  } | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState((prev) => {
        if (prev) prev.resolve(false) // Dismiss any previous pending confirmation cleanly
        return {
          open: true,
          options,
          resolve,
        }
      })
    })
  }, [])

  const handleClose = useCallback(() => {
    setState((curr) => {
      if (curr) curr.resolve(false)
      return null
    })
  }, [])

  const handleConfirm = useCallback(() => {
    setState((curr) => {
      if (curr) curr.resolve(true)
      return null
    })
  }, [])

  const ConfirmDialog = state?.open ? (
    <ConfirmModal
      open={state.open}
      title={state.options.title}
      description={state.options.description}
      confirmLabel={state.options.confirmLabel}
      cancelLabel={state.options.cancelLabel}
      destructive={state.options.destructive}
      busy={state.options.busy}
      onClose={handleClose}
      onConfirm={handleConfirm}
    />
  ) : null

  return { confirm, ConfirmDialog }
}
