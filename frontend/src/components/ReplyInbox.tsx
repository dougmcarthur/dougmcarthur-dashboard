import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type GigReply } from '../api'
import { gigStatusMeta, normaliseGigStatus, nextGigStatuses, type GigStatus } from '../../../shared/gigStatus'
import { shortDate } from '../format'
import { Button } from './ui/Button'
import { Select } from './ui/Field'

/**
 * Phase 4 on screen: what arrived in the mail, and what the app thinks it
 * means.
 *
 * Every card is a proposal, and the layout says so. The organiser's own
 * sentence is quoted rather than summarised, the reason the reply was tied to
 * an application is spelled out, and accepting is two separate statements —
 * "yes, this is about that gig" and "yes, move it" — because they can be
 * wrong independently. A reply from a stranger's address about the right
 * festival is the common case; a correctly-matched reply read the wrong way is
 * the dangerous one.
 */

const TONE: Record<string, string> = {
  declined: 'border-danger-line text-danger-fg',
  invited: 'border-success-line text-success-fg',
  info_requested: 'border-warn-line text-warn-fg',
  acknowledged: 'border-info-line text-info-fg',
  unclear: 'border-line text-muted',
}

function Card({
  reply,
  gigs,
  busy,
  onAccept,
  onDismiss,
}: {
  reply: GigReply
  gigs: Array<{ id: number; name: string; status: string }>
  busy: boolean
  onAccept: (gigId: number, status: GigStatus | null) => void
  onDismiss: () => void
}) {
  const [chosen, setChosen] = useState<number | ''>(reply.gigId ?? '')
  const gigId = chosen === '' ? null : Number(chosen)
  const gig = gigs.find((g) => g.id === gigId)
  const top = reply.matchSignals[0]

  const proposed = reply.proposedStatus as GigStatus | null
  // Offered only when the pipeline actually allows it from where the row is —
  // a reply reading as `declined` on a gig already marked declined has nothing
  // to apply, and the button would 400.
  const canApply =
    proposed && gig && nextGigStatuses(normaliseGigStatus(gig.status)).includes(proposed)

  return (
    <div className="border border-line rounded-lg p-3 bg-surface">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-md border bg-surface ${TONE[reply.classification] ?? TONE.unclear}`}>
          {reply.classLabel}
        </span>
        {reply.classConfidence === 'low' && (
          <span className="text-xs text-faint">low confidence</span>
        )}
        {reply.inSpam && (
          <span className="text-xs px-2 py-0.5 rounded-md border border-warn-line text-warn-fg bg-surface">
            Found in spam
          </span>
        )}
        <span className="text-xs text-faint ml-auto">{shortDate(reply.receivedAt)}</span>
      </div>

      <p className="text-sm font-medium text-ink mt-2">{reply.subject || '(no subject)'}</p>
      <p className="text-xs text-faint">
        {reply.fromName ? `${reply.fromName} · ` : ''}
        {reply.fromAddress}
      </p>

      {/*
        Quoted, never paraphrased. This is the sentence the reading turns on,
        and it is the only way to disagree with the reading on the evidence
        rather than on trust.
      */}
      {reply.evidence && (
        <p className="text-sm text-body mt-2 pl-3 border-l-2 border-line italic">
          “{reply.evidence}”
        </p>
      )}

      <div className="mt-2.5 text-xs">
        {reply.matchAmbiguous ? (
          <p className="text-warn-fg">
            Two applications match this equally well — say which one.
          </p>
        ) : top ? (
          <p className="text-muted">
            {top.signals.map((s) => s.detail).join(' ')}
          </p>
        ) : (
          <p className="text-muted">Nothing in the pipeline matched this one.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2.5">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          About
          <Select filter value={chosen} disabled={busy} onChange={(e) => setChosen(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">— pick an application —</option>
            {gigs.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </label>

        {canApply && (
          <Button variant="primary" disabled={busy} onClick={() => onAccept(gigId!, proposed)}>
            Yes — mark {gigStatusMeta(proposed).label.toLowerCase()}
          </Button>
        )}
        <Button variant="good" disabled={busy || gigId === null} onClick={() => onAccept(gigId!, null)}>
          {canApply ? 'Yes, but leave the status' : 'Yes, this is the one'}
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onDismiss}>
          Not this one
        </Button>
      </div>
    </div>
  )
}

export function ReplyInbox() {
  const qc = useQueryClient()
  const [note, setNote] = useState<string | null>(null)

  const { data } = useQuery({ queryKey: ['replies'], queryFn: () => api.replies.list() })
  const { data: gigs = [] } = useQuery({ queryKey: ['gigs', ''], queryFn: () => api.gigs.list() })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['replies'] })
    qc.invalidateQueries({ queryKey: ['gigs'] })
    qc.invalidateQueries({ queryKey: ['review'] })
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  const scan = useMutation({
    mutationFn: () => api.replies.scan(),
    onSuccess: (r) => {
      setNote(
        r.stored === 0
          ? `Nothing new. Looked back ${r.windowDays} days across ${r.gigCount} open applications.`
          : `${r.stored} new ${r.stored === 1 ? 'reply' : 'replies'}, looking back ${r.windowDays} days.`,
      )
      refresh()
    },
    onError: (e) => setNote((e as Error).message),
  })

  const act = useMutation({
    mutationFn: async ({ id, gigId, status }: { id: number; gigId: number; status: GigStatus | null }) => {
      await api.replies.accept(id, { gigId })
      // Two calls on purpose: `PATCH /api/gigs/:id` is the one place that owns
      // what a transition means and refuses the ones the pipeline does not
      // offer. The reply router never writes a status.
      if (status) await api.gigs.patch(gigId, { status })
    },
    onSuccess: refresh,
    onError: (e) => setNote((e as Error).message),
  })

  const dismiss = useMutation({
    mutationFn: (id: number) => api.replies.dismiss(id),
    onSuccess: refresh,
  })

  const items = data?.items ?? []
  const busy = scan.isPending || act.isPending || dismiss.isPending

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">
          Replies {items.length > 0 && `· ${items.length}`}
        </p>
        <Button variant="neutral" disabled={busy} onClick={() => scan.mutate()}>
          {scan.isPending ? 'Reading your mail…' : 'Check mail'}
        </Button>
        {note && <span className="text-xs text-faint">{note}</span>}
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((reply) => (
            <Card
              key={reply.id}
              reply={reply}
              gigs={gigs.map((g) => ({ id: g.id, name: g.name, status: g.status }))}
              busy={busy}
              onAccept={(gigId, status) => act.mutate({ id: reply.id, gigId, status })}
              onDismiss={() => dismiss.mutate(reply.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
