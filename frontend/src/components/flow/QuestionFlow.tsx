import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/Button'

/**
 * The full-screen, one-question-at-a-time shell, driven from the keyboard.
 *
 * Extracted when the second one arrived — the welcome questions and the
 * stage-plot survey — so the keys behave the same in both and a third does not
 * re-derive them. Each flow owns its questions and its state; this owns the
 * screen, the keys and the focus.
 *
 * Keys, shown on screen as they apply:
 *  - **Enter** moves on (Shift+Enter is a new line in a long answer)
 *  - **A, B, C…** choose an option
 *  - **↑ / ↓** move between questions when not typing
 *  - **Esc** leaves; the flow decides what is kept
 *
 * Portalled to the body: an ancestor with a transform or filter would make
 * `fixed` relative to it rather than the viewport, and the first version sat
 * 16px down the page with the header showing through above it.
 */

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export interface FlowOption {
  id: string
  label: string
  /** A second line, quieter. */
  hint?: string
  /** A small drawing beside the label — an instrument, say. */
  icon?: ReactNode
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

export function FlowShell({
  label,
  screenKey,
  progress,
  closeLabel = 'Finish later',
  onClose,
  onNext,
  onBack,
  options = [],
  onChoose,
  arrows = true,
  children,
}: {
  /** What the dialog is called, for a screen reader. */
  label: string
  /** Changes on every screen; focus moves when it does. */
  screenKey: string
  /** 0–100. */
  progress: number
  closeLabel?: string
  onClose: () => void
  onNext: () => void
  onBack: () => void
  /** The options on this screen, in letter order, so the letter keys work. */
  options?: ReadonlyArray<{ id: string }>
  onChoose?: (id: string) => void
  /** The ↑/↓ buttons, on screens where going back or on makes sense. */
  arrows?: boolean
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  // Focus follows the question, so the keys work without a click: whatever
  // the screen marked `data-autofocus`, otherwise the screen itself.
  useEffect(() => {
    const target = panel.current?.querySelector<HTMLElement>('[data-autofocus]')
    if (target) target.focus()
    else panel.current?.focus({ preventScroll: true })
    panel.current?.scrollTo({ top: 0 })
  }, [screenKey])

  // The page underneath does not scroll, and focus goes back where it was.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      const typing = isTyping(e.target)
      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // A focused button answers Enter itself; letting this run too would
        // press it and then move on. Option buttons are the exception: Enter
        // moves on from them, as it does everywhere else, and Space chooses.
        const t = e.target
        const isOption = t instanceof HTMLElement && (t.getAttribute('role') === 'checkbox' || t.getAttribute('role') === 'radio')
        if (!isOption && (t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement || t instanceof HTMLSelectElement)) return
        e.preventDefault()
        onNext()
        return
      }
      if (typing) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        onNext()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        onBack()
      } else if (onChoose && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
        const i = LETTERS.indexOf(e.key.toUpperCase())
        if (i >= 0 && i < options.length) {
          e.preventDefault()
          onChoose(options[i].id)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, onNext, onBack, onChoose, options])

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-canvas outline-none overflow-y-auto"
    >
      <div className="h-1 w-full bg-sunken shrink-0" aria-hidden>
        <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex items-center justify-between px-4 sm:px-8 py-3 shrink-0">
        <p className="text-sm font-semibold text-ink">
          Scout <span className="text-faint font-normal">— Sun Dogs Music</span>
        </p>
        <Button variant="quiet" size="sm" onClick={onClose}>
          {closeLabel} <Kbd>Esc</Kbd>
        </Button>
      </div>

      <div className="flex-1 flex items-center">
        <div key={screenKey} className="w-full max-w-xl mx-auto px-6 py-10 space-y-6">
          {children}
        </div>
      </div>

      {arrows && (
        // Keyboard companions, so not on a phone, where they sat over the
        // last option.
        <div className="fixed bottom-4 right-4 hidden sm:flex gap-1">
          <button
            type="button"
            onClick={onBack}
            aria-label="Previous question"
            className="h-9 w-9 rounded-md border border-line-strong text-muted hover:text-ink hover:bg-sunken transition-colors"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next question"
            className="h-9 w-9 rounded-md border border-line-strong text-muted hover:text-ink hover:bg-sunken transition-colors"
          >
            ↓
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border border-line-strong bg-raised px-1.5 text-[11px] font-medium text-muted">
      {children}
    </kbd>
  )
}

/** "2 of 4", the question, and a sentence under it. */
export function Question({
  step,
  title,
  children,
}: {
  /** "2 of 4", or a label like "Performer 2". */
  step?: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="space-y-2">
      {step && <p className="text-sm font-medium text-accent">{step}</p>}
      <h1 className="text-2xl sm:text-3xl font-semibold text-ink tracking-tight">{title}</h1>
      {children && <p className="text-body">{children}</p>}
    </div>
  )
}

export function Continue({
  label = 'OK',
  onClick,
  hint = (
    <>
      press <Kbd>Enter ↵</Kbd>
    </>
  ),
}: {
  label?: string
  onClick: () => void
  hint?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="primary" size="md" onClick={onClick}>
        {label}
      </Button>
      <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted">{hint}</span>
    </div>
  )
}

/**
 * Lettered options. `multiple` makes them checkboxes; otherwise they are
 * radios and choosing one is the answer.
 */
export function OptionList({
  label,
  options,
  selected,
  onChoose,
  multiple = true,
}: {
  label: string
  options: ReadonlyArray<FlowOption>
  selected: ReadonlySet<string>
  onChoose: (id: string) => void
  multiple?: boolean
}) {
  return (
    <div role={multiple ? 'group' : 'radiogroup'} aria-label={label} className="space-y-2">
      {options.map((o, i) => {
        const on = selected.has(o.id)
        return (
          <button
            key={o.id}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={on}
            onClick={() => onChoose(o.id)}
            className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-base transition-colors
                        focus:outline-none focus:ring-2 focus:ring-accent ${
                          on
                            ? 'border-accent bg-accent-soft text-ink'
                            : 'border-line-strong text-body hover:bg-sunken hover:text-ink'
                        }`}
          >
            <span
              aria-hidden
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs font-semibold ${
                on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong text-muted'
              }`}
            >
              {LETTERS[i]}
            </span>
            {o.icon && (
              <svg viewBox="0 0 48 48" className="h-7 w-7 shrink-0 text-body" aria-hidden>
                {o.icon}
              </svg>
            )}
            <span className="flex-1 min-w-0">
              {o.label}
              {o.hint && <span className="block text-xs text-muted mt-0.5">{o.hint}</span>}
            </span>
            {on && (
              <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M3 8.4 6.4 12 13 4.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** The big underlined text box. */
export const FLOW_INPUT =
  'w-full bg-transparent border-0 border-b-2 border-line-strong focus:border-accent focus:outline-none text-2xl text-ink py-2 placeholder:text-faint'
export const FLOW_TEXTAREA =
  'w-full resize-none bg-transparent border-0 border-b-2 border-line-strong focus:border-accent focus:outline-none text-xl text-ink py-2 placeholder:text-faint'
