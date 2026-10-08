import { useEffect, useRef, useState } from 'react'
import { addDays, snoozeOptions } from '../../../shared/snoozeOptions'
import type { ReviewItem } from '../api'
import { localToday, shortDate } from '../format'

/**
 * The date picker behind the Snooze button.
 *
 * Offers are built by `shared/snoozeOptions.ts`, which derives them from the
 * item's own dates and refuses to offer anything past a live deadline. The
 * typed date stays available regardless, because the suggestions can be empty
 * — an item due in two days has no useful date to defer to, but the person
 * looking at it may still know something the row does not.
 */
const MENU_WIDTH = 256
const GUTTER = 16

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
  // Where the menu sits relative to its button. It opens leftward-aligned, and
  // on a phone the button can be far enough right that a 16rem menu ran off
  // the screen and widened the page, so it is nudged back inside a 16px gutter.
  const [spot, setSpot] = useState({ left: 0, width: MENU_WIDTH })

  // Measured on the press, before the menu exists: once an overflowing menu
  // is on screen a phone widens its layout viewport to fit it, and the width
  // read back is the widened one.
  const place = () => {
    if (!box.current) return
    const button = box.current.getBoundingClientRect()
    const viewport = document.documentElement.clientWidth
    const width = Math.min(MENU_WIDTH, viewport - 2 * GUTTER)
    const left = Math.max(GUTTER, Math.min(button.left, viewport - GUTTER - width))
    setSpot({ left: left - button.left, width })
  }

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

  // The local date, not the UTC one: from 7pm in Winnipeg the UTC date is
  // already tomorrow, which made "tomorrow" the earliest date the picker
  // allowed the day after tomorrow, and counted every offer a day short.
  const today = localToday()
  const options = snoozeOptions(item, today)
  const tomorrow = addDays(today, 1)

  const pick = (date: string) => {
    setOpen(false)
    setCustom('')
    onPick(date)
  }

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => {
          if (!open) place()
          setOpen((o) => !o)
        }}
        disabled={disabled}
        aria-expanded={open}
        title="Snooze"
        aria-label="Snooze"
        className="grid place-items-center h-9 w-9 rounded-lg border border-line text-body hover:bg-sunken hover:text-ink disabled:opacity-40 transition-colors"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
             strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <path d="M13 9.6A5.4 5.4 0 1 1 6.4 3a4.4 4.4 0 0 0 6.6 6.6z" />
        </svg>
      </button>

      {open && (
        <div
          style={spot}
          className="absolute top-full mt-1 z-20 rounded-xl border border-line bg-surface shadow-pop py-1">
          {options.map((o) => (
            <button
              key={o.date}
              onClick={() => pick(o.date)}
              className="w-full flex items-baseline justify-between gap-3 px-3 py-2.5 sm:py-1.5 text-left text-sm sm:text-xs hover:bg-sunken transition-colors"
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
            <label className="block text-xs text-muted mb-1">
              Or pick a date
            </label>
            <div className="flex gap-1.5">
              {/* Safari on iOS draws an empty date input as a blank bar with no
                  placeholder, so the hint is laid over it until a date is set —
                  on iOS only (`-webkit-touch-callout`), because every other
                  browser draws its own mm/dd/yyyy under it.
                  16px text on a phone: anything smaller and iOS zooms the page
                  on focus. */}
              <div className="relative flex-1 min-w-0">
                <input
                  type="date"
                  aria-label="Snooze until"
                  value={custom}
                  min={tomorrow}
                  onChange={(e) => setCustom(e.target.value)}
                  className="w-full min-h-10 sm:min-h-0 rounded-md border border-line px-2 py-1 text-base sm:text-xs"
                />
                {!custom && (
                  <span className="hidden [@supports(-webkit-touch-callout:none)]:flex pointer-events-none absolute inset-y-0 left-2 items-center text-sm text-muted">
                    Choose a date
                  </span>
                )}
              </div>
              <button
                onClick={() => custom && pick(custom)}
                disabled={!custom || custom <= today}
                className="text-sm sm:text-xs px-3 sm:px-2 py-1 rounded-md bg-accent text-accent-fg disabled:opacity-30 transition-colors"
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
