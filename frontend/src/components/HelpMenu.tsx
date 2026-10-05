import { useEffect, useRef, useState } from 'react'

/**
 * The header's question mark: Help, and a way to say something.
 *
 * One small icon among the header's others, opened on a click and quiet
 * otherwise. No badge, no nudge, no floating chat bubble in a corner — the
 * whole point is that it is there when you go looking and invisible when you
 * are not.
 *
 * From `sm` up. Below that the header has no room for a fifth control — it is
 * one 56px row at 320px with three pixels to spare — so a phone finds the same
 * two entries at the bottom of the menu drawer.
 */
export function HelpMenu({ onFeedback, className = '' }: { onFeedback: () => void; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const item = 'block w-full text-left px-3.5 py-1.5 rounded-md text-sm font-medium text-muted hover:text-ink hover:bg-sunken transition-colors'

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Help and feedback"
        title="Help and feedback"
        className="p-2 rounded-md text-muted hover:text-ink hover:bg-sunken transition-colors"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="10" cy="10" r="7.6" />
          <path d="M7.9 7.7a2.2 2.2 0 0 1 4.2.9c0 1.5-2.1 1.9-2.1 3.1" strokeLinecap="round" />
          <path d="M10 14.3v.2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-52 z-40 rounded-xl border border-line bg-surface shadow-pop p-1">
          <a role="menuitem" href="#help" className={item} onClick={() => setOpen(false)}>
            Help
          </a>
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false)
              onFeedback()
            }}
          >
            Send feedback
          </button>
        </div>
      )}
    </div>
  )
}
