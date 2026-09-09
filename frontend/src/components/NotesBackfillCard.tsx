import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { Button } from './ui/Button'

/**
 * Filling the columns migration 0001 added and nobody ever wrote to.
 *
 * Preview, then apply. It never overwrites a column that already holds
 * something, so running it twice is a no-op and a value you set by hand
 * survives whatever the note says.
 *
 * This does not retire the note parser. New rows keep arriving from research
 * agents outside this repo, still writing prose — the gig and sync routes
 * extract on write now, and this is the same extraction applied once to the
 * rows that came before it.
 */
export function NotesBackfillCard() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const preview = useQuery({
    queryKey: ['backfill-notes'],
    queryFn: () => api.backfill.preview(),
    enabled: open,
  })

  const apply = useMutation({
    mutationFn: () => api.backfill.apply(),
    onSuccess: (r) => {
      setDone(`${r.changed} ${r.changed === 1 ? 'row' : 'rows'} filled.`)
      qc.invalidateQueries({ queryKey: ['backfill-notes'] })
      qc.invalidateQueries({ queryKey: ['gigs'] })
      qc.invalidateQueries({ queryKey: ['review'] })
    },
  })

  if (!open) {
    return (
      <div className="rounded-lg border border-line bg-surface px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-body">
          Facts buried in the note columns.{' '}
          <span className="text-muted">Lift them into the columns that have been empty since 0001.</span>
        </p>
        <Button variant="neutral" onClick={() => setOpen(true)}>Read the notes</Button>
      </div>
    )
  }

  const data = preview.data

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3.5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">From the note columns</p>
          <p className="text-xs text-muted mt-0.5">
            A column that already holds something is never touched, so this is safe to run twice.
          </p>
        </div>
        <Button variant="quiet" onClick={() => setOpen(false)}>Close</Button>
      </div>

      {preview.isLoading && <p className="text-sm text-muted">Reading {'…'}</p>}
      {done && <p className="text-sm text-success-fg">{done}</p>}

      {data && data.wouldChange === 0 && !done && (
        <p className="text-sm text-body">
          Nothing to fill. All {data.scanned} rows already carry what their notes say.
        </p>
      )}

      {data && data.wouldChange > 0 && (
        <>
          <ul className="flex flex-wrap gap-2">
            {Object.entries(data.byColumn).map(([column, count]) => (
              <li key={column} className="text-xs px-2 py-1 rounded-md border border-line bg-raised text-body">
                <span className="text-ink font-medium">{count}</span> {column}
              </li>
            ))}
          </ul>
          <div className="max-h-56 overflow-y-auto border-y border-line divide-y divide-line">
            {data.rows.map((row) => (
              <div key={`${row.table}-${row.id}`} className="py-1.5 text-xs">
                <span className="text-faint">{row.table} {row.id}</span>{' '}
                <span className="text-ink">{row.name}</span>
                <ul className="pl-4">
                  {row.changes.map((change) => (
                    <li key={change.column} className="text-muted truncate">
                      {change.column} {'←'} {String(change.to)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <Button variant="primary" disabled={apply.isPending} onClick={() => apply.mutate()}>
            {apply.isPending ? 'Filling…' : `Fill ${data.wouldChange} ${data.wouldChange === 1 ? 'row' : 'rows'}`}
          </Button>
        </>
      )}

      {apply.isError && <p className="text-sm text-danger-fg">Could not fill them. Nothing was written.</p>}
    </div>
  )
}
