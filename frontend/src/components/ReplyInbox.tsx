import { matchStrength, strengthNote, STRENGTH_LABELS } from '../../../shared/replyMatch'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type GigReply } from '../api'
import { type GigStatus } from '../../../shared/gigStatus'
import { gigMoves } from '../../../shared/gigStage'
import { shortDate } from '../format'
import { Button } from './ui/Button'
import { Select } from './ui/Field'
import { ReplyDraftPanel } from './ReplyDraftPanel'
import { Explainer } from './ui/Explainer'

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
  gigs: Array<{ id: number; name: string; status: string; type?: string | null }>
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
  const move = proposed && gig ? gigMoves(gig.status, gig.type).find((m) => m.to === proposed) : undefined
  const canApply = Boolean(move)

  return (
    <div className="border border-line rounded-lg p-3 bg-surface">
      <div className="flex flex-wrap items-center gap-2">
        {/*
          Only when there is something to say. A reply the scan never
          classified carries an empty label, and this drew the pill anyway —
          eighteen pixels by six of border and background, meaning nothing, at
          the top of the card. A badge with no text is not a quieter badge.
        */}
        {reply.classLabel ? (
          <span className={`text-xs px-2 py-0.5 rounded-md border bg-surface ${TONE[reply.classification] ?? TONE.unclear}`}>
            {reply.classLabel}
          </span>
        ) : null}
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

      <div className="mt-2.5 space-y-1 text-xs">
        {reply.matchAmbiguous ? (
          <p className="text-warn-fg">
            Two applications match this equally well — say which one.
          </p>
        ) : top ? (
          (() => {
            // Why this is here rather than a grey caption: a match resting on
            // one common word looked identical to one resting on a confirmed
            // thread, so the queue could not be triaged at a glance. The label
            // is derived from the same signals that produced the score.
            const strength = matchStrength(top)
            const tone =
              strength === 'confirmed' || strength === 'strong'
                ? 'text-success-fg'
                : strength === 'weak'
                  ? 'text-warn-fg'
                  : 'text-muted'
            return (
              /*
                The strength line always; the signals behind the info button.
                The line already carries the deciding fact — "Weak — the only
                evidence is 'Winnipeg' in the body" is enough to dismiss a
                pizza receipt without reading further — and the bullets under
                it repeated that in list form on every card, for the junk and
                the real organiser reply alike.

                `hideable={false}`: this is evidence about the row, not the app
                explaining itself, so switching explanations off must not put
                it out of reach.
              */
              <Explainer
                as="div"
                titleClassName=""
                titleText="why this matched"
                hideable={false}
                title={
                  <p className={tone}>
                    <span className="font-medium">{STRENGTH_LABELS[strength]}</span>
                    {' — '}
                    {strengthNote(strength, top)}
                  </p>
                }
              >
                {/*
                  One line per signal rather than joined into a sentence, so
                  two reasons read as two reasons.
                */}
                <ul className="space-y-0.5">
                  {top.signals.map((sig) => (
                    <li key={`${sig.id}-${sig.detail}`} className="flex gap-1.5 text-muted">
                      <span aria-hidden>•</span>
                      <span className="min-w-0">{sig.detail}</span>
                    </li>
                  ))}
                </ul>
              </Explainer>
            )
          })()
        ) : (
          <p className="text-muted">Nothing in the pipeline matched this one.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2.5">
        <label className="flex min-w-0 max-w-full items-center gap-1.5 text-xs text-muted">
          About
          <Select filter className="min-w-0 max-w-full" value={chosen} disabled={busy} onChange={(e) => setChosen(e.target.value === '' ? '' : Number(e.target.value))}>
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
            Yes — {move?.label.toLowerCase()}
          </Button>
        )}
        <Button variant="good" disabled={busy || gigId === null} onClick={() => onAccept(gigId!, null)}>
          {canApply ? 'Yes, but leave the status' : 'Yes, this is the one'}
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onDismiss}>
          Not this one
        </Button>
      </div>

      {/*
        Only where they actually asked for something. A rejection needs no
        answer and an acknowledgement needs none either; offering to draft one
        would be offering work that should not be done.
      */}
      {reply.classification === 'info_requested' && (
        <div className="mt-2">
          <ReplyDraftPanel replyId={reply.id} />
        </div>
      )}
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
      // What it read and what it declined, because a sweep that says only
      // "nothing new" cannot be told from one that is not running. `cleared`
      // is the interesting one the first time: mail an earlier scan filed
      // that no longer matches anything has been taken back out.
      const parts = [
        r.stored === 0
          ? `Nothing new. Looked back ${r.windowDays} days across ${r.gigCount} open applications.`
          : `${r.stored} new ${r.stored === 1 ? 'reply' : 'replies'}, looking back ${r.windowDays} days.`,
      ]
      if (r.unmatched > 0) {
        parts.push(`${r.unmatched} ${r.unmatched === 1 ? 'message' : 'messages'} matched no application.`)
      }
      if (r.cleared > 0) {
        parts.push(`Removed ${r.cleared} that no longer ${r.cleared === 1 ? 'does' : 'do'}.`)
      }
      setNote(parts.join(' '))
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
      {/* No caption: the chip that opened this already says New mail and how many. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="neutral" disabled={busy} onClick={() => scan.mutate()}>
          {scan.isPending ? 'Reading your mail…' : 'Check mail'}
        </Button>
        {note && <span className="text-xs text-faint">{note}</span>}
      </div>

      {items.length === 0 && !note && (
        <p className="rounded-xl border border-line bg-surface shadow-card px-4 py-12 text-center text-sm text-muted">
          No new mail from organisers. Scout checks three times a day.
        </p>
      )}

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
