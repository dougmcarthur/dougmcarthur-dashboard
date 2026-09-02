import { useState } from 'react'
import { StatusBadge } from './StatusBadge'
import { Chevron } from './Chevron'
import type { TaskRun } from '../api'
import { shortDate } from '../format'

/**
 * What the automation did, one line per run.
 *
 * The summaries are three to five lines of agent prose each. Inline, fifteen
 * of them were roughly 80% of the Overview — a log presented as headline news.
 * They answer "what did the runs do last Tuesday", which is a question asked
 * occasionally, so they live behind a disclosure and the full history lives on
 * the Log page.
 */

const SHOWN = 5

export function ActivityList({ runs, onNav }: { runs: TaskRun[]; onNav: (page: string) => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const shown = runs.slice(0, SHOWN)

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
          Recent runs
        </h2>
        <button
          onClick={() => onNav('runs')}
          className="text-xs text-muted hover:text-body transition-colors"
        >
          {runs.length > SHOWN ? `View all ${runs.length} →` : 'View all →'}
        </button>
      </div>

      <div className="bg-surface border border-line rounded-xl shadow-card divide-y divide-line">
        {shown.map((run) => {
          const isOpen = expanded.has(run.id)
          const hasSummary = Boolean(run.summary)
          return (
            <div key={run.id}>
              <button
                onClick={() => hasSummary && toggle(run.id)}
                aria-expanded={hasSummary ? isOpen : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                  hasSummary ? 'hover:bg-sunken cursor-pointer' : 'cursor-default'
                }`}
              >
                {hasSummary ? (
                  <Chevron open={isOpen} />
                ) : (
                  <span className="w-4 shrink-0" aria-hidden="true" />
                )}
                <span className="text-xs text-body truncate">{run.taskId}</span>
                <span className="ml-auto text-xs text-muted tabular-nums shrink-0">
                  {run.itemsAdded ? `+${run.itemsAdded}` : ''}
                </span>
                <StatusBadge status={run.status} />
                <span className="text-xs text-muted tabular-nums shrink-0 w-16 text-right">
                  {shortDate(run.runAt)}
                </span>
              </button>

              {isOpen && run.summary && (
                <p className="px-3 pb-3 pl-10 text-xs text-body leading-relaxed max-w-3xl">
                  {run.summary}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
