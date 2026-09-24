import { useQuery } from '@tanstack/react-query'
import { api, type MergedShow } from '../../api'
import { Card, Caption } from '../../components/ui/Surface'
import { SOURCE_LABELS } from '../../../../shared/showMerge'

/**
 * Shows on the EPK: one list from every place they are posted.
 *
 * Bandsintown, the Manitoba Music profile and calendar, and gigs booked in
 * Scout, merged by
 * `shared/showMerge.ts` so the same night appears once. Each row says where it
 * is listed, and an upcoming show missing from a connected listing says so —
 * artists post dates inconsistently, and "not on Bandsintown" is also "not on
 * Spotify or Instagram", which Bandsintown feeds.
 *
 * Read on every view rather than stored: the listings are where the artist
 * edits them. A source that did not answer is named above the list, because
 * a short list that looks complete is how a show goes missing.
 */

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function ShowRow({ show }: { show: MergedShow }) {
  const [, m, d] = show.date.split('-')
  const where = [show.venue, show.location].filter(Boolean).join(' · ')
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <div className="w-11 shrink-0 text-center rounded-md bg-sunken py-1">
        <div className="text-[11px] font-semibold text-accent uppercase">{MONTH[Number(m) - 1]}</div>
        <div className="text-base font-semibold text-ink leading-tight">{Number(d)}</div>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm text-ink truncate">{show.title || show.venue || 'Show'}</p>
        {where && <p className="text-xs text-muted truncate">{where}</p>}
        <p className="text-xs text-faint">
          {show.links.length > 0
            ? show.links.map((l, i) => (
                <span key={l.source}>
                  {i > 0 && ' · '}
                  <a href={l.url} target="_blank" rel="noreferrer" className="underline hover:text-ink">
                    {SOURCE_LABELS[l.source]}
                  </a>
                </span>
              ))
            : null}
          {show.sources.includes('scout') && (
            <span>
              {show.links.length > 0 && ' · '}
              {SOURCE_LABELS.scout}
            </span>
          )}
        </p>
        {show.missingFrom.length > 0 && (
          <p className="text-xs text-warn-fg">
            Not on {show.missingFrom.map((s) => SOURCE_LABELS[s]).join(' or ')} yet
          </p>
        )}
      </div>
      {show.ticketUrl && (
        <a href={show.ticketUrl} target="_blank" rel="noreferrer" className="text-xs text-info-fg underline shrink-0">
          Tickets
        </a>
      )}
    </li>
  )
}

export function ShowsPanel() {
  const { data, isLoading } = useQuery({ queryKey: ['shows'], queryFn: api.shows })

  if (isLoading) return <p className="text-sm text-muted">Gathering your shows…</p>
  if (!data) return null

  const failing = data.sources.filter((s) => s.status !== 'working')
  const empty = data.upcoming.length === 0 && data.past.length === 0

  if (data.connected.length === 0 && empty) {
    return (
      <p className="text-sm text-muted">
        Shows come from Bandsintown and your Manitoba Music profile. Connect either under Settings
        and your dates appear here, together with any gig you have marked booked.
      </p>
    )
  }

  return (
    <Card as="section" pad="none" clip>
      <header className="px-4 py-2.5 bg-sunken border-b border-line flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Caption as="h2">Shows</Caption>
        <span className="text-xs text-muted">
          From {[...data.sources.map((s) => SOURCE_LABELS[s.source]), 'gigs booked in Scout'].join(', ')}
        </span>
      </header>
      {failing.length > 0 && (
        <ul className="px-4 py-2 text-xs text-warn-fg border-b border-line space-y-0.5">
          {failing.map((f) => (
            <li key={f.source}>
              {f.status === 'rejected'
                ? `${SOURCE_LABELS[f.source]} refused${f.note ? `: ${f.note}` : ''}. Check it under Settings.`
                : `${SOURCE_LABELS[f.source]} did not answer just now, so this list may be missing its dates.`}
            </li>
          ))}
        </ul>
      )}
      {empty ? (
        <p className="px-4 py-3 text-sm text-muted">No shows in the last year or ahead, anywhere Scout can see.</p>
      ) : (
        <>
          {data.upcoming.length > 0 && (
            <ul className="divide-y divide-line">
              {data.upcoming.map((s) => <ShowRow key={s.key} show={s} />)}
            </ul>
          )}
          {data.past.length > 0 && (
            <details className="border-t border-line">
              <summary className="px-4 py-2 text-xs text-muted cursor-pointer">
                {data.past.length} played in the last year
              </summary>
              <ul className="divide-y divide-line">
                {data.past.map((s) => <ShowRow key={s.key} show={s} />)}
              </ul>
            </details>
          )}
        </>
      )}
    </Card>
  )
}
