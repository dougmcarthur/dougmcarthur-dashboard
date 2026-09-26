/**
 * A row of tabs with an underline, shared by Artist and Settings.
 *
 * One row that scrolls sideways on a phone, rather than tabs that wrap into
 * two rows or squeeze their labels onto two lines. The rule lives on the inner
 * strip, sized to the tabs but never narrower than the page: an overflow
 * container clips at its padding box, so the -mb-px overlap between a tab's
 * underline and the rule has to happen inside it or it becomes a 1px vertical
 * scroll.
 *
 * Extracted when the second page wanted it, rather than copied.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onSelect,
  label,
}: {
  tabs: ReadonlyArray<{ id: T; label: string }>
  active: T
  onSelect: (id: T) => void
  /** Names the set for a screen reader: "Settings sections". */
  label: string
}) {
  return (
    <div className="overflow-x-auto">
      <div role="tablist" aria-label={label} className="flex gap-0.5 border-b border-line w-max min-w-full">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => onSelect(tab.id)}
            className={`px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              active === tab.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}
