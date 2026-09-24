import { useQuery } from '@tanstack/react-query'
import { api, type BandsintownShow } from '../../api'
import { Card, Caption } from '../../components/ui/Surface'

/**
 * Shows on the EPK, read from Bandsintown.
 *
 * Read on every view rather than stored, because Bandsintown is where the
 * artist edits them (`src/routes/connectors.ts`). Upcoming first, then what
 * was played in the last year — the "recent notable performances" a form asks
 * for. When nothing is connected the panel says where to connect it rather
 * than drawing an empty Shows section that reads as "no shows".
 */

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function ShowRow({ show }: { show: BandsintownShow }) {
  const [, m, d] = show.date.split('-')
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="w-11 shrink-0 text-center rounded-md bg-sunken py-1">
        <div className="text-[11px] font-semibold text-accent uppercase">{MONTH[Number(m) - 1]}</div>
        <div className="text-base font-semibold text-ink leading-tight">{Number(d)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink truncate">{show.title || show.venue}</p>
        <p className="text-xs text-muted truncate">
          {[show.title && show.title !== show.venue ? show.venue : null, show.location].filter(Boolean).join(' · ')}
          {show.withArtists.length > 0 && ` · with ${show.withArtists.join(', ')}`}
        </p>
      </div>
      {show.url && (
        <a href={show.url} target="_blank" rel="noreferrer" className="text-xs text-info-fg underline shrink-0">
          {show.hasTickets ? (show.free ? 'Free' : 'Tickets') : 'Details'}
        </a>
      )}
    </li>
  )
}

export function ShowsPanel() {
  const { data, isLoading } = useQuery({ queryKey: ['shows'], queryFn: api.connectors.shows })

  if (isLoading) return <p className="text-sm text-muted">Reading shows from Bandsintown…</p>
  if (!data) return null

  if (!data.connected) {
    return (
      <p className="text-sm text-muted">
        Shows come from Bandsintown. Connect it under Settings and your dates appear here.
      </p>
    )
  }

  return (
    <Card as="section" pad="none" clip>
      <header className="px-4 py-2.5 bg-sunken border-b border-line flex items-center justify-between gap-3">
        <Caption as="h2">Shows</Caption>
        <span className="text-xs text-muted">From Bandsintown · {data.account}</span>
      </header>
      {data.status && data.status !== 'working' && (
        <p className="px-4 py-2 text-xs text-warn-fg border-b border-line">
          {data.status === 'rejected'
            ? `Bandsintown refused the key${data.statusNote ? `: ${data.statusNote}` : ''}. Check it under Settings.`
            : 'Bandsintown did not answer just now, so this may be incomplete.'}
        </p>
      )}
      {data.upcoming.length === 0 && data.past.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">Bandsintown lists no shows in the last year or ahead.</p>
      ) : (
        <>
          {data.upcoming.length > 0 && (
            <ul className="divide-y divide-line">
              {data.upcoming.map((s) => <ShowRow key={s.id} show={s} />)}
            </ul>
          )}
          {data.past.length > 0 && (
            <details className="border-t border-line">
              <summary className="px-4 py-2 text-xs text-muted cursor-pointer">
                {data.past.length} played in the last year
              </summary>
              <ul className="divide-y divide-line">
                {data.past.map((s) => <ShowRow key={s.id} show={s} />)}
              </ul>
            </details>
          )}
        </>
      )}
    </Card>
  )
}
