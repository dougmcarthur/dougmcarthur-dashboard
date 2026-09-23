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
import { GIG_STATUSES, GIG_STATUS_META, gigStatusMeta } from '../../../shared/gigStatus'
import { GIG_MOVE_LABEL, inlineGigMoves } from '../../../shared/decisionCopy'
import { parseDeadline } from '../../../shared/reviewParse'
import { localToday, shortDate } from '../format'
import { StatusBadge } from '../components/StatusBadge'
import { Chevron } from '../components/Chevron'
import { SkeletonTable } from '../components/Skeleton'
import {  FILTER } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { CreateGigForm } from './gigs/CreateGigForm'
import { EditGigPanel } from './gigs/EditGigPanel'
import { GigDetail } from './gigs/GigDetail'
import { Banner, CAPTION_CLASS, Card } from '../components/ui/Surface'

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

  // Read once per render and handed to every cell, so the whole table counts
  // from the same day and no cell reads the clock for itself.
  const today = localToday()

  /**
   * Whether any row in the table has ever filled this in.
   *
   * `organizer` and `genreFitScore` are empty on all thirty-four production
   * rows, because nothing extracts them — CLAUDE.md records that no note
   * carries either in a form anything can read. They were still two of eight
   * columns, a quarter of the table's width holding an em-dash on every row,
   * while `name` wrapped to three lines in what was left.
   *
   * Dropping them outright would be wrong: both are editable by hand in the
   * create and edit forms, so they *can* hold a value and hiding one would
   * hide something somebody typed. Asking the data instead is the same rule
   * the rest of this pass follows — the column appears the moment one row has
   * something to put in it, and goes when the last one is cleared.
   *
   * Measured against the whole result set rather than the filtered view, so
   * that changing a status filter cannot make columns appear and disappear
   * underneath the cursor.
   */
  const filled = (has: (row: (typeof data)[number]) => boolean) => data.some(has)
  const showOrganizer = filled((r) => Boolean(r.organizer))
  const showFit = filled((r) => r.genreFitScore != null)

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
    ...(showOrganizer
      ? [
          col.accessor('organizer', {
            header: 'Organizer',
            cell: (info) => info.getValue() ?? <span className="text-faint">—</span>,
          }),
        ]
      : []),
    col.accessor('deadline', {
      header: 'Deadline',
      // Most rows hold prose here, not a date — "None — rolling artist roster
      // intake" — and a Date built from prose is Invalid Date, whose
      // countdown is NaN and never urgent. `parseDeadline` goes through `splitDeadline`
      // and counts against the `today` this render was handed.
      cell: (info) => {
        const row = info.row.original
        const d = parseDeadline(info.getValue(), { note: row.deadlineNote, opensAt: row.opensAt, today })
        // No closing date, but the window's opening is known — the fixture's
        // "applications open in three weeks" row. An em-dash there reads as
        // "nothing known", which is the one thing it is not.
        if (!d.raw && !d.note) {
          return d.opensAt
            ? <span className="text-xs text-muted whitespace-nowrap">Opens {shortDate(d.opensAt)}</span>
            : <span className="text-faint">—</span>
        }
        // Where a date was recovered from prose the prose stays beside it,
        // exactly as the Review pane does: the recovery is a reading, and
        // "Nov 20" alone claims a certainty the column does not have.
        const prose = d.exact ? d.note : (d.raw ?? d.note)
        if (!d.date) {
          return <span className="max-w-56 text-xs text-muted line-clamp-2" title={prose ?? undefined}>{prose}</span>
        }
        const days = d.daysUntil ?? -1
        const urgent = days >= 0 && days <= 14
        return (
          <div className="max-w-56">
            <span className={`whitespace-nowrap ${urgent ? 'text-cat-orange-fg font-medium' : 'text-body'}`}>
              {shortDate(d.date)}
              {urgent && days <= 7 && (
                <span className="ml-1 text-xs text-cat-orange-fg">({days === 0 ? 'today' : `${days}d`})</span>
              )}
            </span>
            {prose && <span className="text-xs text-muted line-clamp-2" title={prose}>{prose}</span>}
          </div>
        )
      },
    }),
    col.accessor('feeAmount', {
      header: 'Fee',
      // `paid` used to be a column of its own and is a word on this one now.
      // It was filled on two rows of thirty-four, so it spent a column's width
      // drawing an em-dash thirty-two times to say "Paid" twice — and the row
      // whose fee is "Travel bursary available (amount unclear)" reads as one
      // piece of prose rather than as prose in one cell and a pill in another.
      cell: (info) => {
        const amt = info.getValue()
        const row = info.row.original
        const paid = row.paid ? <span className="text-success-fg"> · paid</span> : null
        if (amt == null && !row.fee) return <span className="text-faint">—</span>
        if (amt != null) {
          return <span>{row.feeCurrency ?? 'USD'} {amt.toLocaleString()}{paid}</span>
        }
        return <span className="text-muted text-xs">{row.fee}{paid}</span>
      },
    }),
    ...(showFit
      ? [
          col.accessor('genreFitScore', {
            header: 'Fit',
            cell: (info) => <FitScore score={info.getValue() ?? null} />,
          }),
        ]
      : []),
    col.accessor('status', {
      header: 'Status',
      cell: (info) => <StatusBadge status={info.getValue()} kind="gig" />,
    }),
    col.display({
      id: 'actions',
      header: '',
      // Asked of the pipeline, never listed here. This cell used to hardcode
      // Will apply / Pass on a discovered row and Applied on a shortlisted one
      // — legal today, but a claim about legality nothing checked, and the
      // Review bar's fixed four went wrong exactly that way. `inlineGigMoves`
      // keeps the cell to the obvious next step; every other legal move is in
      // the expanded row's picker.
      cell: (info) => {
        const row = info.row.original
        // `whitespace-nowrap` because the header is empty and the column is
        // the first squeezed: "Will apply" broke onto two lines, and its Pass
        // stretched beside it to a 44px pill in a row of 26px ones.
        return (
          <div className="flex gap-1 justify-end whitespace-nowrap">
            {inlineGigMoves(row.status).map(({ to, tone }) => (
              <Button key={to} variant={tone === 'go' ? 'good' : 'danger'} size="sm" disabled={isPatching}
                title={gigStatusMeta(to).meaning}
                onClick={() => patchMutation.mutate({ id: row.id, body: { status: to } })}>
                {GIG_MOVE_LABEL[to] ?? gigStatusMeta(to).label}
              </Button>
            ))}
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
      <Banner>
        Failed to load gigs — {(error as Error).message}
      </Banner>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink">Gig Opportunities</h1>
        <div className="flex flex-wrap gap-2 items-center">
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
        <Card pad="none" clip>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-sunken border-b border-line">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th key={header.id} onClick={header.column.getToggleSortingHandler()}
                      className={`px-4 py-2.5 text-left ${CAPTION_CLASS} select-none cursor-pointer whitespace-nowrap hover:text-body transition-colors`}>
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
                            onDelete={() => {
                              if (confirm(`Delete "${row.original.name}"?`)) {
                                deleteMutation.mutate(row.original.id)
                              }
                            }}
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
        </Card>
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
