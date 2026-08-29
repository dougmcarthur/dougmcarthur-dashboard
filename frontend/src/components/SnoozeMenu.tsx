import { useEffect, useRef, useState } from 'react'
import { snoozeOptions } from '../../../shared/snoozeOptions'
import type { ReviewItem } from '../api'
import { shortDate } from '../format'

/**
 * The date picker behind the Snooze button.
 *
 * Offers are built by `shared/snoozeOptions.ts`, which derives them from the
 * item's own dates and refuses to offer anything past a live deadline. The
 * typed date stays available regardless, because the suggestions can be empty
 * — an item due in two days has no useful date to defer to, but the person
 * looking at it may still know something the row does not.
 */
export function SnoozeMenu({
  item,
  onPick,
  disabled,
}: {
  item: ReviewItem
  onPick: (until: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const today = new Date().toISOString().slice(0, 10)
  const options = snoozeOptions(item, today)
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

  const pick = (date: string) => {
    setOpen(false)
    setCustom('')
    onPick(date)
  }

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-body hover:bg-sunken disabled:opacity-40 transition-colors"
      >
        Snooze
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 w-64 rounded-xl border border-line bg-surface shadow-pop py-1">
          {options.map((o) => (
            <button
              key={o.date}
              onClick={() => pick(o.date)}
              className="w-full flex items-baseline justify-between gap-3 px-3 py-1.5 text-left text-xs hover:bg-sunken transition-colors"
            >
              <span className={o.derived ? 'text-ink font-medium' : 'text-body'}>
                {o.label}
              </span>
              <span className="text-muted tabular-nums shrink-0">{shortDate(o.date)}</span>
            </button>
          ))}

          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted leading-relaxed">
              Nothing useful to defer to — this is due too soon for a snooze to
              bring it back in time.
            </p>
          )}

          <div className="border-t border-line mt-1 pt-2 px-3 pb-1">
            <label className="block text-[10px] uppercase tracking-wide text-muted mb-1">
              Or pick a date
            </label>
            <div className="flex gap-1.5">
              <input
                type="date"
                value={custom}
                min={tomorrow}
                onChange={(e) => setCustom(e.target.value)}
                className="flex-1 min-w-0 rounded-md border border-line px-2 py-1 text-xs"
              />
              <button
                onClick={() => custom && pick(custom)}
                disabled={!custom || custom <= today}
                className="text-xs px-2 py-1 rounded-md bg-accent text-accent-fg disabled:opacity-30 transition-colors"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
