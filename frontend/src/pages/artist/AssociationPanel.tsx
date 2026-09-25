import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type AssetProposal, type AssociationSummary } from '../../api'
import { Button } from '../../components/ui/Button'
import { Disclosure } from '../../components/ui/Disclosure'

/**
 * Filling the library from a music association profile — one panel per
 * association connected under Settings.
 *
 * The reference documents' panel again, pointed at a public page: preview,
 * then write, and everything added lands never reviewed. Shown only once a
 * profile is connected, because the address is the artist's to give and this
 * panel has no business guessing it.
 */
export function AssociationPanels({ onDone }: { onDone: () => void }) {
  const list = useQuery({ queryKey: ['associations'], queryFn: api.associations.list })
  return (
    <>
      {(list.data?.connected ?? []).map((a) => (
        <AssociationPanel key={a.id} association={a} onDone={onDone} />
      ))}
    </>
  )
}

function AssociationPanel({ association, onDone }: { association: AssociationSummary; onDone: () => void }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const preview = useQuery({
    queryKey: ['association-import', association.id],
    queryFn: () => api.associations.preview(association.id),
    enabled: open,
  })

  const apply = useMutation({
    mutationFn: () => api.associations.apply(association.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['artist'] })
      qc.invalidateQueries({ queryKey: ['artist-epk'] })
      qc.invalidateQueries({ queryKey: ['association-import'] })
      onDone()
    },
  })

  const data = preview.data

  return (
    <Disclosure
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      teaser={`Your ${association.name} profile already describes you.`}
      hint="Read its bio, links, videos and photos into the library."
      openLabel="Read the profile"
      title={`From your ${association.name} profile`}
      subtitle="Nothing is written until you say so, and everything added lands as never reviewed — the profile said it, you have not checked it here."
      loading={preview.isLoading}
      error={apply.isError ? 'Could not add them. Nothing was written.' : null}
    >
      {data && 'error' in data && <p className="text-sm text-warn-fg">{data.error}</p>}

      {data && 'wouldAdd' in data && data.wouldAdd === 0 && (
        <p className="text-sm text-body">
          Nothing new.{' '}
          {data.existing > 0
            ? `All ${data.existing} things on the profile are already in your library.`
            : 'The profile holds nothing this library can file.'}
        </p>
      )}

      {data && 'wouldAdd' in data && data.wouldAdd > 0 && (
        <>
          <ul className="divide-y divide-line border-y border-line">
            {data.proposals.map((p: AssetProposal) => (
              <li key={p.source} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                <span className="text-xs text-faint w-12 shrink-0">{p.kind}</span>
                <span className="text-ink font-medium shrink-0">{p.label}</span>
                {p.variant && <span className="text-xs text-faint shrink-0">{p.variant}</span>}
                <span className="text-muted truncate min-w-0 basis-full sm:basis-auto sm:flex-1">{p.value}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={apply.isPending} onClick={() => apply.mutate()}>
              {apply.isPending ? 'Adding…' : `Add ${data.wouldAdd} to the library`}
            </Button>
            {data.existing > 0 && (
              <span className="text-xs text-muted">{data.existing} already on file, left alone.</span>
            )}
          </div>
        </>
      )}

      {data && 'skipped' in data && data.skipped.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer hover:text-ink transition-colors">
            {data.skipped.length} parts of the profile left where they are
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
    </Disclosure>
  )
}
