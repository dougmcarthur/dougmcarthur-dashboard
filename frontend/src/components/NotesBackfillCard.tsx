import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { Button } from './ui/Button'
import { Disclosure } from './ui/Disclosure'
import { humanise } from '../../../shared/humanise'

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
 *
 * **It shows itself only when there is something to fill.** The cron runs the
 * same extraction once on its own (`runNotesBackfillOnce`) and the routes run
 * it on every write, so on a normal day this card had nothing to offer and
 * still took a heading and a row on Settings — in words about migration
 * numbers. So it asks the preview on load, a read of a few dozen rows, and
 * renders nothing, heading included, unless a row would change.
 */
export function NotesBackfillCard() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const preview = useQuery({
    queryKey: ['backfill-notes'],
    queryFn: () => api.backfill.preview(),
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

  const data = preview.data
  // Kept on screen after a fill so the result can be read; otherwise gone
  // when there is nothing left to lift.
  if (!done && !(data && data.wouldChange > 0)) return null

  return (
    <div className="space-y-3 max-w-4xl">
      <h2 className="text-sm font-semibold text-ink">Data</h2>
      <Disclosure
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        teaser="Some notes hold facts Scout has not filed yet."
        hint="File them into each gig’s own fields. Nothing you set by hand is overwritten."
        openLabel="Read the notes"
        title="From your notes"
        subtitle="A field that already holds something is never touched, so this is safe to run twice."
        loading={preview.isLoading}
        error={apply.isError ? 'Could not fill them. Nothing was written.' : null}
      >
        {done && <p className="text-sm text-success-fg">{done}</p>}

        {data && data.wouldChange === 0 && !done && (
          <p className="text-sm text-body">
            Nothing to fill. All {data.scanned} rows already carry what their notes say.
            {data.ranAt && (
              <span className="text-muted"> Filled automatically on {data.ranAt.slice(0, 10)}.</span>
            )}
          </p>
        )}

        {data && data.wouldChange > 0 && (
          <>
            <ul className="flex flex-wrap gap-2">
              {Object.entries(data.byColumn).map(([column, count]) => (
                <li key={column} className="text-xs px-2 py-1 rounded-md border border-line bg-raised text-body">
                  <span className="text-ink font-medium">{count}</span> {humanise(column)}
                </li>
              ))}
            </ul>
            <div className="max-h-56 overflow-y-auto border-y border-line divide-y divide-line">
              {data.rows.map((row) => (
                <div key={`${row.table}-${row.id}`} className="py-1.5 text-xs">
                  <span className="text-ink">{row.name}</span>
                  <ul className="pl-4">
                    {row.changes.map((change) => (
                      <li key={change.column} className="text-muted truncate">
                        {humanise(change.column)} {'←'} {String(change.to)}
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

      </Disclosure>
    </div>
  )
}
