import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Overview, type DueReminder } from '../api'
import { DecisionDeck } from '../components/DecisionDeck'
import { TimingStrip } from '../components/TimingStrip'
import { OpenEndedRow } from '../components/OpenEndedRow'
import { DataHealthRow } from '../components/DataHealthRow'

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
        <div className="h-7 bg-sunken rounded w-40" />
        <div className="h-40 rounded-xl border border-line bg-surface shadow-card" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-danger-bg border border-danger-line px-4 py-3 text-sm text-danger-fg">
        Failed to load overview — {(error as Error)?.message}
      </div>
    )
  }

  const { dueReminders } = data

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-ink tracking-tight">Overview</h1>

      {/*
        One column until xl, then a main column and a rail.
        A single column of full-width rows on a 2560px display puts the title at
        the far left and its status a metre away at the far right, with nothing
        in between — the reading distance is the problem, not the pixel count.
        Splitting the page shortens every row and fills the space with something
        worth looking at instead of padding.
      */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr),22rem] 3xl:grid-cols-[minmax(0,1fr),26rem] gap-8 items-start">
        <div className="space-y-8 min-w-0">
          {/* The decisions come first — nothing to read past before acting. */}
          {queue.isLoading ? (
            <div className="h-40 rounded-xl border border-line bg-surface shadow-card animate-pulse" />
          ) : queue.error ? (
            <div className="rounded-xl bg-danger-bg border border-danger-line px-4 py-3 text-sm text-danger-fg">
              Could not load the decision queue — {(queue.error as Error).message}
            </div>
          ) : (
            <DecisionDeck
              items={queue.data?.items ?? []}
              total={queue.data?.counts.needs ?? 0}
              onNav={onNav}
            />
          )}

          {/* Blocks C and D. Both come out of the same /api/review response as
              the deck above, so the strip cannot claim something is urgent that
              the deck does not rank, and vice versa. */}
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
        </div>

        <aside className="space-y-8 min-w-0 xl:sticky xl:top-20" aria-label="Backlog and activity">
          {queue.data && <OpenEndedRow backlog={queue.data.summary.backlog} onNav={onNav} />}

          {/* Block F, last and quiet. Renders nothing once the counts are zero,
              and the whole block should be deleted when they stay that way. */}
          {queue.data && (
            <DataHealthRow
              health={queue.data.summary.health}
              onReview={(filter) => onNav(`review/${filter}`)}
            />
          )}
        </aside>
      </div>

      {(queue.data?.counts.needs ?? 0) === 0 &&
        (queue.data?.summary.timing.length ?? 0) === 0 &&
        (queue.data?.summary.backlog.openEnded ?? 0) === 0 &&
        dueReminders.length === 0 && (
          <p className="text-muted text-sm">All clear — nothing needs attention right now.</p>
        )}
    </div>
  )
}
