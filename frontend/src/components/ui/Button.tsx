import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * The one button.
 *
 * Fourteen distinct class strings were in use across the pages, differing by a
 * padding step or a hover that did nothing. Variants are named for what the
 * button *means* rather than what colour it is, so a change of palette is one
 * edit here rather than a search for every `bg-success-bg`.
 *
 * Eight of those strings carried `hover:bg-X` on an element already painted
 * `bg-X` — a hover state that rendered as no hover at all. The tinted variants
 * below use the `-bg-hover` tokens, which is what makes them respond.
 */
export type ButtonVariant = 'primary' | 'neutral' | 'quiet' | 'good' | 'danger' | 'info'
export type ButtonSize = 'sm' | 'md'

const VARIANTS: Record<ButtonVariant, string> = {
  // The one action a screen wants you to take. At most one per group.
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  // Everything else with a border. The most common button in the app.
  neutral: 'border border-line-strong text-body hover:bg-sunken hover:text-ink',
  // Present but not competing — dismiss, copy, secondary affordances.
  quiet: 'border border-line text-muted hover:bg-sunken hover:text-ink',
  good: 'bg-success-bg text-success-fg hover:bg-success-bg-hover',
  danger: 'bg-danger-bg text-danger-fg hover:bg-danger-bg-hover',
  info: 'bg-info-bg text-info-fg hover:bg-info-bg-hover',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'text-xs px-2.5 py-1',
  md: 'text-xs px-3 py-1.5',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

export function Button({
  variant = 'neutral',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-md font-medium transition-colors disabled:opacity-40
                  disabled:pointer-events-none ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
}
