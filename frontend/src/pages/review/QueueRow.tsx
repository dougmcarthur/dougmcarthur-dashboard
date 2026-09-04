import { KindTag } from '../../components/ReviewPanels'
import type { ReviewItem } from '../../../../shared/reviewQueue'

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
      className={`w-full text-left px-3 py-2.5 border-l-2 transition-colors ${
        active ? 'bg-accent/[0.04] border-accent' : 'border-transparent hover:bg-sunken'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <KindTag kind={item.kind} />
        {top && (
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              top.severity === 'danger' ? 'bg-danger-solid' : top.severity === 'warn' ? 'bg-line-strong' : 'bg-line'
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
