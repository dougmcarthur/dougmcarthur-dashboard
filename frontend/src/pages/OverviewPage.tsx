import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Overview } from '../api'
import { StatusBadge } from '../components/StatusBadge'

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

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
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="h-8 bg-gray-100 rounded w-12 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-28" />
            </div>
          ))}
        </div>
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

  const { stats, recentRuns, pendingReview, upcomingDeadlines, dueReminders } = data
  const totalPending = pendingReview.gigs.length + pendingReview.sync.length + pendingReview.promo.length

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Overview</h1>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Gig Opportunities" value={stats.totalGigs} />
          <StatCard label="Sync Targets" value={stats.totalSync} />
          <StatCard label="Promo Drafts" value={stats.totalPromo} />
        </div>
      </div>

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

      {/* Needs review */}
      {totalPending > 0 && (
        <div>
          <SectionHeader title="Needs review" count={totalPending} />
          <div className="space-y-2">
            {pendingReview.gigs.map((g) => (
              <div key={g.id} className="flex items-center justify-between bg-white border border-yellow-200 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{g.name}</p>
                  <p className="text-xs text-gray-500">
                    {g.type}{g.deadline ? ` · deadline ${g.deadline}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={patchGig.isPending}
                    onClick={() => patchGig.mutate({ id: g.id, body: { status: 'approved' } })}
                    className="text-xs px-2.5 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-40 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    disabled={patchGig.isPending}
                    onClick={() => patchGig.mutate({ id: g.id, body: { status: 'rejected' } })}
                    className="text-xs px-2.5 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"
                  >
                    Reject
                  </button>
                  <button onClick={() => onNav('gigs')} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    Details →
                  </button>
                </div>
              </div>
            ))}
            {pendingReview.sync.map((s) => (
              <div
                key={s.id}
                onClick={() => onNav('sync')}
                className="flex items-center justify-between bg-white border border-purple-200 rounded-lg px-4 py-3 cursor-pointer hover:border-purple-300 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.agencyType ?? 'Sync target'}</p>
                </div>
                <StatusBadge status={s.status} />
              </div>
            ))}
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

      {totalPending === 0 && upcomingDeadlines.length === 0 && dueReminders.length === 0 && recentRuns.length === 0 && (
        <p className="text-gray-400 text-sm">All clear — nothing needs attention right now.</p>
      )}
    </div>
  )
}
