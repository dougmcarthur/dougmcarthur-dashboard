import { Fragment, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type ColumnFiltersState,
  type SortingState,
} from '@tanstack/react-table'
import { api, type GigOpportunity, type GigStatus } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { Chevron } from '../components/Chevron'
import { SkeletonTable } from '../components/Skeleton'

const GIG_STATUSES: GigStatus[] = ['pending_review', 'approved', 'submitted', 'rejected', 'archived']
const SUBMISSION_METHODS = ['email', 'portal', 'form'] as const

const col = createColumnHelper<GigOpportunity>()

const TYPE_COLORS: Record<string, string> = {
  festival: 'bg-violet-50 text-violet-700',
  showcase: 'bg-sky-50 text-sky-700',
  competition: 'bg-amber-50 text-amber-700',
  residency: 'bg-teal-50 text-teal-700',
  venue: 'bg-orange-50 text-orange-700',
  conference: 'bg-rose-50 text-rose-700',
}

const INPUT = 'w-full text-sm border border-gray-300 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition'
const FILTER_INPUT = 'text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition'

function TypeChip({ type }: { type: string }) {
  const color = TYPE_COLORS[type.toLowerCase()] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ${color}`}>
      {type}
    </span>
  )
}

function FitScore({ score }: { score: number | null }) {
  if (!score) return <span className="text-gray-300">—</span>
  return (
    <span className="flex gap-0.5 items-center">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`w-2 h-2 rounded-full ${i <= score ? 'bg-green-500' : 'bg-gray-200'}`} />
      ))}
    </span>
  )
}

// ── Create form ───────────────────────────────────────────────────────────────

type GigDraft = {
  name: string; type: string; organizer: string; deadline: string
  feeAmount: string; feeCurrency: string; paid: boolean
  submissionMethod: string; audienceSize: string; genreFitScore: string
  fitRationale: string; url: string; status: GigStatus
}

const EMPTY_DRAFT: GigDraft = {
  name: '', type: '', organizer: '', deadline: '',
  feeAmount: '', feeCurrency: 'USD', paid: false,
  submissionMethod: '', audienceSize: '', genreFitScore: '',
  fitRationale: '', url: '', status: 'pending_review',
}

function CreateGigForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<GigDraft>(EMPTY_DRAFT)
  const set = (k: keyof GigDraft, v: string | boolean) =>
    setDraft((d) => ({ ...d, [k]: v }))

  const createMutation = useMutation({
    mutationFn: () =>
      api.gigs.create({
        name: draft.name,
        type: draft.type,
        organizer: draft.organizer || null,
        deadline: draft.deadline || null,
        feeAmount: draft.feeAmount ? parseFloat(draft.feeAmount) : null,
        feeCurrency: draft.feeCurrency || 'USD',
        paid: draft.paid ? 1 : 0,
        submissionMethod: (draft.submissionMethod as GigOpportunity['submissionMethod']) || null,
        audienceSize: draft.audienceSize ? parseInt(draft.audienceSize) : null,
        genreFitScore: draft.genreFitScore ? parseInt(draft.genreFitScore) : null,
        fitRationale: draft.fitRationale || null,
        fitNotes: null,
        url: draft.url || null,
        status: draft.status,
        fee: null,
        googleEventId: null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gigs'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      setDraft(EMPTY_DRAFT)
      onDone()
    },
  })

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">New Gig Opportunity</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="SXSW 2027" className={INPUT} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type *</label>
            <input value={draft.type} onChange={(e) => set('type', e.target.value)} placeholder="festival, showcase, venue…" className={INPUT} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Organizer</label>
          <input value={draft.organizer} onChange={(e) => set('organizer', e.target.value)} placeholder="SXSW LLC" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Deadline</label>
          <input type="date" value={draft.deadline} onChange={(e) => set('deadline', e.target.value)} className={INPUT} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Fee amount</label>
          <div className="flex gap-1.5">
            <select value={draft.feeCurrency} onChange={(e) => set('feeCurrency', e.target.value)} className={`${INPUT} w-20 shrink-0`}>
              {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map((c) => <option key={c}>{c}</option>)}
            </select>
            <input type="number" min="0" value={draft.feeAmount} onChange={(e) => set('feeAmount', e.target.value)} placeholder="0" className={INPUT} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Submit via</label>
          <select value={draft.submissionMethod} onChange={(e) => set('submissionMethod', e.target.value)} className={INPUT}>
            <option value="">—</option>
            {SUBMISSION_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Audience size</label>
          <input type="number" min="0" value={draft.audienceSize} onChange={(e) => set('audienceSize', e.target.value)} placeholder="500" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Fit score (1–5)</label>
          <select value={draft.genreFitScore} onChange={(e) => set('genreFitScore', e.target.value)} className={INPUT}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Why it fits</label>
          <textarea rows={3} value={draft.fitRationale} onChange={(e) => set('fitRationale', e.target.value)} placeholder="Describe the fit…" className={`${INPUT} resize-none`} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">URL</label>
          <input type="url" value={draft.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select value={draft.status} onChange={(e) => set('status', e.target.value as GigStatus)} className={INPUT}>
            {GIG_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={draft.paid} onChange={(e) => set('paid', e.target.checked)} className="rounded border-gray-300" />
        Paid gig
      </label>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => createMutation.mutate()}
          disabled={!draft.name || !draft.type || createMutation.isPending}
          className="text-sm px-4 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {createMutation.isPending ? 'Adding…' : 'Add gig'}
        </button>
        <button onClick={onDone} className="text-sm px-4 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Inline edit panel ─────────────────────────────────────────────────────────

function EditGigPanel({
  gig,
  onSave,
  onCancel,
  isSaving,
}: {
  gig: GigOpportunity
  onSave: (body: Partial<GigOpportunity>) => void
  onCancel: () => void
  isSaving: boolean
}) {
  const [draft, setDraft] = useState({
    name: gig.name,
    type: gig.type,
    organizer: gig.organizer ?? '',
    deadline: gig.deadline ?? '',
    feeAmount: gig.feeAmount?.toString() ?? '',
    feeCurrency: gig.feeCurrency ?? 'USD',
    paid: Boolean(gig.paid),
    submissionMethod: gig.submissionMethod ?? '',
    audienceSize: gig.audienceSize?.toString() ?? '',
    genreFitScore: gig.genreFitScore?.toString() ?? '',
    fitRationale: gig.fitRationale ?? gig.fitNotes ?? '',
    url: gig.url ?? '',
  })
  const set = (k: keyof typeof draft, v: string | boolean) =>
    setDraft((d) => ({ ...d, [k]: v }))

  function handleSave() {
    onSave({
      name: draft.name,
      type: draft.type,
      organizer: draft.organizer || null,
      deadline: draft.deadline || null,
      feeAmount: draft.feeAmount ? parseFloat(draft.feeAmount) : null,
      feeCurrency: draft.feeCurrency,
      paid: draft.paid ? 1 : 0,
      submissionMethod: (draft.submissionMethod as GigOpportunity['submissionMethod']) || null,
      audienceSize: draft.audienceSize ? parseInt(draft.audienceSize) : null,
      genreFitScore: draft.genreFitScore ? parseInt(draft.genreFitScore) : null,
      fitRationale: draft.fitRationale || null,
      url: draft.url || null,
    })
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Name</label>
          <input value={draft.name} onChange={(e) => set('name', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Type</label>
          <input value={draft.type} onChange={(e) => set('type', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Organizer</label>
          <input value={draft.organizer} onChange={(e) => set('organizer', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Deadline</label>
          <input type="date" value={draft.deadline} onChange={(e) => set('deadline', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Fee</label>
          <div className="flex gap-1.5">
            <select value={draft.feeCurrency} onChange={(e) => set('feeCurrency', e.target.value)} className={`${INPUT} w-20 shrink-0`}>
              {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map((c) => <option key={c}>{c}</option>)}
            </select>
            <input type="number" min="0" value={draft.feeAmount} onChange={(e) => set('feeAmount', e.target.value)} className={INPUT} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Submit via</label>
          <select value={draft.submissionMethod} onChange={(e) => set('submissionMethod', e.target.value)} className={INPUT}>
            <option value="">—</option>
            {SUBMISSION_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Audience size</label>
          <input type="number" min="0" value={draft.audienceSize} onChange={(e) => set('audienceSize', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Fit score (1–5)</label>
          <select value={draft.genreFitScore} onChange={(e) => set('genreFitScore', e.target.value)} className={INPUT}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-400 mb-1">Why it fits</label>
          <textarea rows={3} value={draft.fitRationale} onChange={(e) => set('fitRationale', e.target.value)} className={`${INPUT} resize-none`} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-400 mb-1">URL</label>
          <input type="url" value={draft.url} onChange={(e) => set('url', e.target.value)} className={INPUT} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" checked={draft.paid} onChange={(e) => set('paid', e.target.checked)} className="rounded border-gray-300" />
        Paid gig
      </label>
      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={isSaving} className="text-xs px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors">
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Read-only expand panel ────────────────────────────────────────────────────

function GigDetail({
  gig,
  onEdit,
  onStatusChange,
  isPatching,
}: {
  gig: GigOpportunity
  onEdit: () => void
  onStatusChange: (status: GigStatus) => void
  isPatching: boolean
}) {
  return (
    <div className="space-y-4 max-w-3xl">
      {(gig.fitRationale || gig.fitNotes) && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Why it fits</p>
          <p className="text-sm text-gray-700 leading-relaxed">{gig.fitRationale ?? gig.fitNotes}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        {gig.submissionMethod && (
          <span className="bg-white px-2.5 py-1 rounded-md border border-gray-200 text-gray-600">Submit via {gig.submissionMethod}</span>
        )}
        {gig.audienceSize && (
          <span className="bg-white px-2.5 py-1 rounded-md border border-gray-200 text-gray-600">~{gig.audienceSize.toLocaleString()} audience</span>
        )}
        {gig.googleEventId && (
          <span className="bg-white px-2.5 py-1 rounded-md border border-green-200 text-green-700">📅 Calendar synced</span>
        )}
        {gig.url && (
          <a href={gig.url} target="_blank" rel="noreferrer" className="bg-white px-2.5 py-1 rounded-md border border-gray-200 text-blue-600 hover:bg-blue-50 transition-colors">
            Open link ↗
          </a>
        )}
      </div>
      <div className="flex gap-2 flex-wrap pt-1">
        {gig.status === 'approved' && (
          <button disabled={isPatching} onClick={() => onStatusChange('submitted')}
            className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
            Mark Submitted
          </button>
        )}
        {gig.status === 'approved' && (
          <button disabled={isPatching} onClick={() => onStatusChange('archived')}
            className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
            Archive
          </button>
        )}
        <button onClick={onEdit}
          className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
          Edit details
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function GigsPage() {
  const qc = useQueryClient()
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['gigs', statusFilter],
    queryFn: () => api.gigs.list(statusFilter ? { status: statusFilter } : undefined),
  })

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<GigOpportunity> }) =>
      api.gigs.patch(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gigs'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.gigs.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gigs'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    if (editingId === id) setEditingId(null)
  }

  const isPatching = patchMutation.isPending

  const columns = [
    col.accessor('name', {
      header: 'Name',
      cell: (info) => {
        const isOpen = expanded.has(info.row.original.id)
        return (
          <button onClick={() => toggleExpand(info.row.original.id)}
            className="flex items-center gap-2 text-left font-medium text-gray-900 hover:text-blue-600 transition-colors">
            <Chevron open={isOpen} />
            {info.getValue()}
          </button>
        )
      },
    }),
    col.accessor('type', {
      header: 'Type',
      cell: (info) => <TypeChip type={info.getValue()} />,
    }),
    col.accessor('organizer', {
      header: 'Organizer',
      cell: (info) => info.getValue() ?? <span className="text-gray-300">—</span>,
    }),
    col.accessor('deadline', {
      header: 'Deadline',
      cell: (info) => {
        const d = info.getValue()
        if (!d) return <span className="text-gray-300">—</span>
        const days = Math.round((new Date(d).getTime() - Date.now()) / 86400_000)
        const urgent = days >= 0 && days <= 14
        return (
          <span className={urgent ? 'text-orange-600 font-medium' : 'text-gray-700'}>
            {d}
            {urgent && days <= 7 && <span className="ml-1 text-xs text-orange-400">({days}d)</span>}
          </span>
        )
      },
    }),
    col.accessor('feeAmount', {
      header: 'Fee',
      cell: (info) => {
        const amt = info.getValue()
        const row = info.row.original
        if (amt == null && !row.fee) return <span className="text-gray-300">—</span>
        if (amt != null) return <span>{row.feeCurrency ?? 'USD'} {amt.toLocaleString()}</span>
        return <span className="text-gray-500 text-xs">{row.fee}</span>
      },
    }),
    col.accessor('paid', {
      header: 'Paid',
      cell: (info) => info.getValue()
        ? <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700">Paid</span>
        : <span className="text-gray-300 text-xs">—</span>,
    }),
    col.accessor('genreFitScore', {
      header: 'Fit',
      cell: (info) => <FitScore score={info.getValue() ?? null} />,
    }),
    col.accessor('status', {
      header: 'Status',
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => {
        const row = info.row.original
        return (
          <div className="flex gap-1 justify-end">
            {row.status === 'pending_review' && (
              <>
                <button disabled={isPatching}
                  onClick={() => patchMutation.mutate({ id: row.id, body: { status: 'approved' } })}
                  className="text-xs px-2.5 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-40 transition-colors">
                  Approve
                </button>
                <button disabled={isPatching}
                  onClick={() => patchMutation.mutate({ id: row.id, body: { status: 'rejected' } })}
                  className="text-xs px-2.5 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors">
                  Reject
                </button>
              </>
            )}
            {row.status === 'approved' && (
              <button disabled={isPatching}
                onClick={() => patchMutation.mutate({ id: row.id, body: { status: 'submitted' } })}
                className="text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 transition-colors">
                Mark Submitted
              </button>
            )}
            <button disabled={deleteMutation.isPending}
              onClick={() => { if (confirm(`Delete "${row.name}"?`)) deleteMutation.mutate(row.id) }}
              className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
              title="Delete">
              ×
            </button>
          </div>
        )
      },
    }),
  ]

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        Failed to load gigs — {(error as Error).message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Gig Opportunities</h1>
        <div className="flex gap-2 items-center">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={FILTER_INPUT}>
            <option value="">All statuses</option>
            {GIG_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <input
            placeholder="Search by name…"
            value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
            onChange={(e) => table.getColumn('name')?.setFilterValue(e.target.value)}
            className={`${FILTER_INPUT} w-44`}
          />
          <button
            onClick={() => { setShowCreate((v) => !v) }}
            className={`text-sm px-3.5 py-1.5 rounded-md font-medium transition-colors ${
              showCreate ? 'bg-gray-200 text-gray-700' : 'bg-gray-900 text-white hover:bg-gray-700'
            }`}
          >
            {showCreate ? 'Cancel' : '+ New gig'}
          </button>
        </div>
      </div>

      {showCreate && <CreateGigForm onDone={() => setShowCreate(false)} />}

      {isLoading ? (
        <SkeletonTable rows={6} cols={8} />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th key={header.id} onClick={header.column.getToggleSortingHandler()}
                      className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide select-none cursor-pointer whitespace-nowrap hover:text-gray-700 transition-colors">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span className="ml-1 text-gray-300">
                        {header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : ''}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-100">
              {table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className={`transition-colors ${expanded.has(row.original.id) ? 'bg-blue-50/40' : 'hover:bg-gray-50'}`}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 text-gray-700">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {expanded.has(row.original.id) && (
                    <tr>
                      <td colSpan={columns.length} className="px-6 pb-5 pt-3 bg-blue-50/40 border-b border-blue-100">
                        {editingId === row.original.id ? (
                          <EditGigPanel
                            gig={row.original}
                            onSave={(body) => patchMutation.mutate({ id: row.original.id, body })}
                            onCancel={() => setEditingId(null)}
                            isSaving={isPatching}
                          />
                        ) : (
                          <GigDetail
                            gig={row.original}
                            onEdit={() => setEditingId(row.original.id)}
                            onStatusChange={(status) => patchMutation.mutate({ id: row.original.id, body: { status } })}
                            isPatching={isPatching}
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400 text-sm">
                    No gigs match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {!isLoading && (
        <p className="text-xs text-gray-400">
          {table.getRowModel().rows.length !== data.length
            ? `${table.getRowModel().rows.length} of ${data.length} gigs`
            : `${data.length} gigs`}
        </p>
      )}
    </div>
  )
}
