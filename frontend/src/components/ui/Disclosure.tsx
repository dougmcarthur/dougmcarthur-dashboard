import { type ReactNode } from 'react'
import { Button } from './Button'

/**
 * A panel that stays shut until you ask for it, then previews before it acts.
 *
 * Two of these were written a few hours apart — reading the reference
 * documents into the artist library, and reading the note columns into the
 * structured ones — and they came out the same shape line for line: a teaser
 * row with one button, a header with a Close, a loading line, an error line.
 * That is the same drift `Button` and `Field` were extracted to stop, caught
 * at two copies instead of fourteen.
 *
 * The shape is not decoration. Both panels write in bulk, and a bulk write
 * you cannot look at first is one you find out about afterwards — so the
 * shell makes "preview, then apply" the path of least resistance for the next
 * one too.
 */
export function Disclosure({
  teaser,
  hint,
  openLabel,
  title,
  subtitle,
  loading,
  error,
  open,
  onOpen,
  onClose,
  children,
}: {
  /** The sentence on the closed row. */
  teaser: string
  /** The quieter half of it, if there is one. */
  hint?: string
  openLabel: string
  title: string
  subtitle?: string
  loading?: boolean
  /** Shown in danger tone when the action failed. */
  error?: string | null
  open: boolean
  onOpen: () => void
  onClose: () => void
  children: ReactNode
}) {
  if (!open) {
    return (
      <div className="rounded-lg border border-line bg-surface px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-body">
          {teaser}
          {hint && <span className="text-muted"> {hint}</span>}
        </p>
        <Button variant="neutral" onClick={onOpen}>{openLabel}</Button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3.5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        <Button variant="quiet" onClick={onClose}>Close</Button>
      </div>

      {loading && <p className="text-sm text-muted">Reading…</p>}
      {children}
      {error && <p className="text-sm text-danger-fg">{error}</p>}
    </div>
  )
}
