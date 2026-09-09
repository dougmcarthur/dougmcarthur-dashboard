import { useState } from 'react'
import { mailLinks, draftAsText, type MailDraft } from '../../../shared/mailto'
import { Button } from './ui/Button'

/**
 * What you can do with a draft the app has written.
 *
 * Copy, and — where the draft is short enough to survive the trip — a
 * pre-filled compose window. Never a Send: the app writes drafts and stops,
 * which is the same rule `ApplicationPanel` and `ReplyDraftPanel` hold to and
 * which `test/uiConsistency.test.ts` enforces.
 *
 * Extracted rather than written twice. The reply draft and the sync pitch are
 * the same shape — a subject, a body, and a person who has to send it — and
 * this is the second copy, which is when `Disclosure` was extracted too.
 *
 * A handler that cannot carry the draft is **named, not hidden**. A vanished
 * button reads as a bug; "too long for your mail client" reads as a fact, and
 * points at the one that will work.
 */
export function DraftActions({ draft, note }: { draft: MailDraft; note?: string }) {
  const [copied, setCopied] = useState(false)
  const links = mailLinks(draft)
  const tooLong = links.filter((l) => !l.fits)

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="neutral"
          onClick={() => {
            navigator.clipboard.writeText(draftAsText(draft))
            setCopied(true)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>

        {links
          .filter((link) => link.href)
          .map((link) => (
            <a
              key={link.handler}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors
                         border border-line-strong text-body hover:bg-sunken hover:text-ink"
            >
              {link.label}
            </a>
          ))}

        <span className="text-xs text-faint">{note ?? 'Nothing here goes out on its own.'}</span>
      </div>

      {tooLong.length > 0 && (
        <p className="text-xs text-muted">
          {tooLong.map((l) => l.label).join(' and ')}{' '}
          {tooLong.length === 1 ? 'is' : 'are'} unavailable — this draft is{' '}
          {tooLong[0].length.toLocaleString()} characters once encoded, past what
          {tooLong.length === 1 ? ' it' : ' they'} can carry. Copy it instead.
        </p>
      )}
    </div>
  )
}
