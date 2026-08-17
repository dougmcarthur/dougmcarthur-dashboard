import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { SkeletonList } from '../components/Skeleton'

const PAGE_SIZE = 50

export function TaskRunsPage() {
  const [offset, setOffset] = useState(0)

  const { data = [], isLoading, error, isFetching } = useQuery({
    queryKey: ['taskRuns', offset],
    queryFn: () => api.taskRuns.list({ limit: PAGE_SIZE, offset }),
  })

  if (error) {
    return (
      <div className="rounded-lg bg-danger-soft border border-danger px-4 py-3 text-sm text-danger">
        Failed to load task runs — {(error as Error).message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Task Run Log</h1>
        {offset > 0 && (
          <p className="text-xs text-ink-subtle">Showing runs {offset + 1}–{offset + data.length}</p>
        )}
      </div>

      {isLoading ? (
        <SkeletonList rows={8} />
      ) : (
        <div className="bg-surface border border-line rounded-lg divide-y divide-line">
          {data.map((r) => (
            <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs bg-surface-muted border border-line rounded px-1.5 py-0.5 text-ink-muted font-mono">
                    {r.taskId}
                  </code>
                  {r.itemsAdded ? (
                    <span className="text-xs text-ink-subtle">+{r.itemsAdded} items</span>
                  ) : null}
                </div>
                {r.summary && (
                  <p className="text-sm text-ink-muted mt-1 leading-relaxed">{r.summary}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0 pt-0.5">
                <StatusBadge status={r.status} />
                <time className="text-xs text-ink-subtle tabular-nums whitespace-nowrap">
                  {new Date(r.runAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
            </div>
          ))}
          {data.length === 0 && (
            <p className="px-4 py-12 text-center text-ink-subtle text-sm">No task runs recorded yet.</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          disabled={offset === 0 || isFetching}
          className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-ink-muted hover:bg-surface-muted disabled:opacity-40 transition-colors"
        >
          ← Newer
        </button>
        <p className="text-xs text-ink-subtle">{data.length} runs</p>
        <button
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
          disabled={data.length < PAGE_SIZE || isFetching}
          className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-ink-muted hover:bg-surface-muted disabled:opacity-40 transition-colors"
        >
          Older →
        </button>
      </div>
    </div>
  )
}
