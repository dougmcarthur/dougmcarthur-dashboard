import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Overview, type DueReminder } from '../api'
import { DecisionDeck } from '../components/DecisionDeck'
import { ActivityList } from '../components/ActivityList'
import { TimingStrip } from '../components/TimingStrip'
import { OpenEndedRow } from '../components/OpenEndedRow'

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

  const { recentRuns, dueReminders } = data

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

      {/* Blocks C and D. Both come out of the same /api/review response as the
          deck above, so the strip cannot claim something is urgent that the
          deck does not rank, and vice versa. The old "Deadlines in 14 days"
          panel is gone: it ran a SQL BETWEEN against a TEXT column that mostly
          holds prose, matched nothing, and rendered nothing, indefinitely. */}
      <TimingStrip
        rows={queue.data?.summary.timing ?? []}
        reminders={dueReminders}
        onNav={onNav}
        onSubmitted={(r: DueReminder) => {
          patchGig.mutate({ id: r.entityId, body: { status: 'submitted' } })
          dismissReminder.mutate(r.id)
        }}
        onDismiss={(id: number) => dismissReminder.mutate(id)}
        dismissing={dismissReminder.isPending}
      />

      {queue.data && <OpenEndedRow backlog={queue.data.summary.backlog} onNav={onNav} />}

      {/* Automation activity — one line per run, prose behind a disclosure */}
      {recentRuns.length > 0 && <ActivityList runs={recentRuns} onNav={onNav} />}

      {(queue.data?.counts.needs ?? 0) === 0 &&
        (queue.data?.summary.timing.length ?? 0) === 0 &&
        (queue.data?.summary.backlog.openEnded ?? 0) === 0 &&
        dueReminders.length === 0 &&
        recentRuns.length === 0 && (
        <p className="text-gray-400 text-sm">All clear — nothing needs attention right now.</p>
      )}
    </div>
  )
}
