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
import { api, type GigOpportunity } from '../api'
import { GIG_STATUSES, GIG_STATUS_META, normaliseGigStatus } from '../../../shared/gigStatus'
import { StatusBadge } from '../components/StatusBadge'
import { Chevron } from '../components/Chevron'
import { SkeletonTable } from '../components/Skeleton'
import {  FILTER } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { CreateGigForm } from './gigs/CreateGigForm'
import { EditGigPanel } from './gigs/EditGigPanel'
import { GigDetail } from './gigs/GigDetail'

// The pipeline order, from shared/gigStatus.ts, so the picker and the Worker
// can never disagree about what a status is or what it means.

const col = createColumnHelper<GigOpportunity>()

const TYPE_COLORS: Record<string, string> = {
  festival: 'bg-cat-violet-bg text-cat-violet-fg',
  showcase: 'bg-cat-sky-bg text-cat-sky-fg',
  competition: 'bg-warn-bg text-warn-fg',
  residency: 'bg-cat-teal-bg text-cat-teal-fg',
  venue: 'bg-cat-orange-bg text-cat-orange-fg',
  conference: 'bg-cat-rose-bg text-cat-rose-fg',
}


function TypeChip({ type }: { type: string }) {
  const color = TYPE_COLORS[type.toLowerCase()] ?? 'bg-sunken text-body'
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ${color}`}>
      {type}
    </span>
  )
}

function FitScore({ score }: { score: number | null }) {
  if (!score) return <span className="text-faint">—</span>
  return (
    <span className="flex gap-0.5 items-center">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`w-2 h-2 rounded-full ${i <= score ? 'bg-success-solid' : 'bg-line'}`} />
      ))}
    </span>
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
            className="flex items-center gap-2 text-left font-medium text-ink hover:text-info-fg transition-colors">
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
      cell: (info) => info.getValue() ?? <span className="text-faint">—</span>,
    }),
    col.accessor('deadline', {
      header: 'Deadline',
      cell: (info) => {
        const d = info.getValue()
        if (!d) return <span className="text-faint">—</span>
        const days = Math.round((new Date(d).getTime() - Date.now()) / 86400_000)
        const urgent = days >= 0 && days <= 14
        return (
          <span className={urgent ? 'text-cat-orange-fg font-medium' : 'text-body'}>
            {d}
            {urgent && days <= 7 && <span className="ml-1 text-xs text-cat-orange-fg">({days}d)</span>}
          </span>
        )
      },
    }),
    col.accessor('feeAmount', {
      header: 'Fee',
      cell: (info) => {
        const amt = info.getValue()
        const row = info.row.original
        if (amt == null && !row.fee) return <span className="text-faint">—</span>
        if (amt != null) return <span>{row.feeCurrency ?? 'USD'} {amt.toLocaleString()}</span>
        return <span className="text-muted text-xs">{row.fee}</span>
      },
    }),
    col.accessor('paid', {
      header: 'Paid',
      cell: (info) => info.getValue()
        ? <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-success-bg text-success-fg">Paid</span>
        : <span className="text-faint text-xs">—</span>,
    }),
    col.accessor('genreFitScore', {
      header: 'Fit',
      cell: (info) => <FitScore score={info.getValue() ?? null} />,
    }),
    col.accessor('status', {
      header: 'Status',
      cell: (info) => <StatusBadge status={info.getValue()} kind="gig" />,
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => {
        const row = info.row.original
        return (
          <div className="flex gap-1 justify-end">
            {normaliseGigStatus(row.status) === 'discovered' && (
              <>
                <Button variant="good" size="sm" disabled={isPatching}
                  onClick={() => patchMutation.mutate({ id: row.id, body: { status: 'shortlisted' } })}>
                  Will apply
                </Button>
                <Button variant="danger" size="sm" disabled={isPatching}
                  onClick={() => patchMutation.mutate({ id: row.id, body: { status: 'passed' } })}>
                  Pass
                </Button>
              </>
            )}
            {normaliseGigStatus(row.status) === 'shortlisted' && (
              <Button variant="info" size="sm" disabled={isPatching}
                onClick={() => patchMutation.mutate({ id: row.id, body: { status: 'submitted' } })}>
                Applied
              </Button>
            )}
            <button disabled={deleteMutation.isPending}
              onClick={() => { if (confirm(`Delete "${row.name}"?`)) deleteMutation.mutate(row.id) }}
              className="w-6 h-6 flex items-center justify-center rounded text-faint hover:text-danger-fg hover:bg-danger-bg disabled:opacity-40 transition-colors"
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
      <div className="rounded-lg bg-danger-bg border border-danger-line px-4 py-3 text-sm text-danger-fg">
        Failed to load gigs — {(error as Error).message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Gig Opportunities</h1>
        <div className="flex gap-2 items-center">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={FILTER}>
            <option value="">All statuses</option>
            {GIG_STATUSES.map((s) => (
              <option key={s} value={s} title={GIG_STATUS_META[s].meaning}>
                {GIG_STATUS_META[s].label}
              </option>
            ))}
          </select>
          <input
            placeholder="Search by name…"
            value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
            onChange={(e) => table.getColumn('name')?.setFilterValue(e.target.value)}
            className={`${FILTER} w-44`}
          />
          <button
            onClick={() => { setShowCreate((v) => !v) }}
            className={`text-sm px-3.5 py-1.5 rounded-md font-medium transition-colors ${
              showCreate ? 'bg-line text-body' : 'bg-accent text-accent-fg hover:bg-accent-hover'
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
        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-sunken border-b border-line">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th key={header.id} onClick={header.column.getToggleSortingHandler()}
                      className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide select-none cursor-pointer whitespace-nowrap hover:text-body transition-colors">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span className="ml-1 text-faint">
                        {header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : ''}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-line">
              {table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className={`transition-colors ${expanded.has(row.original.id) ? 'bg-info-bg/40' : 'hover:bg-sunken'}`}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 text-body">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {expanded.has(row.original.id) && (
                    <tr>
                      <td colSpan={columns.length} className="px-6 pb-5 pt-3 bg-info-bg/40 border-b border-info-line">
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
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-muted text-sm">
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
        <p className="text-xs text-muted">
          {table.getRowModel().rows.length !== data.length
            ? `${table.getRowModel().rows.length} of ${data.length} gigs`
            : `${data.length} gigs`}
        </p>
      )}
    </div>
  )
}
