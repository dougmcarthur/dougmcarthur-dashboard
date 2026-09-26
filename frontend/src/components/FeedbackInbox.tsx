import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type FeedbackItem } from '../api'
import { describeContext, feedbackKindLabel } from '../../../shared/feedback'
import { relativeTime } from '../format'
import { Button } from './ui/Button'
import { Explainer } from './ui/Explainer'
import { Card } from './ui/Surface'

/**
 * What artists sent from the feedback form, on the oversight surface.
 *
 * The context is rendered by the same `describeContext` the sender's form
 * used, so the owner reads the list the artist read before pressing Send.
 */
export function FeedbackInbox() {
  const qc = useQueryClient()
  const inbox = useQuery({ queryKey: ['admin', 'feedback'], queryFn: api.admin.feedback })
  const markRead = useMutation({
    mutationFn: (id: number) => api.admin.markFeedbackRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
  })

  const items = inbox.data?.items ?? []
  const unread = items.filter((i) => !i.readAt)
  const read = items.filter((i) => i.readAt)

  return (
    <section className="space-y-4">
      <header>
        <Explainer as="h2" title="Feedback">
          Sent from the question-mark menu. Each message carries the page it was sent from and
          any errors in the half hour before — the same list the sender saw before sending.
        </Explainer>
      </header>

      {inbox.isLoading ? (
        <div className="h-16 bg-sunken rounded-xl animate-pulse" />
      ) : inbox.error ? (
        <p className="text-sm text-danger-fg">
          {inbox.error instanceof Error ? inbox.error.message : 'Could not read feedback.'}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <>
          {unread.length === 0 ? (
            <p className="text-sm text-muted">Nothing unread.</p>
          ) : (
            <ul className="space-y-3">
              {unread.map((item) => (
                <FeedbackRow
                  key={item.id}
                  item={item}
                  onRead={() => markRead.mutate(item.id)}
                  busy={markRead.isPending}
                />
              ))}
            </ul>
          )}
          {read.length > 0 && (
            <details className="rounded-lg border border-line bg-surface px-4 py-3">
              <summary className="text-sm text-body cursor-pointer">
                {read.length} read {read.length === 1 ? 'message' : 'messages'}
              </summary>
              <ul className="mt-3 space-y-3">
                {read.map((item) => (
                  <FeedbackRow key={item.id} item={item} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}

function FeedbackRow({ item, onRead, busy }: { item: FeedbackItem; onRead?: () => void; busy?: boolean }) {
  return (
    <Card as="li" className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-ink">
          <span className="font-medium">{feedbackKindLabel(item.kind)}</span>
          <span className="text-muted"> · {item.from ?? 'Unnamed'} · {relativeTime(item.createdAt)}</span>
        </p>
        {onRead && (
          <Button variant="quiet" size="sm" onClick={onRead} disabled={busy}>
            Mark read
          </Button>
        )}
      </div>
      <p className="text-sm text-body whitespace-pre-line break-words">{item.message}</p>
      {item.context ? (
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
          {describeContext(item.context).map((line) => (
            <div key={line.label} className="contents">
              <dt className="text-muted">{line.label}</dt>
              <dd className="text-body whitespace-pre-line break-words">{line.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-faint">The context that came with this could not be read.</p>
      )}
    </Card>
  )
}
