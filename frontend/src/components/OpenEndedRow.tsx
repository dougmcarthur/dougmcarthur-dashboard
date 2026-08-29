import type { Backlog } from '../api'

/**
 * Block D — the rot detector.
 *
 * The single thing no other screen can say. Most opportunities here have no
 * deadline at all: they are open right now, permanently, and nothing will ever
 * force them onto the page. They do not appear in a deadline panel, they are
 * not overdue, and they never will be — they just quietly stop being live.
 *
 * One row, no list. The number is the point; the Review screen is where the
 * items are. Reads as a sentence rather than a metric because a bare "16" next
 * to a label is a stat card, and stat cards are what this redesign removed.
 */

function since(iso: string | null): string | null {
  if (!iso) return null
  const days = Math.round((Date.now() - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000)
  if (days < 45) return null // Too recent to call it sitting.
  const months = Math.round(days / 30)
  return months >= 12 ? 'over a year' : `${months} months`
}

export function OpenEndedRow({ backlog, onNav }: { backlog: Backlog; onNav: (page: string) => void }) {
  if (backlog.openEnded === 0) return null

  const { openEnded, untouched } = backlog
  const waited = since(backlog.oldestDiscoveredAt)

  return (
    <button
      onClick={() => onNav('review')}
      className="w-full text-left bg-surface border border-line rounded-xl shadow-card px-4 py-3 hover:border-line-strong hover:bg-sunken transition-colors group"
    >
      <p className="text-sm text-ink">
        <span className="font-semibold tabular-nums">{openEnded}</span>{' '}
        {openEnded === 1 ? 'opportunity has' : 'opportunities have'} no deadline
        <span className="text-muted"> — open right now, nothing forcing the issue.</span>
      </p>
      <p className="text-xs text-muted mt-1">
        {untouched > 0 && (
          <>
            <span className="tabular-nums">{untouched}</span>{' '}
            {untouched === 1 ? 'has' : 'have'} never been touched since{' '}
            {untouched === 1 ? 'it was' : 'they were'} found
            {waited ? `, the oldest ${waited} ago` : ''}.{' '}
          </>
        )}
        <span className="text-muted group-hover:text-body transition-colors">Review →</span>
      </p>
    </button>
  )
}
