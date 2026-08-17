import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Overview, type GigWithPrep } from '../api'
import { StatusBadge } from '../components/StatusBadge'

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface rounded-lg border border-line p-5">
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="text-sm text-ink-muted mt-0.5">{label}</p>
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
    <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
      {title}
      {count !== undefined && (
        <span className="ml-2 inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted">
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
            <div key={i} className="bg-surface rounded-lg border border-line p-5">
              <div className="h-8 bg-surface-muted rounded w-12 mb-2" />
              <div className="h-4 bg-surface-muted rounded w-28" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-lg bg-danger-soft border border-danger px-4 py-3 text-sm text-danger">
        Failed to load overview — {(error as Error)?.message}
      </div>
    )
  }

  const {
    stats,
    recentRuns,
    pendingReview,
    upcomingDeadlines,
    dueReminders,
    awaitingWindow = [],
    applicationsReady = [],
    applicationsBlocked = [],
  } = data
  const totalPending = pendingReview.gigs.length + pendingReview.sync.length + pendingReview.promo.length

  const openGig = (id: number) => {
    window.location.hash = `gigs/${id}`
  }

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div>
        <h1 className="text-xl font-semibold text-ink mb-4">Overview</h1>
        <div className="grid grid-cols-5 gap-4">
          <StatCard label="Gig Opportunities" value={stats.totalGigs} />
          <StatCard label="Awaiting window" value={stats.awaitingWindow ?? 0} />
          <StatCard label="Answers to review" value={stats.applicationsReady ?? 0} />
          <StatCard label="Sync Targets" value={stats.totalSync} />
          <StatCard label="Promo Drafts" value={stats.totalPromo} />
        </div>
      </div>

      {/* Answers prepared and waiting on a read-through */}
      {applicationsReady.length > 0 && (
        <div>
          <SectionHeader title="Prepared answers to review" count={applicationsReady.length} />
          <div className="bg-surface border border-ready rounded-lg divide-y divide-line">
            {applicationsReady.map((g: GigWithPrep) => (
              <div
                key={g.id}
                onClick={() => openGig(g.id)}
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-ready-soft/50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{g.name}</p>
                  <p className="text-xs text-ink-muted">
                    {g.prep.approved}/{g.prep.total} approved
                    {g.prep.needsInput > 0 ? ` · ${g.prep.needsInput} need your input` : ''}
                    {g.submissionOpensAt ? ` · opens ${g.submissionOpensAt}` : ''}
                  </p>
                </div>
                <span className="text-xs text-ink-subtle">Review →</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filed for later */}
      {awaitingWindow.length > 0 && (
        <div>
          <SectionHeader title="Waiting on the submission window" count={awaitingWindow.length} />
          <div className="bg-surface border border-scheduled rounded-lg divide-y divide-line">
            {awaitingWindow.map((g: GigWithPrep) => {
              const days = g.submissionOpensAt ? daysUntil(g.submissionOpensAt) : null
              return (
                <div
                  key={g.id}
                  onClick={() => openGig(g.id)}
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-scheduled-soft transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{g.name}</p>
                    <p className="text-xs text-ink-muted">
                      {g.type}
                      {g.prep.total > 0
                        ? ` · ${g.prep.total} answers prepared`
                        : ' · form read and answered the day it opens'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-semibold text-scheduled tabular-nums">
                      {days === null ? '' : days <= 0 ? 'Opens today' : `${days}d`}
                    </span>
                    <span className="text-xs text-ink-subtle">{g.submissionOpensAt}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Forms that couldn't be read automatically */}
      {applicationsBlocked.length > 0 && (
        <div>
          <SectionHeader title="Applications needing manual setup" count={applicationsBlocked.length} />
          <div className="bg-surface border border-pending rounded-lg divide-y divide-line">
            {applicationsBlocked.map((g: GigWithPrep) => (
              <div
                key={g.id}
                onClick={() => openGig(g.id)}
                className="flex items-start justify-between px-4 py-3 cursor-pointer hover:bg-pending-soft/50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{g.name}</p>
                  <p className="text-xs text-pending mt-0.5">{g.prepError ?? 'Prep did not complete.'}</p>
                </div>
                <span className="text-xs text-ink-subtle shrink-0 ml-4">Open →</span>
              </div>
            ))}
          </div>
        </div>
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
                  className={`flex items-start justify-between bg-surface rounded-lg px-4 py-3 border ${
                    overdue ? 'border-danger' : 'border-pending'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {r.gigName ?? `${r.entityType} #${r.entityId}`}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {r.gigDeadline ? `Deadline ${r.gigDeadline}` : ''}
                      {r.gigStatus ? ` · ${r.gigStatus.replace(/_/g, ' ')}` : ''}
                    </p>
                    <p className={`text-xs mt-0.5 font-medium ${overdue ? 'text-danger' : 'text-pending'}`}>
                      {overdue
                        ? `${Math.abs(days!)}d overdue — submitted?`
                        : days === 0
                        ? 'Due today — submitted?'
                        : `Due in ${days}d — submitted?`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-4">
                    {(r.gigStatus === 'approved' || r.gigStatus === 'awaiting_window') && (
                      <button
                        onClick={() => {
                          patchGig.mutate({ id: r.entityId, body: { status: 'submitted' } })
                          dismissReminder.mutate(r.id)
                        }}
                        className="text-xs px-2.5 py-1 rounded-md bg-submitted-soft text-submitted hover:brightness-95 transition-colors"
                      >
                        Mark Submitted
                      </button>
                    )}
                    <button
                      onClick={() => dismissReminder.mutate(r.id)}
                      disabled={dismissReminder.isPending}
                      className="text-xs px-2.5 py-1 rounded-md border border-line text-ink-muted hover:bg-surface-muted disabled:opacity-40 transition-colors"
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
          <div className="bg-surface border border-pending rounded-lg divide-y divide-line">
            {upcomingDeadlines.map((g) => {
              const days = daysUntil(g.deadline!)
              return (
                <div
                  key={g.id}
                  onClick={() => onNav('gigs')}
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-pending-soft transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{g.name}</p>
                    <p className="text-xs text-ink-muted">
                      {g.type}
                      {g.submissionMethod ? ` · via ${g.submissionMethod}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {g.googleEventId && <span className="text-xs text-ink-subtle" title="Synced to Calendar">📅</span>}
                    <span className={`text-xs font-semibold tabular-nums ${days <= 3 ? 'text-danger' : days <= 7 ? 'text-pending' : 'text-pending'}`}>
                      {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                    </span>
                    <span className="text-xs text-ink-subtle">{g.deadline}</span>
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
              <div key={g.id} className="flex items-center justify-between bg-surface border border-pending rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{g.name}</p>
                  <p className="text-xs text-ink-muted">
                    {g.type}{g.deadline ? ` · deadline ${g.deadline}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={patchGig.isPending}
                    onClick={() => patchGig.mutate({ id: g.id, body: { status: 'approved' } })}
                    className="text-xs px-2.5 py-1 rounded-md bg-ready-soft text-ready hover:brightness-95 disabled:opacity-40 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    disabled={patchGig.isPending}
                    onClick={() => patchGig.mutate({ id: g.id, body: { status: 'rejected' } })}
                    className="text-xs px-2.5 py-1 rounded-md bg-danger-soft text-danger hover:brightness-95 disabled:opacity-40 transition-colors"
                  >
                    Reject
                  </button>
                  <button onClick={() => onNav('gigs')} className="text-xs text-ink-subtle hover:text-ink-muted transition-colors">
                    Details →
                  </button>
                </div>
              </div>
            ))}
            {pendingReview.sync.map((s) => (
              <div
                key={s.id}
                onClick={() => onNav('sync')}
                className="flex items-center justify-between bg-surface border border-library rounded-lg px-4 py-3 cursor-pointer hover:border-library transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{s.name}</p>
                  <p className="text-xs text-ink-muted">{s.agencyType ?? 'Sync target'}</p>
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
            <button onClick={() => onNav('runs')} className="text-xs text-ink-subtle hover:text-ink-muted transition-colors">
              View all →
            </button>
          </div>
          <div className="bg-surface border border-line rounded-lg divide-y divide-line">
            {recentRuns.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-xs font-mono text-ink-muted">{r.taskId}</p>
                  {r.summary && <p className="text-xs text-ink-muted mt-0.5">{r.summary}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {r.itemsAdded ? <span className="text-xs text-ink-subtle">+{r.itemsAdded}</span> : null}
                  <StatusBadge status={r.status} />
                  <span className="text-xs text-ink-subtle">{new Date(r.runAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalPending === 0 &&
        upcomingDeadlines.length === 0 &&
        dueReminders.length === 0 &&
        awaitingWindow.length === 0 &&
        applicationsReady.length === 0 &&
        applicationsBlocked.length === 0 &&
        recentRuns.length === 0 && (
        <p className="text-ink-subtle text-sm">All clear — nothing needs attention right now.</p>
      )}
    </div>
  )
}
