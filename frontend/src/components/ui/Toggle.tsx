export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** What the switch controls, said for what happens when it is on: "Read this source". */
  label: string
  disabled?: boolean
  className?: string
  /**
   * Words for each position, shown beside the switch. A switch that says its
   * state only by where the knob is and what colour the track is leaves out
   * anybody who cannot tell the two apart, so a list of them says it in text too.
   */
  stateText?: { on: string; off: string }
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
  stateText,
}: ToggleProps) {
  const control = (
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

  if (!stateText) return control

  return (
    <span className="inline-flex items-center gap-2">
      {/* Hidden from a screen reader, which already hears the state from the switch. */}
      <span aria-hidden className="min-w-[3rem] text-right text-xs text-muted">
        {checked ? stateText.on : stateText.off}
      </span>
      {control}
    </span>
  )
}
