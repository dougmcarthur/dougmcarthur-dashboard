import { useState } from 'react'
import { Button } from './ui/Button'
import { Caption } from './ui/Surface'

/**
 * A message the research agent drafted for you to send, as its own thing.
 *
 * The agents write an outreach message into a gig's note when there is no form
 * to fill — "Drafted outreach message ready to send via Facebook Messenger:
 * "Hi hi! I'm…"". The Gigs row printed the whole note as one paragraph, so the
 * one part you act on sat inside the explanation of why the gig fits, with no
 * way to copy it but selecting it by hand. It is lifted out by
 * `splitDraftedMessage` and shown here: the channel it is meant for, the text
 * verbatim — never depersonalised, because "I'm Doug McArthur" is the message —
 * and a button that copies it.
 *
 * Copy only, no send and no compose link: the channel is usually a DM, and
 * this app has never sent anything on anybody's behalf.
 *
 * `canCopy` is false for a sync target whose own site says it takes no
 * unsolicited pitches (`mayPitch`): the message stays readable, and the button
 * that makes sending it easy is not offered. A gig has no such gate.
 */
export function DraftedMessage({
  body,
  channel,
  canCopy = true,
}: {
  body: string
  channel: string | null
  canCopy?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // A refused clipboard is not worth an error: the text is on screen and
      // can be selected.
      setCopied(false)
    }
  }

  return (
    <div className="rounded-lg border border-line bg-raised px-3.5 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Caption>Drafted message{channel ? ` — to send ${channel}` : ''}</Caption>
        {canCopy && (
          <Button variant="neutral" size="sm" onClick={copy}>
            {copied ? 'Copied' : 'Copy message'}
          </Button>
        )}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{body}</p>
    </div>
  )
}
