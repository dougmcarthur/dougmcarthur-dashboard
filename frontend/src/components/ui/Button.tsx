import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-on-accent hover:opacity-90 border border-transparent',
  secondary: 'bg-surface text-ink-muted border border-line hover:bg-surface-muted hover:text-ink',
  ghost: 'bg-transparent text-ink-muted border border-transparent hover:bg-surface-muted hover:text-ink',
  accent: 'bg-brand text-on-accent hover:bg-brand-strong border border-transparent',
  danger: 'bg-danger-soft text-danger border border-transparent hover:brightness-95',
}

const SIZES: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1 gap-1.5 rounded-md',
  md: 'text-sm px-3.5 py-1.5 gap-2 rounded-md',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Shows a pending label and blocks interaction while a mutation is in flight. */
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'sm',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-medium whitespace-nowrap',
        'transition-colors disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-3 rounded-full border-2 border-current border-t-transparent animate-spin"
        />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}
