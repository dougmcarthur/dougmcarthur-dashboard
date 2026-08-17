import { useState, type ReactElement, type ReactNode } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Button } from './Button'

/**
 * Replaces window.confirm() for destructive actions: focus-trapped, escapable,
 * and it can say what will actually be lost.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
}: {
  trigger: ReactElement
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger render={trigger} />
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-surface p-5 shadow-xl transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          <AlertDialog.Title className="text-sm font-semibold text-ink">{title}</AlertDialog.Title>
          {description && (
            <AlertDialog.Description className="mt-1.5 text-sm text-ink-muted">
              {description}
            </AlertDialog.Description>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Close render={<Button variant="secondary">{cancelLabel}</Button>} />
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              onClick={() => {
                onConfirm()
                setOpen(false)
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
