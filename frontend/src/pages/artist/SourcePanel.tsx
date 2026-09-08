import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type AssetProposal } from '../../api'
import { Button } from '../../components/ui/Button'

/**
 * Filling the library from the reference documents.
 *
 * Preview first, then write — the same shape the application panel has, and
 * for the same reason: what a document says about you is a suggestion until
 * you have looked at it. Everything added here lands **never reviewed**, so
 * the count at the top of this page tells you how much is still only a
 * document's word.
 */
export function SourcePanel({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const preview = useQuery({
    queryKey: ['artist-source'],
    queryFn: () => api.artist.sourcePreview(),
    enabled: open,
  })

  const apply = useMutation({
    mutationFn: () => api.artist.source(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['artist'] })
      qc.invalidateQueries({ queryKey: ['artist-epk'] })
      qc.invalidateQueries({ queryKey: ['artist-source'] })
      onDone()
    },
  })

  if (!open) {
    return (
      <div className="rounded-lg border border-line bg-surface px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-body">
          The reference documents already describe you.{' '}
          <span className="text-muted">Read them into the library rather than typing it twice.</span>
        </p>
        <Button variant="neutral" onClick={() => setOpen(true)}>Read the documents</Button>
      </div>
    )
  }

  const data = preview.data

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3.5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">From the reference documents</p>
          <p className="text-xs text-muted mt-0.5">
            Nothing is written until you say so, and everything added lands as never reviewed —
            a document said it, you have not.
          </p>
        </div>
        <Button variant="quiet" onClick={() => setOpen(false)}>Close</Button>
      </div>

      {preview.isLoading && <p className="text-sm text-muted">Reading…</p>}

      {data && data.wouldAdd === 0 && (
        <p className="text-sm text-body">
          Nothing new.{' '}
          {data.existing.length > 0
            ? `All ${data.existing.length} entries these documents offer are already on file.`
            : 'These documents hold nothing this library can file.'}
        </p>
      )}

      {data && data.wouldAdd > 0 && (
        <>
          <ul className="divide-y divide-line border-y border-line">
            {data.proposals.map((p: AssetProposal) => (
              <li key={p.source} className="py-2 flex items-baseline gap-3 text-sm">
                <span className="text-xs text-faint w-12 shrink-0">{p.kind}</span>
                <span className="text-ink font-medium shrink-0">{p.label}</span>
                {p.variant && <span className="text-xs text-faint shrink-0">{p.variant}</span>}
                <span className="text-muted truncate">{p.value}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={apply.isPending} onClick={() => apply.mutate()}>
              {apply.isPending ? 'Adding…' : `Add ${data.wouldAdd} to the library`}
            </Button>
            {data.existing.length > 0 && (
              <span className="text-xs text-muted">
                {data.existing.length} already on file, left alone.
              </span>
            )}
          </div>
        </>
      )}

      {/*
        The gap, named. Phase 3 does the same thing with the questions it
        cannot answer: a section this cannot file is worth seeing, because it
        is the part you still have to write yourself.
      */}
      {data && data.skipped.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer hover:text-ink transition-colors">
            {data.skipped.length} sections nothing could be filed from
          </summary>
          <ul className="mt-1.5 space-y-0.5 pl-3">
            {data.skipped.map((s) => (
              <li key={s.heading}>
                <span className="text-body">{s.heading}</span> — {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {apply.isError && (
        <p className="text-sm text-danger-fg">Could not add them. Nothing was written.</p>
      )}
    </div>
  )
}
