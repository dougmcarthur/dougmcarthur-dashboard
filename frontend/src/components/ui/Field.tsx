import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'
import { useId } from 'react'
import { cn } from '../../lib/cn'

const CONTROL =
  'w-full text-sm rounded-md px-2.5 py-1.5 bg-surface text-ink border border-line ' +
  'placeholder:text-ink-subtle transition-colors ' +
  'hover:border-line-strong focus:outline-none focus:border-brand ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

export function Label({
  children,
  htmlFor,
  hint,
}: {
  children: ReactNode
  htmlFor?: string
  hint?: string
}) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-muted mb-1">
      {children}
      {hint && <span className="ml-1.5 font-normal text-ink-subtle">{hint}</span>}
    </label>
  )
}

/** Label + control + help/error text, wired together for screen readers. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string
  hint?: string
  error?: string
  children: (props: { id: string; 'aria-describedby'?: string }) => ReactNode
  className?: string
}) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {children({ id, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger mt-1">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-subtle mt-1">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, 'resize-y', className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, 'pr-8', className)} {...props} />
}

/** Character counter that turns red past the form's stated limit. */
export function CharCount({ value, max }: { value: string; max?: number | null }) {
  const over = max != null && value.length > max
  return (
    <span className={cn('text-xs tabular-nums', over ? 'text-danger font-medium' : 'text-ink-subtle')}>
      {max ? `${value.length}/${max}` : value.length ? value.length : ''}
    </span>
  )
}
