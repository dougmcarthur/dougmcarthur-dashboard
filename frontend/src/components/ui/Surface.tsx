import type { ReactNode } from 'react'

/**
 * The shapes that were being spelled out by hand, over and over.
 *
 * An audit of every class string in `frontend/src` found no conflicting
 * utilities and no dead hover states — the `Button` and `Field` extractions
 * had already taken those — but it found the same five shapes written out
 * between four and fifty-nine times each, in several spellings apiece:
 *
 *   59x  a form label          `block text-xs font-medium text-muted mb-1`
 *   ~20x a card, four ways     `bg-surface border border-line rounded-xl …`
 *   12x  a section caption     `text-xs font-semibold uppercase tracking-wide`
 *    9x  an error banner       two sizes of `bg-danger-bg …`
 *    4x  an empty state        `px-4 py-12 text-center text-muted text-sm`
 *
 * Same reasoning as `Button`: extracted so a change of mind is one edit rather
 * than a search, and so the next one is not a sixtieth spelling. The variants
 * below are the spellings that actually existed, not a guess at what might be
 * wanted — `padding` and `divide` are options because four and five call sites
 * respectively already differed on exactly those.
 */

/* --------------------------------------------------------------------- */
/* Card                                                                   */
/* --------------------------------------------------------------------- */

export interface CardProps {
  children: ReactNode
  /** `sm` is the p-4 spelling, `md` the p-5 one. Both were in use. */
  pad?: 'sm' | 'md' | 'none'
  /** Rows separated by a rule — the list-shaped cards. */
  divided?: boolean
  /** Clips children to the radius, for a card whose rows reach the edge. */
  clip?: boolean
  className?: string
  as?: 'div' | 'section' | 'li'
  'aria-labelledby'?: string
}

/**
 * The shell itself, for the one place that cannot be a `Card`: a row that is
 * also a button. `Card` renders a div, a section or a list item — never an
 * interactive element — and widening it to cover one call site would put an
 * `as="button"` in front of everybody.
 */
export const CARD_CLASS = 'bg-surface border border-line rounded-xl shadow-card'

const PAD = { sm: 'p-4', md: 'p-5', none: '' }

export function Card({
  children,
  pad = 'sm',
  divided = false,
  clip = false,
  className = '',
  as: Tag = 'div',
  ...rest
}: CardProps) {
  return (
    <Tag
      className={`${CARD_CLASS} ${PAD[pad]}
                  ${divided ? 'divide-y divide-line' : ''} ${clip ? 'overflow-hidden' : ''}
                  ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/* --------------------------------------------------------------------- */
/* Label                                                                  */
/* --------------------------------------------------------------------- */

/**
 * The form label, and the most repeated string in the app by a factor of
 * eight. `Field` exported the input, the textarea and the select and left the
 * thing sitting above them to be typed out every time.
 */
export function Label({
  children,
  htmlFor,
  className = '',
}: {
  children: ReactNode
  htmlFor?: string
  className?: string
}) {
  return (
    <label htmlFor={htmlFor} className={`block text-xs font-medium text-muted mb-1 ${className}`}>
      {children}
    </label>
  )
}

/* --------------------------------------------------------------------- */
/* Caption                                                                */
/* --------------------------------------------------------------------- */

/**
 * The class itself, for the two places that cannot be an element: a `<th>`
 * carrying sort affordances, and `Explainer`'s `titleClassName`.
 *
 * `tracking-wide` rather than `wider`: both were in use, two call sites
 * against ten, and letter-spacing that differs by a quarter of a pixel
 * between two lists is drift rather than a decision.
 */
export const CAPTION_CLASS = 'text-xs font-semibold text-muted uppercase tracking-wide'

/** A small upper-case heading over a group of rows. */
export function Caption({
  children,
  spaced = false,
  className = '',
  as: Tag = 'p',
}: {
  children: ReactNode
  /** The `mb-1.5` spelling, which six of the twelve call sites used. */
  spaced?: boolean
  className?: string
  as?: 'p' | 'h2' | 'h3'
}) {
  return (
    <Tag
      className={`${CAPTION_CLASS} ${spaced ? 'mb-1.5' : ''} ${className}`}
    >
      {children}
    </Tag>
  )
}

/* --------------------------------------------------------------------- */
/* Banner                                                                 */
/* --------------------------------------------------------------------- */

/**
 * Something went wrong, or something needs saying before you act.
 *
 * `danger` and `warn` resolve to the same clay by design — see the palette
 * note in index.css — so the tone here changes the border and the weight
 * rather than the hue, and the words carry the distinction.
 */
export function Banner({
  children,
  tone = 'danger',
  size = 'md',
  className = '',
}: {
  children: ReactNode
  tone?: 'danger' | 'warn' | 'info'
  /** `sm` is the inline px-3 py-2 spelling; `md` the px-4 py-3 block. */
  size?: 'sm' | 'md'
  className?: string
}) {
  const TONE = {
    danger: 'bg-danger-bg border-danger-line text-danger-fg',
    warn: 'bg-warn-bg/60 border-warn-line text-warn-fg',
    info: 'bg-info-bg border-info-line text-info-fg',
  }
  const SIZE = { sm: 'px-3 py-2 rounded-md text-xs', md: 'px-4 py-3 rounded-lg text-sm' }
  return <p className={`border ${TONE[tone]} ${SIZE[size]} ${className}`}>{children}</p>
}

/* --------------------------------------------------------------------- */
/* EmptyState                                                             */
/* --------------------------------------------------------------------- */

/**
 * Nothing to show, said in the middle of the space the rows would fill.
 *
 * Deliberately takes a child rather than only a string: this app's rule is
 * that an empty state says what to do next, not just that there is nothing —
 * "add a location and the nights away" rather than "no data".
 */
export function EmptyState({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 py-12 text-center text-sm text-muted ${className}`}>{children}</div>
}
