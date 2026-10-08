import { useState } from 'react'
import { Tabs } from '../components/ui/Tabs'
import { DocumentsTab } from './artist/DocumentsTab'
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
import { ShowsPanel } from './artist/ShowsPanel'
import { ProfileTab } from './artist/ProfileTab'
import { DriveTab } from './artist/DriveTab'
import { SourcePanel } from './artist/SourcePanel'
import { AssociationPanels } from './artist/AssociationPanel'
import { Explainer } from '../components/ui/Explainer'
import { Caption, Card } from '../components/ui/Surface'
import { Modal } from '../components/ui/Modal'
import { StagePlotTab } from './artist/StagePlotTab'
import {
  GridView,
  ProfileView,
  TableView,
  ViewSwitch,
  loadLibraryView,
  saveLibraryView,
  type LibraryView,
} from './artist/LibraryViews'
import type { ArtistAssetWithHealth } from '../api'

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
export function ArtistPage({ initialTab = null }: { initialTab?: string | null }) {
  const qc = useQueryClient()
  const [kindFilter, setKindFilter] = useState('')
  // Which freshness the library is narrowed to, or '' for all of it. Driven
  // by the counts below, which were previously a number with nowhere to go.
  const [freshness, setFreshness] = useState('')
  // The three checklists are one tab with a switch inside it. They were three
  // tabs of eight, side by side, differing only in which audience the same
  // library is cut for.
  const [tab, setTab] = useState<'library' | 'stageplot' | 'documents' | 'profile' | 'drive' | 'checklists'>(
    initialTab === 'drive' ||
      initialTab === 'profile' ||
      initialTab === 'documents' ||
      initialTab === 'stageplot' ||
      initialTab === 'checklists'
      ? initialTab
      : 'library',
  )
  const [audience, setAudience] = useState<EpkAudience>('festival')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [view, setView] = useState<LibraryView>(loadLibraryView)
  // The entry open in the Profile and Table views. Held as an id so the modal
  // shows the entry as it is after an edit, not as it was when opened.
  const [openId, setOpenId] = useState<number | null>(null)
  const profile = useQuery({ queryKey: ['profile'], queryFn: api.profile.read })

  const { data, isLoading } = useQuery({
    queryKey: ['artist', kindFilter, freshness],
    queryFn: () => api.artist.list({ kind: kindFilter || undefined, freshness: freshness || undefined }),
  })

  const epk = useQuery({
    queryKey: ['artist-epk', audience],
    queryFn: () => api.artist.epk(audience),
    enabled: tab === 'checklists',
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
  // Grouped by kind, in kind order: the grid reads like the old list did.
  const ordered = grouped.flatMap((g) => g.assets)
  const opened = items.find((a) => a.id === openId) ?? null

  /** One entry in full, with its actions: the same in every view. */
  const detail = (a: ArtistAssetWithHealth) =>
    editingId === a.id ? (
      <div className="p-3">
        <AssetForm
          asset={a}
          onSave={(body) => patch.mutate({ id: a.id, body })}
          onCancel={() => setEditingId(null)}
          isSaving={patch.isPending}
        />
      </div>
    ) : (
      <AssetRow
        asset={a}
        busy={busy}
        onReviewed={() => reviewed.mutate(a.id)}
        onEdit={() => setEditingId(a.id)}
        onArchive={() => patch.mutate({ id: a.id, body: { archived: !a.archived } })}
      />
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Explainer as="h1" title="Artist" titleClassName="text-2xl font-bold text-ink tracking-tight">
            Everything a programmer could ask for, so no application starts from a blank page.
          </Explainer>
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
        <div className="flex flex-wrap gap-2 text-sm print:hidden">
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

      <div className="print:hidden">
      <Tabs
        label="Artist sections"
        active={tab}
        onSelect={setTab}
        tabs={[
          { id: 'library', label: 'Library' },
          { id: 'stageplot', label: 'Stage plot' },
          // Beside the Library because the Library reads its facts from these.
          { id: 'documents', label: 'Documents' },
          { id: 'profile', label: 'Profile page' },
          { id: 'drive', label: 'Drive folder' },
          { id: 'checklists', label: 'Checklists' },
        ]}
      />
      </div>

      {tab === 'stageplot' ? (
        <StagePlotTab />
      ) : tab === 'documents' ? (
        <DocumentsTab />
      ) : tab === 'profile' ? (
        <ProfileTab />
      ) : tab === 'drive' ? (
        <DriveTab outcome={new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('drive')} />
      ) : tab === 'library' ? (
        <div className="space-y-4">
          <SourcePanel onDone={invalidate} />
          <AssociationPanels onDone={invalidate} />
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
          {!isLoading && items.length > 0 && (
            <div className="flex justify-end">
              <ViewSwitch
                view={view}
                onChange={(v) => {
                  setView(v)
                  saveLibraryView(v)
                }}
              />
            </div>
          )}
          {!isLoading && items.length > 0 && view === 'profile' && (
            <ProfileView items={items} name={profile.data?.displayName ?? null} onOpen={(a) => setOpenId(a.id)} />
          )}
          {!isLoading && items.length > 0 && view === 'grid' && <GridView items={ordered} detail={detail} />}
          {!isLoading && items.length > 0 && view === 'table' && (
            <TableView items={ordered} onOpen={(a) => setOpenId(a.id)} />
          )}
          <Modal
            open={opened !== null}
            onClose={() => {
              setOpenId(null)
              setEditingId(null)
            }}
            title={opened?.label ?? ''}
            subtitle={opened ? ASSET_KIND_META[normaliseAssetKind(opened.kind)].label : undefined}
          >
            {opened && <div className="-m-4">{detail(opened)}</div>}
          </Modal>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div role="group" aria-label="Checklist for" className="inline-flex gap-1 p-1 rounded-lg border border-line bg-surface">
              {AUDIENCES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAudience(a.id)}
                  aria-pressed={a.id === audience}
                  className={`h-8 px-3 rounded-md text-sm transition-colors ${
                    a.id === audience ? 'bg-raised text-ink font-semibold shadow-inset' : 'text-muted hover:text-ink'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted">{AUDIENCES.find((a) => a.id === audience)!.blurb}</p>
          </div>
          {epk.isLoading && <p className="text-sm text-muted">Assembling…</p>}
          {epk.data && (
            <>
              {epkWarnings(epk.data).length > 0 && (
                <div className="p-3 rounded-xl border border-danger-line bg-danger-bg text-sm text-danger-fg space-y-1">
                  {epkWarnings(epk.data).map((w) => <p key={w}>{w}</p>)}
                </div>
              )}
              {epk.data.sections.map((section) => (
                <Card as="section" key={section.kind} pad="none" clip>
                  <header className="px-4 py-2.5 bg-sunken border-b border-line">
                    <Caption as="h2">{section.heading}</Caption>
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
                </Card>
              ))}
            </>
          )}
          {/* Programmers and press want dates; a music supervisor does not. */}
          {audience !== 'sync' && <ShowsPanel />}
        </div>
      )}
    </div>
  )
}
