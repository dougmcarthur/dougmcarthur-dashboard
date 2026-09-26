import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { collectContext } from '../diagnostics'
import { useAppearance } from '../hooks/useAppearance'
import {
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  describeContext,
  type FeedbackContext,
  type FeedbackKind,
} from '../../../shared/feedback'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Textarea } from './ui/Field'
import { Caption } from './ui/Surface'

/**
 * Tell Sun Dogs Music something, without having to explain where you are.
 *
 * Opened on purpose from the header's help menu, and from nowhere else: no
 * prompt after an action, no rating, no timer. The page, the section, the
 * pages before it and any request that failed in this tab are attached — and
 * listed on the form before the button, in the same words the owner will read
 * them, so nothing arrives that the sender did not see.
 *
 * The context is captured when the form opens, not when it is sent: it is
 * about the page behind the dialog, and typing into the dialog is not an event
 * worth recording.
 */
export function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { resolved } = useAppearance()
  const [kind, setKind] = useState<FeedbackKind>('broken')
  const [message, setMessage] = useState('')
  const [context, setContext] = useState<FeedbackContext | null>(null)

  const send = useMutation({
    mutationFn: () => api.feedback.send({ kind, message: message.trim(), context: context! }),
  })

  useEffect(() => {
    if (!open) return
    setContext(collectContext(resolved))
    // A fresh form each time it opens after a send; an unsent draft survives
    // closing and reopening, because losing a paragraph to a stray Escape is
    // the thing that stops somebody writing a second one.
    if (send.isSuccess) {
      setMessage('')
      send.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const prompt = FEEDBACK_KINDS.find((k) => k.id === kind)?.prompt ?? ''

  return (
    <Modal open={open} onClose={onClose} title="Send feedback" subtitle="Read by the people who make Scout.">
      {send.isSuccess ? (
        <div className="space-y-3">
          <p className="text-sm text-body">
            Thanks — it arrived. If it needs an answer, you will hear back at the address on your
            account.
          </p>
          <Button variant="neutral" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (context && message.trim()) send.mutate()
          }}
        >
          <fieldset className="flex flex-wrap gap-x-4 gap-y-1.5">
            <legend className="sr-only">What kind of feedback</legend>
            {FEEDBACK_KINDS.map((k) => (
              <label key={k.id} className="flex items-center gap-2 text-sm text-body">
                <input
                  type="radio"
                  name="feedback-kind"
                  checked={kind === k.id}
                  onChange={() => setKind(k.id)}
                  className="border-line-strong"
                />
                {k.label}
              </label>
            ))}
          </fieldset>

          <label className="block space-y-1">
            <Caption>{prompt}</Caption>
            <Textarea
              rows={5}
              maxLength={FEEDBACK_MESSAGE_MAX}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              // Focus lands on the dialog first so Escape works; the box is
              // one Tab away, and grabbing focus on a phone opens a keyboard
              // over the context list the sender should read.
            />
          </label>

          {context && (
            <details className="rounded-lg border border-line px-3 py-2">
              <summary className="text-xs text-muted cursor-pointer">
                Sent with this, so you do not have to explain where you were
              </summary>
              <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                {describeContext(context).map((line) => (
                  <div key={line.label} className="contents">
                    <dt className="text-muted">{line.label}</dt>
                    <dd className="text-body whitespace-pre-line break-words">{line.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-faint">
                Nothing else — not what is on the page, and nothing about your gigs or drafts.
              </p>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" disabled={send.isPending || !message.trim()}>
              {send.isPending ? 'Sending…' : 'Send'}
            </Button>
            <Button type="button" variant="quiet" onClick={onClose}>
              Cancel
            </Button>
            {send.error && (
              <span className="text-xs text-danger-fg">
                {send.error instanceof Error ? send.error.message : 'Could not send it'}
              </span>
            )}
          </div>
        </form>
      )}
    </Modal>
  )
}
