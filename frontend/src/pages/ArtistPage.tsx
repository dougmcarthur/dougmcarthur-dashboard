import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ArtistAssetInput, type EpkAudience } from '../api'
import {
  ASSET_KINDS,
  ASSET_KIND_META,
  epkWarnings,
  normaliseAssetKind,
} from '../../../shared/artistAssets'
import { Button } from '../components/ui/Button'
import { FILTER } from '../components/ui/Field'
import { AssetRow } from './artist/AssetRow'
import { AssetForm } from './artist/AssetForm'
import { SourcePanel } from './artist/SourcePanel'

const AUDIENCES: Array<{ id: EpkAudience; label: string; blurb: string }> = [
  { id: 'festival', label: 'Festival', blurb: 'Live video, stage plot, the practical facts.' },
  { id: 'sync', label: 'Sync agency', blurb: 'Recordings and links. No stage plot.' },
  { id: 'press', label: 'Press', blurb: 'Bio, photos, video, links.' },
]

/**
 * The artist database, and the EPK assembled from it.
 *
 * The EPK is a tab rather than a button that produces a file, because it is a
 * view: generated when you look at it, from material whose staleness it can
 * still see. A document exported last March cannot tell you its photo credit
 * went missing in April.
 */
export function ArtistPage() {
  const qc = useQueryClient()
  const [kindFilter, setKindFilter] = useState('')
  // Which freshness the library is narrowed to, or '' for all of it. Driven
  // by the counts below, which were previously a number with nowhere to go.
  const [freshness, setFreshness] = useState('')
  const [tab, setTab] = useState<'library' | EpkAudience>('library')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['artist', kindFilter, freshness],
    queryFn: () => api.artist.list({ kind: kindFilter || undefined, freshness: freshness || undefined }),
  })

  const epk = useQuery({
    queryKey: ['artist-epk', tab],
    queryFn: () => api.artist.epk(tab as EpkAudience),
    enabled: tab !== 'library',
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['artist'] })
    qc.invalidateQueries({ queryKey: ['artist-epk'] })
  }

  const create = useMutation({
    mutationFn: (body: ArtistAssetInput) => api.artist.create(body),
    onSuccess: () => { setAdding(false); invalidate() },
  })
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ArtistAssetInput> }) =>
      api.artist.patch(id, body),
    onSuccess: () => { setEditingId(null); invalidate() },
  })
  const reviewed = useMutation({
    mutationFn: (id: number) => api.artist.reviewed(id),
    onSuccess: invalidate,
  })
  const busy = patch.isPending || reviewed.isPending

  const items = data?.items ?? []
  const grouped = ASSET_KINDS.map((k) => ({
    kind: k,
    assets: items.filter((a) => normaliseAssetKind(a.kind) === k),
  })).filter((g) => g.assets.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Artist</h1>
          <p className="text-sm text-muted mt-0.5">
            Everything a programmer could ask for, so no application starts from a blank page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className={FILTER}>
            <option value="">Everything</option>
            {ASSET_KINDS.map((k) => (
              <option key={k} value={k}>{ASSET_KIND_META[k].plural}</option>
            ))}
          </select>
          <Button variant="primary" onClick={() => { setAdding(true); setTab('library') }}>+ Add</Button>
        </div>
      </div>

      {/*
        Counted over the whole library rather than the filtered view, so the
        number does not change because you clicked Photos. An EPK assembled
        from overdue material looks complete and is not, which is the one
        failure a generated document has that a folder does not.
      */}
      {/*
        Buttons, not labels. These counts are the two questions the artist
        database exists to answer, and reading one and then hunting the list
        for the rows behind it was the whole friction — one sourcing run puts
        twenty-two assets in the second bucket at once.
      */}
      {data && (data.needsReview > 0 || data.unreviewed > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {data.needsReview > 0 && (
            <button
              onClick={() => { setFreshness(freshness === 'overdue' ? '' : 'overdue'); setTab('library') }}
              aria-pressed={freshness === 'overdue'}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${
                freshness === 'overdue'
                  ? 'border-danger-line bg-danger-fg text-surface'
                  : 'border-danger-line bg-danger-bg text-danger-fg hover:border-danger-fg'
              }`}
            >
              <strong>{data.needsReview}</strong> overdue for review
            </button>
          )}
          {data.unreviewed > 0 && (
            <button
              onClick={() => { setFreshness(freshness === 'unreviewed' ? '' : 'unreviewed'); setTab('library') }}
              aria-pressed={freshness === 'unreviewed'}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${
                freshness === 'unreviewed'
                  ? 'border-line-strong bg-ink text-surface'
                  : 'border-line bg-surface text-muted hover:border-line-strong'
              }`}
            >
              <strong>{data.unreviewed}</strong> never reviewed
            </button>
          )}
          {freshness && (
            <button onClick={() => setFreshness('')} className="px-3 py-1.5 text-muted hover:text-ink transition-colors">
              Show everything
            </button>
          )}
        </div>
      )}

      <div className="flex gap-0.5 border-b border-line">
        {(['library', ...AUDIENCES.map((a) => a.id)] as const).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3.5 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {id === 'library' ? 'Library' : `EPK — ${AUDIENCES.find((a) => a.id === id)!.label}`}
          </button>
        ))}
      </div>

      {tab === 'library' ? (
        <div className="space-y-4">
          <SourcePanel onDone={invalidate} />
          {adding && (
            <AssetForm
              onSave={(body) => create.mutate(body)}
              onCancel={() => setAdding(false)}
              isSaving={create.isPending}
            />
          )}
          {isLoading && <p className="text-sm text-muted">Loading…</p>}
          {!isLoading && items.length === 0 && !adding && (
            <p className="text-sm text-muted py-8 text-center">
              Nothing here yet. Add a bio, a live video and a press photo and the EPK builds itself.
            </p>
          )}
          {grouped.map((group) => (
            <section key={group.kind} className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
              <header className="px-4 py-2.5 bg-sunken border-b border-line">
                <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">
                  {ASSET_KIND_META[group.kind].plural}
                </h2>
              </header>
              <div className="divide-y divide-line">
                {group.assets.map((a) =>
                  editingId === a.id ? (
                    <div key={a.id} className="p-3">
                      <AssetForm
                        asset={a}
                        onSave={(body) => patch.mutate({ id: a.id, body })}
                        onCancel={() => setEditingId(null)}
                        isSaving={patch.isPending}
                      />
                    </div>
                  ) : (
                    <AssetRow
                      key={a.id}
                      asset={a}
                      busy={busy}
                      onReviewed={() => reviewed.mutate(a.id)}
                      onEdit={() => setEditingId(a.id)}
                      onArchive={() => patch.mutate({ id: a.id, body: { archived: !a.archived } })}
                    />
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">{AUDIENCES.find((a) => a.id === tab)!.blurb}</p>
          {epk.isLoading && <p className="text-sm text-muted">Assembling…</p>}
          {epk.data && (
            <>
              {epkWarnings(epk.data).length > 0 && (
                <div className="p-3 rounded-xl border border-danger-line bg-danger-bg text-sm text-danger-fg space-y-1">
                  {epkWarnings(epk.data).map((w) => <p key={w}>{w}</p>)}
                </div>
              )}
              {epk.data.sections.map((section) => (
                <section key={section.kind} className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                  <header className="px-4 py-2.5 bg-sunken border-b border-line">
                    <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">{section.heading}</h2>
                  </header>
                  <div className="divide-y divide-line">
                    {section.assets.map((a) => (
                      <AssetRow
                        key={a.id}
                        asset={a}
                        busy={busy}
                        onReviewed={() => reviewed.mutate(a.id)}
                        onEdit={() => { setTab('library'); setEditingId(a.id) }}
                        onArchive={() => patch.mutate({ id: a.id, body: { archived: true } })}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
