import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Overview } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { DecisionDeck } from '../components/DecisionDeck'

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr).getTime() - today.getTime()) / 86400_000)
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
      {title}
      {count !== undefined && (
        <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {count}
        </span>
      )}
    </h2>
  )
}

export function OverviewPage({ onNav }: { onNav: (p: string) => void }) {
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery<Overview>({
    queryKey: ['overview'],
    queryFn: api.overview,
  })

  // The deck asks the Worker what needs deciding — the same endpoint and the
  // same ordering the Review screen uses, so the two cannot drift apart.
  const queue = useQuery({
    queryKey: ['review', 'needs'],
    queryFn: () => api.review({ filter: 'needs' }),
  })

  const patchGig = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof api.gigs.patch>[1] }) =>
      api.gigs.patch(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['overview'] }),
  })

  const dismissReminder = useMutation({
    mutationFn: (id: number) => api.reminders.dismiss(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['overview'] }),
  })

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-6 bg-gray-100 rounded w-32" />
        <div className="h-40 rounded-lg border border-gray-200 bg-white" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        Failed to load overview — {(error as Error)?.message}
      </div>
    )
  }

  const { recentRuns, upcomingDeadlines, dueReminders } = data

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">Overview</h1>

      {/* The decisions come first — nothing to read past before acting. */}
      {queue.isLoading ? (
        <div className="h-40 rounded-lg border border-gray-200 bg-white animate-pulse" />
      ) : queue.error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Could not load the decision queue — {(queue.error as Error).message}
        </div>
      ) : (
        <DecisionDeck
          items={queue.data?.items ?? []}
          total={queue.data?.counts.needs ?? 0}
          onNav={onNav}
        />
      )}

      {/* Due reminders */}
      {dueReminders.length > 0 && (
        <div>
          <SectionHeader title="Follow up" count={dueReminders.length} />
          <div className="space-y-2">
            {dueReminders.map((r) => {
              const days = r.scheduledFor ? daysUntil(r.scheduledFor) : null
              const overdue = days !== null && days < 0
              return (
                <div
                  key={r.id}
                  className={`flex items-start justify-between bg-white rounded-lg px-4 py-3 border ${
                    overdue ? 'border-red-200' : 'border-amber-200'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {r.gigName ?? `${r.entityType} #${r.entityId}`}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {r.gigDeadline ? `Deadline ${r.gigDeadline}` : ''}
                      {r.gigStatus ? ` · ${r.gigStatus.replace(/_/g, ' ')}` : ''}
                    </p>
                    <p className={`text-xs mt-0.5 font-medium ${overdue ? 'text-red-600' : 'text-amber-600'}`}>
                      {overdue
                        ? `${Math.abs(days!)}d overdue — submitted?`
                        : days === 0
                        ? 'Due today — submitted?'
                        : `Due in ${days}d — submitted?`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-4">
                    {r.gigStatus === 'approved' && (
                      <button
                        onClick={() => {
                          patchGig.mutate({ id: r.entityId, body: { status: 'submitted' } })
                          dismissReminder.mutate(r.id)
                        }}
                        className="text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                      >
                        Mark Submitted
                      </button>
                    )}
                    <button
                      onClick={() => dismissReminder.mutate(r.id)}
                      disabled={dismissReminder.isPending}
                      className="text-xs px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Upcoming deadlines */}
      {upcomingDeadlines.length > 0 && (
        <div>
          <SectionHeader title="Deadlines in 14 days" count={upcomingDeadlines.length} />
          <div className="bg-white border border-orange-200 rounded-lg divide-y divide-orange-50">
            {upcomingDeadlines.map((g) => {
              const days = daysUntil(g.deadline!)
              return (
                <div
                  key={g.id}
                  onClick={() => onNav('gigs')}
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-orange-50/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{g.name}</p>
                    <p className="text-xs text-gray-500">
                      {g.type}
                      {g.submissionMethod ? ` · via ${g.submissionMethod}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {g.googleEventId && <span className="text-xs text-gray-400" title="Synced to Calendar">📅</span>}
                    <span className={`text-xs font-semibold tabular-nums ${days <= 3 ? 'text-red-600' : days <= 7 ? 'text-orange-600' : 'text-yellow-600'}`}>
                      {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                    </span>
                    <span className="text-xs text-gray-400">{g.deadline}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent runs */}
      {recentRuns.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionHeader title="Recent task runs" />
            <button onClick={() => onNav('runs')} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              View all →
            </button>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {recentRuns.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-xs font-mono text-gray-600">{r.taskId}</p>
                  {r.summary && <p className="text-xs text-gray-500 mt-0.5">{r.summary}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {r.itemsAdded ? <span className="text-xs text-gray-400">+{r.itemsAdded}</span> : null}
                  <StatusBadge status={r.status} />
                  <span className="text-xs text-gray-400">{new Date(r.runAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(queue.data?.counts.needs ?? 0) === 0 && upcomingDeadlines.length === 0 && dueReminders.length === 0 && recentRuns.length === 0 && (
        <p className="text-gray-400 text-sm">All clear — nothing needs attention right now.</p>
      )}
    </div>
  )
}
