import { useEffect, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { SkeletonList } from '../components/Skeleton'

const PAGE_SIZE = 50

const FILTER_INPUT =
  'text-sm border border-line-strong rounded-md px-3 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition'

export function TaskRunsPage() {
  const [offset, setOffset] = useState(0)
  const [task, setTask] = useState('')
  const [status, setStatus] = useState('')

  // Filtering is done by the Worker, because the log is paginated: narrowing a
  // page of fifty to the three failures on it would hide every other failure
  // in the log and call it a filter.
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['taskRuns', offset, task, status],
    queryFn: () => api.taskRuns.list({ limit: PAGE_SIZE, offset, task, status }),
    // Keeps the rows on screen while a filter change is in flight, so the page
    // does not collapse to a skeleton on every keystroke of a decision.
    placeholderData: keepPreviousData,
  })

  // A filter that leaves you on page four of a two-page result looks like an
  // empty log.
  useEffect(() => {
    setOffset(0)
  }, [task, status])

  const runs = data?.runs ?? []
  const total = data?.total ?? 0
  const facets = data?.facets ?? { tasks: [], statuses: [] }
  const filtered = task !== '' || status !== ''

  if (error) {
    return (
      <div className="rounded-lg bg-danger-bg border border-danger-line px-4 py-3 text-sm text-danger-fg">
        Failed to load task runs — {(error as Error).message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">Task Run Log</h1>
        <div className="flex items-center gap-2">
          {facets.tasks.length > 1 && (
            <select
              value={task}
              onChange={(e) => setTask(e.target.value)}
              aria-label="Filter by task"
              className={FILTER_INPUT}
            >
              <option value="">All tasks</option>
              {facets.tasks.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
          {facets.statuses.length > 1 && (
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by status"
              className={FILTER_INPUT}
            >
              <option value="">All statuses</option>
              {facets.statuses.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          )}
          {filtered && (
            <button
              onClick={() => { setTask(''); setStatus('') }}
              className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-body hover:bg-sunken transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <SkeletonList rows={8} />
      ) : (
        <div className="bg-surface border border-line rounded-xl shadow-card divide-y divide-line">
          {runs.map((r) => (
            <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setTask(r.taskId)}
                    title={`Show only ${r.taskId}`}
                    className="text-xs bg-sunken border border-line rounded px-1.5 py-0.5 text-body hover:border-line-strong transition-colors"
                  >
                    {r.taskId}
                  </button>
                  {r.itemsAdded ? (
                    <span className="text-xs text-muted">
                      +{r.itemsAdded} {r.itemsAdded === 1 ? 'item' : 'items'}
                    </span>
                  ) : null}
                </div>
                {r.summary && (
                  <p className="text-sm text-body mt-1 leading-relaxed">{r.summary}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0 pt-0.5">
                <StatusBadge status={r.status} />
                <time className="text-xs text-muted tabular-nums whitespace-nowrap">
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
          {runs.length === 0 && (
            <p className="px-4 py-12 text-center text-muted text-sm">
              {filtered ? 'No runs match these filters.' : 'No task runs recorded yet.'}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          disabled={offset === 0 || isFetching}
          className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-body hover:bg-sunken disabled:opacity-40 transition-colors"
        >
          ← Newer
        </button>
        <p className="text-xs text-muted tabular-nums">
          {total === 0
            ? 'No runs'
            : `${offset + 1}–${offset + runs.length} of ${total}${filtered ? ' matching' : ''}`}
        </p>
        <button
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
          disabled={offset + runs.length >= total || isFetching}
          className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-body hover:bg-sunken disabled:opacity-40 transition-colors"
        >
          Older →
        </button>
      </div>
    </div>
  )
}
