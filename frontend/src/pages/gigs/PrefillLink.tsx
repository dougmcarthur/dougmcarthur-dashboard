import { useMemo } from 'react'
import type { PreparedField } from '../../api'
import { SKIP_REASONS, buildPrefillLink } from '../../../../shared/formPrefill'

/**
 * Open the form with the answers you have read already typed in.
 *
 * Google Forms only — `shared/formPrefill.ts` says why. It opens the form and
 * stops: the person reads it there and presses the form's own button, which is
 * the line this app has always stopped at. Copy on each field is still the way
 * in for everything the link cannot carry, and the skipped list says which
 * those are.
 *
 * The note under it is the leak rule from the research: a pre-filled link
 * carries its answers in the address, so they land in browser history and
 * anywhere the link is pasted. Said plainly rather than implied, because a
 * link is not a private channel.
 */
export function PrefillLink({ formUrl, fields }: { formUrl: string | null; fields: PreparedField[] }) {
  const link = useMemo(() => buildPrefillLink(formUrl, fields), [formUrl, fields])
  if (!link) return null

  return (
    <div className="border border-line rounded-lg p-3 bg-surface space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {link.href ? (
          <a
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors
                       border border-line-strong text-body hover:bg-sunken hover:text-ink"
          >
            Open the form, pre-filled
          </a>
        ) : null}
        <p className="text-xs text-muted">
          {link.href
            ? `${link.included.length} ${link.included.length === 1 ? 'answer goes' : 'answers go'} in. Check them on the form before you send it — nothing leaves from here.`
            : 'Nothing can go in a pre-filled link yet.'}
        </p>
      </div>

      {link.skipped.length > 0 && (
        <ul className="text-xs text-muted space-y-0.5">
          {link.skipped.map((s) => (
            <li key={s.label}>
              <span className="text-body">{s.label}</span> — {SKIP_REASONS[s.reason]}
            </li>
          ))}
        </ul>
      )}

      {link.href && (
        <p className="text-xs text-faint">
          The answers travel in the link itself, so they end up in your browser history. Don&rsquo;t
          share the link.
        </p>
      )}
    </div>
  )
}
