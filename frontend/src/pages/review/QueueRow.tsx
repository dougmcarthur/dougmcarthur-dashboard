import { KindTag } from '../../components/ReviewPanels'
import type { ReviewItem } from '../../../../shared/reviewQueue'
import { flagTone } from '../../../../shared/flagTone'

/** One row in the left rail: enough to choose from, never enough to decide on. */
export function QueueRow({
  item,
  active,
  onSelect,
}: {
  item: ReviewItem
  active: boolean
  onSelect: () => void
}) {
  const top = item.flags[0]
  return (
    <button
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={`w-full text-left px-3 py-2.5 transition-colors ${
        active ? 'bg-accent-soft' : 'hover:bg-sunken'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <KindTag kind={item.kind} />
        {top && (
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              flagTone(top) === 'danger' ? 'bg-danger-solid' : flagTone(top) === 'waiting' ? 'bg-warn-fg' : 'bg-line'
            }`}
          />
        )}
        <span className="text-[11px] text-muted truncate">{item.subtitle}</span>
      </div>
      <p className={`text-sm leading-snug ${active ? 'font-semibold text-ink' : 'font-medium text-body'}`}>
        {item.title}
      </p>
      {top && <p className="text-[11px] text-muted mt-0.5 truncate">{top.label}</p>}
    </button>
  )
}
