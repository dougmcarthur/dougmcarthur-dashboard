import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { Button } from './ui/Button'
import { DraftActions } from './DraftActions'

/**
 * The answer to an organiser's question, drafted from the artist database.
 *
 * `info_requested` is the state the plan called out as the one that stalls if
 * nobody notices. The queue noticed it and then said "answering is a reply in
 * your mail, not a button here" — true, and not much help. This is the help.
 *
 * Copy, and no Send. Same rule as the application panel and for a sharper
 * reason: a wrong auto-reply to a festival that just asked you a question is
 * worse than a slow one.
 */
export function ReplyDraftPanel({ replyId }: { replyId: number }) {
  const [open, setOpen] = useState(false)

  const query = useQuery({
    queryKey: ['reply-draft', replyId],
    queryFn: () => api.replies.draft(replyId),
    enabled: open,
  })

  if (!open) {
    return (
      <Button variant="quiet" onClick={() => setOpen(true)}>
        Draft the answer
      </Button>
    )
  }

  const draft = query.data?.draft

  return (
    <div className="mt-2 rounded-md border border-line bg-raised px-3 py-2.5 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Draft answer</p>
        <Button variant="quiet" onClick={() => setOpen(false)}>Close</Button>
      </div>

      {query.isLoading && <p className="text-sm text-muted">Reading what they asked for…</p>}

      {draft && (
        <>
          {/*
            What it read them as asking for, with the organiser's own sentence
            under each. A reading you cannot check is a reading you should not
            trust, and this is the same rule the classification follows.
          */}
          {draft.asks.length > 0 && (
            <ul className="space-y-1">
              {draft.asks.map((ask) => (
                <li key={ask.id} className="text-xs">
                  <span className="text-ink font-medium">{ask.label}</span>
                  {ask.attachment && <span className="text-warn-fg"> · attach</span>}
                  {draft.missing.includes(ask.label) && <span className="text-faint"> · nothing on file</span>}
                  <span className="text-faint block truncate">“{ask.evidence}”</span>
                </li>
              ))}
            </ul>
          )}

          {draft.approximate && (
            <p className="text-xs text-warn-fg">
              Read from the stored snippet rather than the email, so an ask further down may be
              missed. Check the mail before sending.
            </p>
          )}

          <div>
            <p className="text-xs text-faint mb-1">{draft.subject}</p>
            <pre className="text-xs text-body whitespace-pre-wrap font-sans bg-surface border border-line rounded p-2.5 max-h-72 overflow-y-auto">
              {draft.body}
            </pre>
          </div>

          {draft.gaps.length > 0 && (
            <ul className="space-y-0.5">
              {draft.gaps.map((gap) => (
                <li key={gap.marker} className="text-xs text-muted">
                  <code className="text-warn-fg">{gap.marker}</code> {gap.prompt}
                </li>
              ))}
            </ul>
          )}

          {draft.unrecognised.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted">They asked something this cannot place</p>
              <ul className="space-y-0.5 mt-0.5">
                {draft.unrecognised.map((line) => (
                  <li key={line} className="text-xs text-faint">“{line}”</li>
                ))}
              </ul>
            </div>
          )}

          <DraftActions
            draft={{ subject: draft.subject, body: draft.body }}
            note="Send it from your mail. Nothing here goes out on its own."
          />
        </>
      )}
    </div>
  )
}
