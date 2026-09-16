import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useAppearance } from '../../hooks/useAppearance'

/**
 * A setting's title, with its explanation tucked behind an info button.
 *
 * Settings screens accumulate prose. Every control here earns its sentence —
 * why the lead time is a day, what a calendar entry claims that a task does
 * not, that the appearance settings are this browser only — and read together
 * they turn a page of six controls into a page of six paragraphs, where the
 * thing you came to change is the smallest text on screen.
 *
 * So the sentence is still there and no longer costs anything to not read.
 *
 * **Click, never hover.** A hover popover appears because a pointer crossed
 * something on its way somewhere else, and then covers what the person was
 * heading for. That is the whole reason this is a button: opening an
 * explanation should be a thing somebody decided to do.
 *
 * **It expands in place rather than floating over.** Same reasoning carried
 * through — a panel that overlays cannot cover the control it explains if it
 * does not overlay. It costs a layout shift, which is visible and predictable,
 * instead of an occlusion, which is neither. It also means no positioning
 * maths, no portal, and nothing to clip at the edge of a card.
 *
 * One open at a time is deliberately *not* enforced. These are short and
 * independent, and a panel that closes because you opened another one is a
 * panel you cannot read two of while comparing two settings.
 *
 * **The whole mechanism switches off.** `showHints` in the appearance settings
 * hides every icon at once, for somebody who has read them and wants the
 * screen back. It hides the *offer*, not the answer — turning it on restores
 * every sentence — and it reaches only text that is purely explanatory. A
 * warning, a count, a validation error and a status all stay, because those
 * are the app telling you something rather than teaching you something.
 */

/**
 * Exported so the one row whose explanation is a modal rather than a panel
 * can carry the same glyph. Two drawings of an info icon on one screen is the
 * fourteen-button mistake in miniature.
 */
export function InfoGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v3.5" strokeLinecap="round" />
      <path d="M8 5.1v.6" strokeLinecap="round" />
    </svg>
  )
}

export interface ExplainerProps {
  /** The title it sits beside. A string, because it is also the button's name. */
  title: ReactNode
  /** What the button says out loud, when `title` is not a plain string. */
  titleText?: string
  /** The sentence being tucked away. Nothing renders if this is absent. */
  children?: ReactNode
  /** Heading level, or `div` for a row label that is not a heading. */
  as?: 'h2' | 'h3' | 'div'
  /** Passed to the heading, for `aria-labelledby`. */
  id?: string
  /** Classes for the heading itself. */
  titleClassName?: string
  /**
   * Content on the title line, after the icon — a control the explanation is
   * about, when it belongs beside its label rather than in a column of its own.
   *
   * It exists because the panel is a block under the whole line. Put the
   * control in a flex *beside* this component instead and the panel is stuck
   * in whatever narrow cell the label occupies, which for a one-word label is
   * a four-word-wide ribbon.
   */
  aside?: ReactNode
}

export function Explainer({
  title,
  titleText,
  children,
  as: Tag = 'h3',
  id,
  titleClassName = 'text-sm font-semibold text-ink',
  aside,
}: ExplainerProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const { appearance } = useAppearance()
  // Read after the hooks above, never before: bailing out early would change
  // how many hooks this component calls between renders.
  const offered = appearance.showHints && Boolean(children)

  // Escape closes, and a click anywhere else closes. Both are listened for
  // only while something is open, so a page of twenty of these costs nothing
  // until one is used.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const name = titleText ?? (typeof title === 'string' ? title : '')

  return (
    <div ref={wrap}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag id={id} className={titleClassName}>
          {title}
        </Tag>
        {offered ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            // "About X" rather than "What X does", because the titles are a
            // mix of nouns and phrases and only the first reads as English
            // across all of them — "What Your name does" is not a sentence.
            aria-label={open ? `Hide the note about ${name}` : `About ${name}`}
            // `text-faint` at rest and `text-body` open, so the icon of an
            // open panel is visibly the one that opened it. The hover changes
            // the colour rather than a background, because `faint` has no
            // `-bg-hover` twin to change.
            className={`shrink-0 rounded-full transition-colors hover:text-body
                        focus:outline-none focus:ring-2 focus:ring-accent
                        ${open ? 'text-body' : 'text-faint'}`}
          >
            <InfoGlyph />
          </button>
        ) : null}
        {aside ? <div className="ml-1">{aside}</div> : null}
      </div>
      {offered && open ? (
        <p id={panelId} className="mt-1 text-xs text-muted leading-relaxed">
          {children}
        </p>
      ) : null}
    </div>
  )
}
