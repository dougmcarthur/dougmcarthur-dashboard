export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        checked ? 'bg-accent' : 'bg-line-strong'
      } ${className}`}
    >
      <span
        className={`inline-block rounded-full bg-surface shadow-card transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
        style={{ height: '1.125rem', width: '1.125rem' }}
      />
    </button>
  )
}
