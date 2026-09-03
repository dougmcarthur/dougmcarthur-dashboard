import { useAppearance } from '../hooks/useAppearance'
import {
  TEXT_SCALE,
  type FontChoice,
  type ShellWidth,
  type TextSize,
  type ThemeChoice,
} from '../appearance'
import { Button } from './ui/Button'

/**
 * The appearance panel.
 *
 * Every control writes straight through to the document, so the page you are
 * looking at is the preview. A separate preview pane would be a smaller version
 * of the thing already filling the screen.
 */

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="py-4 border-t border-line first:border-t-0 first:pt-0">
      <div className="sm:grid sm:grid-cols-[13rem,1fr] sm:gap-6 sm:items-start">
        <div className="mb-2 sm:mb-0">
          <div className="text-sm font-medium text-ink">{label}</div>
          {hint && <p className="text-xs text-muted mt-0.5 leading-relaxed">{hint}</p>}
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}

/** A labelled radio group rendered as a segmented control. */
function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string; title?: string }>
}) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex flex-wrap gap-1 p-1 rounded-lg bg-sunken border border-line">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active
                ? 'bg-surface text-ink shadow-card'
                : 'text-muted hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-line-strong'
      }`}
    >
      <span
        className={`inline-block h-4.5 w-4.5 transform rounded-full bg-surface shadow-card transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
        style={{ height: '1.125rem', width: '1.125rem' }}
      />
    </button>
  )
}

export function AppearanceSettings() {
  const { appearance: a, set, reset, resolved } = useAppearance()

  return (
    <section
      aria-labelledby="appearance-heading"
      className="rounded-xl border border-line bg-surface shadow-card p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 id="appearance-heading" className="text-sm font-semibold text-ink">
            Appearance
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Saved in this browser only — the dashboard itself is unchanged for anyone else.
          </p>
        </div>
        <Button variant="neutral"
          type="button"
          onClick={reset}
          className="shrink-0"
        >
          Reset
        </Button>
      </div>

      <Field
        label="Theme"
        hint={a.theme === 'system' ? `Following your system, currently ${resolved}.` : undefined}
      >
        <Segmented<ThemeChoice>
          name="Theme"
          value={a.theme}
          onChange={(theme) => set({ theme })}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]}
        />
      </Field>

      <Field label="Text size" hint="Scales the entire interface, not just body copy.">
        <Segmented<TextSize>
          name="Text size"
          value={a.textSize}
          onChange={(textSize) => set({ textSize })}
          options={[
            { value: 'compact', label: 'Compact', title: `${TEXT_SCALE.compact * 16}px base` },
            { value: 'default', label: 'Default', title: '16px base' },
            { value: 'large', label: 'Large', title: `${TEXT_SCALE.large * 16}px base` },
            { value: 'xlarge', label: 'Larger', title: `${TEXT_SCALE.xlarge * 16}px base` },
          ]}
        />
      </Field>

      <Field
        label="Typeface"
        hint="Uses fonts already installed on this machine. Nothing is downloaded."
      >
        <div className="space-y-2">
          <Segmented<FontChoice>
            name="Typeface"
            value={a.font}
            onChange={(font) => set({ font })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'humanist', label: 'Humanist' },
              { value: 'serif', label: 'Serif' },
              { value: 'mono', label: 'Mono' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          {a.font === 'custom' && (
            <div>
              <label htmlFor="custom-font" className="sr-only">
                Custom font family
              </label>
              <input
                id="custom-font"
                type="text"
                value={a.customFont}
                onChange={(e) => set({ customFont: e.target.value })}
                placeholder="e.g. Iosevka, Charter, Atkinson Hyperlegible"
                className="w-full max-w-sm rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-faint"
              />
              <p className="text-xs text-muted mt-1">
                Falls back to the system stack if the name is not installed. Atkinson
                Hyperlegible is a good choice if you have it.
              </p>
            </div>
          )}
        </div>
      </Field>

      <Field
        label="Content width"
        hint="How far the layout stretches on a large display."
      >
        <Segmented<ShellWidth>
          name="Content width"
          value={a.width}
          onChange={(width) => set({ width })}
          options={[
            { value: 'comfortable', label: 'Comfortable', title: 'Caps line length for reading' },
            { value: 'wide', label: 'Wide', title: 'More on screen at once' },
            { value: 'full', label: 'Full', title: 'Use the whole viewport' },
          ]}
        />
      </Field>

      <Field
        label="Higher contrast"
        hint="Darkens secondary text and strengthens borders. Useful in bright rooms."
      >
        <Toggle
          checked={a.highContrast}
          onChange={(highContrast) => set({ highContrast })}
          label="Higher contrast"
        />
      </Field>

      <Field
        label="Underline links"
        hint="Marks links by more than colour alone."
      >
        <Toggle
          checked={a.underlineLinks}
          onChange={(underlineLinks) => set({ underlineLinks })}
          label="Underline links"
        />
      </Field>

      <Field
        label="Reduce motion"
        hint="Your system setting is already honoured; this forces it on regardless."
      >
        <Toggle
          checked={a.reduceMotion}
          onChange={(reduceMotion) => set({ reduceMotion })}
          label="Reduce motion"
        />
      </Field>

      <div className="mt-5 pt-4 border-t border-line">
        <p className="text-xs font-medium text-muted mb-2">Preview</p>
        <div className="rounded-lg border border-line bg-canvas p-4">
          <p className="text-base font-semibold text-ink">A decision that needs you</p>
          <p className="text-sm text-body mt-1 leading-relaxed">
            Costs USD 55 to enter, so nobody can submit it without your say-so.
          </p>
          <p className="text-xs text-muted mt-2">Secondary detail, at tertiary weight.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs px-2 py-0.5 rounded-md bg-danger-bg text-danger-fg border border-danger-line">Overdue</span>
            <span className="text-xs px-2 py-0.5 rounded-md bg-warn-bg text-warn-fg border border-warn-line">Costs money</span>
            <span className="text-xs px-2 py-0.5 rounded-md bg-success-bg text-success-fg border border-success-line">Submitted</span>
            <span className="text-xs px-2 py-0.5 rounded-md bg-info-bg text-info-fg border border-info-line">Window opens later</span>
          </div>
        </div>
      </div>
    </section>
  )
}
