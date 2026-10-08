import { useRef, type KeyboardEvent } from 'react'
import { THEMES, swatches, type PaletteId, type Theme, type ThemeMode } from '../../../shared/themes'

/**
 * The colour theme, as cards you can see.
 *
 * Each card paints its own five swatches (ground, card, ink, accent, ochre) in
 * the mode you are in now, read from the same tokens the theme is made of, so a
 * card cannot promise a colour the theme does not have. Choosing writes straight
 * through to the page, which is the preview.
 *
 * One radio group, because it is one choice, with two kinds of theme in it. The
 * accessible ones are named for what they are for and say so in a sentence, and
 * the first group ends by pointing at them: an aesthetic theme is allowed to be
 * soft, and somebody who finds one hard to read should not have to hunt.
 *
 * Arrow keys move the choice, as they do in any radio group, and only the
 * selected card is in the tab order.
 */
export function ThemePicker({
  value,
  mode,
  onChange,
}: {
  value: PaletteId
  mode: ThemeMode
  onChange: (id: PaletteId) => void
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const aesthetic = THEMES.filter((t) => t.kind === 'aesthetic')
  const accessible = THEMES.filter((t) => t.kind === 'accessible')

  const move = (e: KeyboardEvent, from: Theme, step: 1 | -1) => {
    e.preventDefault()
    const i = THEMES.findIndex((t) => t.id === from.id)
    const next = THEMES[(i + step + THEMES.length) % THEMES.length]
    onChange(next.id)
    refs.current[next.id]?.focus()
  }

  const card = (theme: Theme) => {
    const selected = theme.id === value
    return (
      <button
        key={theme.id}
        ref={(el) => {
          refs.current[theme.id] = el
        }}
        type="button"
        role="radio"
        aria-checked={selected}
        tabIndex={selected ? 0 : -1}
        onClick={() => onChange(theme.id)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(e, theme, 1)
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(e, theme, -1)
        }}
        className={`text-left rounded-lg border p-3 transition-colors ${
          selected ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line bg-surface hover:bg-sunken'
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex gap-0.5" aria-hidden>
            {swatches(theme, mode).map((hex, i) => (
              <span key={i} className="h-4 w-4 rounded-full border border-line-strong" style={{ backgroundColor: hex }} />
            ))}
          </span>
          {selected && (
            <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M3 8.4 6.4 12 13 4.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className="mt-2 block text-sm font-medium text-ink">{theme.name}</span>
        <span className="mt-0.5 block text-xs text-muted">{theme.blurb}</span>
      </button>
    )
  }

  return (
    <div role="radiogroup" aria-label="Colour theme" className="space-y-4">
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">{aesthetic.map(card)}</div>
        <p className="text-xs text-muted">
          Hard to read, or hard to tell colours apart? The accessible themes below are made for that.
        </p>
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted">Accessible themes</h3>
        <div className="grid grid-cols-2 gap-2">{accessible.map(card)}</div>
      </div>
    </div>
  )
}
