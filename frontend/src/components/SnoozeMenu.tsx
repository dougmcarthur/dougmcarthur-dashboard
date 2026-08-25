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
        className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
      >
        Snooze
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 w-64 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          {options.map((o) => (
            <button
              key={o.date}
              onClick={() => pick(o.date)}
              className="w-full flex items-baseline justify-between gap-3 px-3 py-1.5 text-left text-xs hover:bg-gray-50 transition-colors"
            >
              <span className={o.derived ? 'text-gray-900 font-medium' : 'text-gray-600'}>
                {o.label}
              </span>
              <span className="text-gray-400 tabular-nums shrink-0">{shortDate(o.date)}</span>
            </button>
          ))}

          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-500 leading-relaxed">
              Nothing useful to defer to — this is due too soon for a snooze to
              bring it back in time.
            </p>
          )}

          <div className="border-t border-gray-100 mt-1 pt-2 px-3 pb-1">
            <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
              Or pick a date
            </label>
            <div className="flex gap-1.5">
              <input
                type="date"
                value={custom}
                min={tomorrow}
                onChange={(e) => setCustom(e.target.value)}
                className="flex-1 min-w-0 rounded-md border border-gray-200 px-2 py-1 text-xs"
              />
              <button
                onClick={() => custom && pick(custom)}
                disabled={!custom || custom <= today}
                className="text-xs px-2 py-1 rounded-md bg-gray-900 text-white disabled:opacity-30 transition-colors"
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
