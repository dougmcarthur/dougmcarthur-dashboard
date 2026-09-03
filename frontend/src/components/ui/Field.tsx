import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

/**
 * Text inputs, selects and textareas.
 *
 * The same class string was declared five times under three names — `INPUT`,
 * `INPUT_CLASS` and `FILTER_INPUT` — which had already drifted apart by a
 * padding step and a `w-full`. One base, two widths.
 */
const BASE =
  'text-sm border border-line-strong rounded-md bg-surface text-ink ' +
  'placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent ' +
  'focus:border-transparent transition disabled:opacity-40'

/** Fills its container — forms. */
export const FIELD = `${BASE} w-full px-2.5 py-1.5`
/** Sized to its content — the filter controls in a page header. */
export const FILTER = `${BASE} px-3 py-1.5`

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD} ${className}`} {...rest} />
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${FIELD} resize-y ${className}`} {...rest} />
}

/**
 * `filter` swaps the full-width form treatment for the inline one a page
 * header wants — the distinction the three copies were really encoding.
 */
export function Select({
  className = '',
  filter = false,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { filter?: boolean }) {
  return <select className={`${filter ? FILTER : FIELD} ${className}`} {...rest} />
}
