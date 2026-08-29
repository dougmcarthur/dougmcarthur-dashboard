import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type SyncTarget, type SyncStatus } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { Chevron } from '../components/Chevron'
import { SkeletonList } from '../components/Skeleton'
import { ReconcilePanel } from '../components/ReconcilePanel'

const SYNC_STATUSES: SyncStatus[] = ['draft_ready', 'pitched', 'confirmed', 'declined', 'archived']

const INPUT = 'w-full text-sm border border-line-strong rounded-md px-2.5 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition'
const FILTER_INPUT = 'text-sm border border-line-strong rounded-md px-3 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition'

type SyncDraft = {
  name: string; agencyType: string; contactEmail: string; contactRole: string
  confirmationMethod: string; notes: string; pitchDraft: string; status: SyncStatus
}

const EMPTY_DRAFT: SyncDraft = {
  name: '', agencyType: '', contactEmail: '', contactRole: '',
  confirmationMethod: '', notes: '', pitchDraft: '', status: 'draft_ready',
}

// ── Create form ───────────────────────────────────────────────────────────────

function CreateSyncForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<SyncDraft>(EMPTY_DRAFT)
  const set = (k: keyof SyncDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }))

  const createMutation = useMutation({
    mutationFn: () =>
      api.sync.create({
        name: draft.name,
        agencyType: draft.agencyType || null,
        contactEmail: draft.contactEmail || null,
        contactRole: draft.contactRole || null,
        confirmationMethod: draft.confirmationMethod || null,
        notes: draft.notes || null,
        pitchDraft: draft.pitchDraft || null,
        status: draft.status,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      setDraft(EMPTY_DRAFT)
      onDone()
    },
  })

  return (
    <div className="bg-surface border border-line rounded-xl shadow-card p-5 space-y-4">
      <h2 className="text-sm font-semibold text-ink">New Sync Target</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Name *</label>
          <input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Epitaph Records" className={INPUT} autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Agency type</label>
          <input value={draft.agencyType} onChange={(e) => set('agencyType', e.target.value)} placeholder="label, library, supervisor…" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Contact email</label>
          <input type="email" value={draft.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} placeholder="sync@label.com" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Contact role</label>
          <input value={draft.contactRole} onChange={(e) => set('contactRole', e.target.value)} placeholder="A&R, Sync Supervisor…" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Confirm via</label>
          <input value={draft.confirmationMethod} onChange={(e) => set('confirmationMethod', e.target.value)} placeholder="email, phone, portal…" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Initial status</label>
          <select value={draft.status} onChange={(e) => set('status', e.target.value as SyncStatus)} className={INPUT}>
            {SYNC_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">Notes</label>
          <textarea rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Context about this target…" className={`${INPUT} resize-none`} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">Pitch draft</label>
          <textarea rows={4} value={draft.pitchDraft} onChange={(e) => set('pitchDraft', e.target.value)} placeholder="Dear…" className={`${INPUT} resize-y font-mono`} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => createMutation.mutate()} disabled={!draft.name || createMutation.isPending}
          className="text-sm px-4 py-1.5 rounded-md bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors">
          {createMutation.isPending ? 'Adding…' : 'Add target'}
        </button>
        <button onClick={onDone} className="text-sm px-4 py-1.5 rounded-md border border-line-strong text-body hover:bg-sunken transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Inline edit panel ─────────────────────────────────────────────────────────

function EditSyncPanel({
  target,
  onSave,
  onCancel,
  isSaving,
}: {
  target: SyncTarget
  onSave: (body: Partial<SyncTarget>) => void
  onCancel: () => void
  isSaving: boolean
}) {
  const [draft, setDraft] = useState({
    name: target.name,
    agencyType: target.agencyType ?? '',
    contactEmail: target.contactEmail ?? '',
    contactRole: target.contactRole ?? '',
    confirmationMethod: target.confirmationMethod ?? '',
    notes: target.notes ?? '',
    pitchDraft: target.pitchDraft ?? '',
  })
  const set = (k: keyof typeof draft, v: string) => setDraft((d) => ({ ...d, [k]: v }))

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Name</label>
          <input value={draft.name} onChange={(e) => set('name', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Agency type</label>
          <input value={draft.agencyType} onChange={(e) => set('agencyType', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Contact email</label>
          <input type="email" value={draft.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Contact role</label>
          <input value={draft.contactRole} onChange={(e) => set('contactRole', e.target.value)} className={INPUT} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">Confirm via</label>
          <input value={draft.confirmationMethod} onChange={(e) => set('confirmationMethod', e.target.value)} className={INPUT} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">Notes</label>
          <textarea rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} className={`${INPUT} resize-none`} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">Pitch draft</label>
          <textarea rows={6} value={draft.pitchDraft} onChange={(e) => set('pitchDraft', e.target.value)} className={`${INPUT} resize-y font-mono`} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({
          name: draft.name,
          agencyType: draft.agencyType || null,
          contactEmail: draft.contactEmail || null,
          contactRole: draft.contactRole || null,
          confirmationMethod: draft.confirmationMethod || null,
          notes: draft.notes || null,
          pitchDraft: draft.pitchDraft || null,
        })} disabled={isSaving}
          className="text-xs px-3 py-1.5 rounded-md bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors">
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-body hover:bg-sunken transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Read-only detail panel ────────────────────────────────────────────────────

function SyncDetail({ target, onEdit }: { target: SyncTarget; onEdit: () => void }) {
  return (
    <div className="space-y-4 max-w-2xl">
      {target.notes && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Notes</p>
          <p className="text-sm text-body leading-relaxed">{target.notes}</p>
        </div>
      )}
      {target.pitchDraft && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Pitch Draft</p>
          <p className="text-sm text-body leading-relaxed whitespace-pre-wrap bg-surface rounded-md border border-line p-3">
            {target.pitchDraft}
          </p>
        </div>
      )}
      {target.confirmationMethod && (
        <span className="inline-block bg-surface px-2.5 py-1 rounded-md border border-line text-xs text-body">
          Confirm via {target.confirmationMethod}
        </span>
      )}
      {!target.notes && !target.pitchDraft && !target.confirmationMethod && (
        <p className="text-xs text-muted">No additional details.</p>
      )}
      <button onClick={onEdit} className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-body hover:bg-sunken transition-colors">
        Edit details
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SyncPage() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showReconcile, setShowReconcile] = useState(false)

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['sync', statusFilter],
    queryFn: () => api.sync.list(statusFilter ? { status: statusFilter } : undefined),
  })

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<SyncTarget> }) =>
      api.sync.patch(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.sync.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sync'] }),
  })

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    if (editingId === id) setEditingId(null)
  }

  if (error) {
    return (
      <div className="rounded-lg bg-danger-bg border border-danger-line px-4 py-3 text-sm text-danger-fg">
        Failed to load sync targets — {(error as Error).message}
      </div>
    )
  }

  const isPatching = patchMutation.isPending

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Sync Targets</h1>
        <div className="flex gap-2 items-center">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={FILTER_INPUT}>
            <option value="">All statuses</option>
            {SYNC_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <button
            onClick={() => { setShowReconcile((v) => !v); setShowCreate(false) }}
            className={`text-sm px-3.5 py-1.5 rounded-md font-medium border transition-colors ${
              showReconcile
                ? 'bg-line text-body border-line'
                : 'border-line-strong text-body hover:bg-sunken'
            }`}
          >
            Reconcile with Gmail
          </button>
          <button
            onClick={() => { setShowCreate((v) => !v); setShowReconcile(false) }}
            className={`text-sm px-3.5 py-1.5 rounded-md font-medium transition-colors ${
              showCreate ? 'bg-line text-body' : 'bg-accent text-accent-fg hover:bg-accent-hover'
            }`}
          >
            {showCreate ? 'Cancel' : '+ New target'}
          </button>
        </div>
      </div>

      {showReconcile && <ReconcilePanel onClose={() => setShowReconcile(false)} />}
      {showCreate && <CreateSyncForm onDone={() => setShowCreate(false)} />}

      {isLoading ? (
        <SkeletonList rows={5} />
      ) : (
        <div className="bg-surface border border-line rounded-xl shadow-card divide-y divide-line">
          {data.map((target) => {
            const isOpen = expanded.has(target.id)
            const isEditing = editingId === target.id
            return (
              <div key={target.id}>
                <div
                  onClick={() => toggleExpand(target.id)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isOpen ? 'bg-cat-violet-bg/40' : 'hover:bg-sunken'}`}
                >
                  <Chevron open={isOpen} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{target.name}</p>
                    <div className="flex gap-2 mt-0.5 flex-wrap">
                      {target.agencyType && <span className="text-xs text-muted capitalize">{target.agencyType}</span>}
                      {target.contactEmail && <span className="text-xs text-muted">{target.contactEmail}</span>}
                      {target.contactRole && <span className="text-xs text-muted">· {target.contactRole}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={target.status} />
                    {target.status === 'draft_ready' && (
                      <button disabled={isPatching}
                        onClick={(e) => { e.stopPropagation(); patchMutation.mutate({ id: target.id, body: { status: 'pitched' } }) }}
                        className="text-xs px-2.5 py-1 rounded-md bg-info-bg text-info-fg hover:bg-info-bg disabled:opacity-40 transition-colors">
                        Mark Pitched
                      </button>
                    )}
                    {target.status === 'pitched' && (
                      <>
                        <button disabled={isPatching}
                          onClick={(e) => { e.stopPropagation(); patchMutation.mutate({ id: target.id, body: { status: 'confirmed' } }) }}
                          className="text-xs px-2.5 py-1 rounded-md bg-success-bg text-success-fg hover:bg-success-bg disabled:opacity-40 transition-colors">
                          Confirmed
                        </button>
                        <button disabled={isPatching}
                          onClick={(e) => { e.stopPropagation(); patchMutation.mutate({ id: target.id, body: { status: 'declined' } }) }}
                          className="text-xs px-2.5 py-1 rounded-md bg-danger-bg text-danger-fg hover:bg-danger-bg disabled:opacity-40 transition-colors">
                          Declined
                        </button>
                      </>
                    )}
                    <button disabled={deleteMutation.isPending}
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${target.name}"?`)) deleteMutation.mutate(target.id) }}
                      className="w-6 h-6 flex items-center justify-center rounded text-faint hover:text-danger-fg hover:bg-danger-bg disabled:opacity-40 transition-colors"
                      title="Delete">
                      ×
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="px-6 pb-5 pt-3 bg-cat-violet-bg/40 border-t border-cat-violet-line">
                    {isEditing ? (
                      <EditSyncPanel
                        target={target}
                        onSave={(body) => patchMutation.mutate({ id: target.id, body })}
                        onCancel={() => setEditingId(null)}
                        isSaving={isPatching}
                      />
                    ) : (
                      <SyncDetail target={target} onEdit={() => setEditingId(target.id)} />
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {data.length === 0 && (
            <p className="px-4 py-12 text-center text-muted text-sm">No sync targets found.</p>
          )}
        </div>
      )}

      {!isLoading && <p className="text-xs text-muted">{data.length} targets</p>}
    </div>
  )
}
