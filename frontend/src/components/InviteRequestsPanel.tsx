import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type InviteRequestItem } from '../api'
import type { InviteRequestStatus } from '../../../shared/inviteRequests'
import { relativeTime } from '../format'
import { Button } from './ui/Button'
import { Explainer } from './ui/Explainer'
import { Card } from './ui/Surface'

/**
 * Requests for an invitation, from the landing page.
 *
 * **Invite** fills the invitation form below with the name and address and
 * stops there: issuing is still the owner pressing Create and touching the
 * passkey, with the address in front of them. A request is a stranger's text
 * and grants nothing by existing.
 */
export function InviteRequestsPanel({ onInvite }: { onInvite: (r: InviteRequestItem) => void }) {
  const qc = useQueryClient()
  const requests = useQuery({ queryKey: ['admin', 'invite-requests'], queryFn: api.admin.inviteRequests })
  const set = useMutation({
    mutationFn: ({ id, status }: { id: number; status: InviteRequestStatus }) => api.admin.setInviteRequest(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'invite-requests'] }),
  })

  const items = requests.data?.items ?? []
  const open = items.filter((r) => r.status === 'new')
  const done = items.filter((r) => r.status !== 'new')

  return (
    <section className="space-y-4">
      <header>
        <Explainer as="h2" title="Invitation requests">
          Sent from the public page. Invite fills the form below; nothing is sent until you create the invitation.
          Answered requests are deleted after 90 days, unanswered ones after a year.
        </Explainer>
      </header>

      {requests.isLoading ? (
        <div className="h-16 bg-sunken rounded-xl animate-pulse" />
      ) : open.length === 0 ? (
        <p className="text-sm text-muted">No open requests.</p>
      ) : (
        <ul className="space-y-3">
          {open.map((r) => (
            <Card as="li" key={r.id} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm text-ink">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted"> · {r.email} · {relativeTime(r.createdAt)}</span>
                </p>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => onInvite(r)}>
                    Invite
                  </Button>
                  <Button
                    variant="quiet"
                    size="sm"
                    disabled={set.isPending}
                    onClick={() => set.mutate({ id: r.id, status: 'declined' })}
                  >
                    Decline
                  </Button>
                </div>
              </div>
              <p className="text-sm text-body whitespace-pre-line break-words">{r.message}</p>
            </Card>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <details className="rounded-lg border border-line bg-surface px-4 py-3">
          <summary className="text-sm text-body cursor-pointer">{done.length} answered</summary>
          <ul className="mt-3 space-y-1.5">
            {done.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-body">
                  {r.name} <span className="text-muted">· {r.email}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {r.status === 'invited' ? 'Invited' : 'Declined'}
                  <Button variant="quiet" size="sm" onClick={() => set.mutate({ id: r.id, status: 'new' })}>
                    Reopen
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {set.error && (
        <p className="text-sm text-danger-fg">{set.error instanceof Error ? set.error.message : 'Could not update it'}</p>
      )}
    </section>
  )
}
