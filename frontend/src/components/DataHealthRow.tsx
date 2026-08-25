import type { DataHealth } from '../api'

/**
 * Block F — what is wrong with the data, as opposed to what needs deciding.
 *
 * Small, factual, and self-hiding: when every count is zero the block does not
 * render at all. It exists to convert findings that were previously invisible —
 * they lived in an audit document nobody opens — into something with a count
 * and a way in. Delete it once the underlying issues are gone; a permanently
 * clean health row is furniture.
 */
export function DataHealthRow({
  health,
  onReview,
}: {
  health: DataHealth
  onReview: (filter: string) => void
}) {
  if (health.clean) return null

  const parts: Array<{ key: string; text: string; onClick?: () => void }> = []

  if (health.conflicts > 0) {
    parts.push({
      key: 'conflicts',
      text: `${health.conflicts} ${health.conflicts === 1 ? 'item contradicts itself' : 'items contradict themselves'}`,
      onClick: () => onReview('conflict'),
    })
  }
  if (health.proseDeadlines > 0) {
    parts.push({
      key: 'prose',
      text: `${health.proseDeadlines} ${health.proseDeadlines === 1 ? 'deadline is' : 'deadlines are'} not a date`,
    })
  }
  if (health.orphanedReminders > 0) {
    parts.push({
      key: 'orphans',
      text: `${health.orphanedReminders} orphaned ${health.orphanedReminders === 1 ? 'reminder' : 'reminders'}`,
    })
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-xs text-gray-400">
      <span className="text-gray-400">Data health:</span>
      {parts.map((p, i) => (
        <span key={p.key}>
          {p.onClick ? (
            <button onClick={p.onClick} className="underline decoration-dotted hover:text-gray-600 transition-colors">
              {p.text}
            </button>
          ) : (
            p.text
          )}
          {i < parts.length - 1 && <span className="text-gray-300"> ·</span>}
        </span>
      ))}
    </div>
  )
}
