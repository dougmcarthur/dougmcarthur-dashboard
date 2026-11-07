import { Fragment, useEffect, useState } from 'react'
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
import { usePhone } from '../hooks/usePhone'
import { humanise } from '../../../shared/humanise'
import { GIG_STAGES, GIG_STAGE_META, type GigStage } from '../../../shared/gigStage'
import { inlineGigMoves } from '../../../shared/decisionCopy'
import { parseDeadline } from '../../../shared/reviewParse'
import { localToday, shortDate } from '../format'
import { StatusBadge } from '../components/StatusBadge'
import { Chevron } from '../components/Chevron'
import { SkeletonList, SkeletonTable } from '../components/Skeleton'
import { Select, Input } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { CreateGigForm } from './gigs/CreateGigForm'
import { EditGigPanel } from './gigs/EditGigPanel'
import { GigDetail } from './gigs/GigDetail'
import { Banner, CAPTION_CLASS, Card } from '../components/ui/Surface'
import { useConfirm } from '../components/ui/ConfirmModal'

// The pipeline order, from shared/gigStatus.ts, so the picker and the Worker
// can never disagree about what a status is or what it means.

const col = createColumnHelper<GigOpportunity>()

/** The columns the phone's sort control offers; the table sorts by any header. */
const PHONE_SORTS = ['name', 'deadline']

const TYPE_COLORS: Record<string, string> = {
  festival: 'bg-cat-violet-bg text-cat-violet-fg',
  showcase: 'bg-cat-sky-bg text-cat-sky-fg',
  competition: 'bg-cat-rose-bg text-cat-rose-fg',
  residency: 'bg-cat-teal-bg text-cat-teal-fg',
  venue: 'bg-cat-orange-bg text-cat-orange-fg',
  conference: 'bg-cat-rose-bg text-cat-rose-fg',
}


function TypeChip({ type }: { type: string }) {
  const color = TYPE_COLORS[type.toLowerCase()] ?? 'bg-sunken text-body'
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {humanise(type)}
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

// ── Cells, shared by the table and the phone list ─────────────────────────────
//
// One renderer each, so the two layouts cannot say different things about the
// same gig: a phone list that wrote its own deadline would be the place a
// recovered date lost its prose.

/** The deadline as the table shows it, and as a phone card does. */
function DeadlineCell({ gig, today }: { gig: GigOpportunity; today: string }) {
  // Most rows hold prose here, not a date — "None — rolling artist roster
  // intake" — and a Date built from prose is Invalid Date, whose
  // countdown is NaN and never urgent. `parseDeadline` goes through `splitDeadline`
  // and counts against the `today` this render was handed.
  const d = parseDeadline(gig.deadline, { note: gig.deadlineNote, opensAt: gig.opensAt, today })
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
}

/**
 * The fee as the table shows it.
 *
 * `paid` used to be a column of its own and is a word on this one now.
 * It was filled on two rows of thirty-four, so it spent a column's width
 * drawing an em-dash thirty-two times to say "Paid" twice — and the row
 * whose fee is "Travel bursary available (amount unclear)" reads as one
 * piece of prose rather than as prose in one cell and a pill in another.
 */
function FeeCell({ gig }: { gig: GigOpportunity }) {
  const amt = gig.feeAmount
  const paid = gig.paid ? <span className="text-success-fg"> · paid</span> : null
  if (amt == null && !gig.fee) return <span className="text-faint">—</span>
  if (amt != null) {
    return <span>{gig.feeCurrency ?? 'USD'} {amt.toLocaleString()}{paid}</span>
  }
  return <span className="text-muted text-xs">{gig.fee}{paid}</span>
}

/**
 * The obvious next step for a gig, as buttons.
 *
 * Asked of the pipeline, never listed here. This cell used to hardcode
 * Will apply / Pass on a discovered row and Applied on a shortlisted one
 * — legal today, but a claim about legality nothing checked, and the
 * Review bar's fixed four went wrong exactly that way. `inlineGigMoves`
 * keeps it to the obvious next step; every other legal move is in
 * the expanded row's picker.
 *
 * `whitespace-nowrap` because in the table the header is empty and the column
 * is the first squeezed: "Will apply" broke onto two lines, and its Pass
 * stretched beside it to a 44px pill in a row of 26px ones. On a phone the
 * buttons are the large size, a tap target a thumb can hit.
 */
function GigActions({
  gig,
  disabled,
  onMove,
  phone = false,
}: {
  gig: GigOpportunity
  disabled: boolean
  onMove: (to: GigStatus) => void
  phone?: boolean
}) {
  return (
    // On a phone there is no hover to reveal them, and a list that hid its
    // buttons until a pointer arrived would show a narrow desktop window none.
    <div className={phone ? 'flex gap-2 whitespace-nowrap' : 'row-actions flex gap-1 justify-end whitespace-nowrap'}>
      {inlineGigMoves(gig.status, gig.type).map(({ to, tone, label, meaning }) => (
        <Button key={to} variant={tone === 'go' ? 'good' : 'neutral'} size={phone ? 'lg' : 'sm'}
          className={phone ? 'min-h-11' : ''} disabled={disabled} title={meaning}
          onClick={() => onMove(to)}>
          {label}
        </Button>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

/**
 * `initialOpen` is the route's argument: `#gigs/12` is the Gigs page with that
 * row already open, which is what a notification about one gig links to — the
 * alternative is a bell item that drops you on a table to find it again.
 */
export function GigsPage({ initialOpen = null }: { initialOpen?: string | null }) {
  const qc = useQueryClient()
  const phone = usePhone()
  const { confirm, ConfirmDialog } = useConfirm()
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(initialOpen && /^\d+$/.test(initialOpen) ? [Number(initialOpen)] : []),
  )
  // The page can already be on screen when the link is followed, in which case
  // nothing remounts and the state above never sees the new argument.
  useEffect(() => {
    if (initialOpen && /^\d+$/.test(initialOpen)) {
      setExpanded((prev) => new Set(prev).add(Number(initialOpen)))
    }
  }, [initialOpen])
  const [editingId, setEditingId] = useState<number | null>(null)
  // Four stages, not fourteen statuses: see shared/gigStage.ts. The route
  // maps a stage to the stored statuses in it.
  const [stageFilter, setStageFilter] = useState<GigStage | ''>('')
  const [showCreate, setShowCreate] = useState(false)

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['gigs', stageFilter],
    queryFn: () => api.gigs.list(stageFilter ? { stage: stageFilter } : undefined),
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

  /** The panel under an open gig, the same on a phone as in the table. */
  const detail = (gig: GigOpportunity) =>
    editingId === gig.id ? (
      <EditGigPanel
        gig={gig}
        onSave={(body) => patchMutation.mutate({ id: gig.id, body })}
        onCancel={() => setEditingId(null)}
        isSaving={isPatching}
      />
    ) : (
      <GigDetail
        gig={gig}
        onEdit={() => setEditingId(gig.id)}
        onStatusChange={(status) => patchMutation.mutate({ id: gig.id, body: { status } })}
        onDelete={async () => {
          const ok = await confirm({
            title: `Delete "${gig.name}"?`,
            description: 'This removes the opportunity and any saved application answers.',
            destructive: true,
          })
          if (ok) {
            deleteMutation.mutate(gig.id)
          }
        }}
        isPatching={isPatching}
        today={today}
      />
    )

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
      cell: (info) => <DeadlineCell gig={info.row.original} today={today} />,
    }),
    col.accessor('feeAmount', {
      header: 'Fee',
      cell: (info) => <FeeCell gig={info.row.original} />,
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
      cell: (info) => <StatusBadge status={info.getValue()} kind="gig" gigType={info.row.original.type} />,
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (info) => (
        <GigActions gig={info.row.original} disabled={isPatching}
          onMove={(to) => patchMutation.mutate({ id: info.row.original.id, body: { status: to } })} />
      ),
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
        Failed to load gigs: {(error as Error).message}
      </Banner>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink">Gig Opportunities</h1>
        <div className="flex flex-wrap gap-2 items-center">
          <Select
            filter
            aria-label="Filter by stage"
            className="max-md:min-h-11"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as GigStage | '')}
          >
            <option value="">All stages</option>
            {GIG_STAGES.map((s) => (
              <option key={s} value={s} title={GIG_STAGE_META[s].meaning}>
                {GIG_STAGE_META[s].label}
              </option>
            ))}
          </Select>
          {/* A phone has no column headers to tap, which is how the table sorts. */}
          {phone && (
            <Select
              filter
              aria-label="Sort gigs"
              className="min-h-11"
              value={PHONE_SORTS.includes(sorting[0]?.id ?? '') ? sorting[0].id : ''}
              onChange={(e) => setSorting(e.target.value ? [{ id: e.target.value, desc: false }] : [])}
            >
              <option value="">Default order</option>
              <option value="name">Name</option>
              <option value="deadline">Deadline</option>
            </Select>
          )}
          <Input
            aria-label="Search gigs by name"
            placeholder="Search by name…"
            value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
            onChange={(e) => table.getColumn('name')?.setFilterValue(e.target.value)}
            className="w-44 max-md:min-h-11"
          />
          <Button
            variant={showCreate ? 'neutral' : 'primary'}
            className="max-md:min-h-11"
            onClick={() => { setShowCreate((v) => !v) }}
          >
            {showCreate ? 'Cancel' : '+ New gig'}
          </Button>
        </div>
      </div>

      {showCreate && <CreateGigForm onDone={() => setShowCreate(false)} />}

      {isLoading ? (
        phone ? <SkeletonList rows={6} /> : <SkeletonTable rows={6} cols={8} />
      ) : phone ? (
        /*
          On a phone the table is twice the width of the screen, and the stage,
          which is what a row is for, sat past the right edge with the buttons.
          So it is a list: the name and the stage on top, then what the table
          had as columns, then the next step as a button a thumb can hit. The
          cells are the table's own (`DeadlineCell`, `FeeCell`, `GigActions`),
          and the open panel is the same one.
        */
        <Card pad="none" clip>
          <ul className="divide-y divide-line">
            {table.getRowModel().rows.map((row) => {
              const gig = row.original
              const open = expanded.has(gig.id)
              const hasMoves = inlineGigMoves(gig.status, gig.type).length > 0
              return (
                <li key={row.id} className={open ? 'bg-info-bg/40' : ''}>
                  <div className="px-4 py-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => toggleExpand(gig.id)}
                      aria-expanded={open}
                      className="flex w-full min-h-11 items-center gap-2 text-left font-medium text-ink hover:text-info-fg transition-colors"
                    >
                      <Chevron open={open} />
                      <span className="min-w-0 flex-1">{gig.name}</span>
                    </button>
                    <div className="pl-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <StatusBadge status={gig.status} kind="gig" gigType={gig.type} />
                      <TypeChip type={gig.type} />
                    </div>
                    <dl className="pl-6 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-body">
                      <div className="flex items-baseline gap-2">
                        <dt className="text-xs text-muted">Deadline</dt>
                        <dd><DeadlineCell gig={gig} today={today} /></dd>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <dt className="text-xs text-muted">Fee</dt>
                        <dd><FeeCell gig={gig} /></dd>
                      </div>
                      {showOrganizer && gig.organizer && (
                        <div className="flex items-baseline gap-2">
                          <dt className="text-xs text-muted">Organizer</dt>
                          <dd>{gig.organizer}</dd>
                        </div>
                      )}
                      {showFit && gig.genreFitScore != null && (
                        <div className="flex items-center gap-2">
                          <dt className="text-xs text-muted">Fit</dt>
                          <dd><FitScore score={gig.genreFitScore} /></dd>
                        </div>
                      )}
                    </dl>
                    {hasMoves && (
                      <div className="pl-6">
                        <GigActions phone gig={gig} disabled={isPatching}
                          onMove={(to) => patchMutation.mutate({ id: gig.id, body: { status: to } })} />
                      </div>
                    )}
                  </div>
                  {open && <div className="px-4 pb-5 pt-1">{detail(gig)}</div>}
                </li>
              )
            })}
            {table.getRowModel().rows.length === 0 && (
              <li className="px-4 py-12 text-center text-muted text-sm">No gigs match the current filters.</li>
            )}
          </ul>
        </Card>
      ) : (
        <Card pad="none" clip>
          {/* From a tablet up. The sideways scroll is only for the widths between
              the table's own minimum and the screen: below 768px it is the list above. */}
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
                  <tr className={`group transition-colors ${expanded.has(row.original.id) ? 'bg-info-bg/40' : 'hover:bg-sunken'}`}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 text-body">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {expanded.has(row.original.id) && (
                    <tr>
                      <td colSpan={columns.length} className="p-0 bg-info-bg/40 border-b border-info-line">
                        <div className="px-6 pb-5 pt-3">
                          {detail(row.original)}
                        </div>
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
      {ConfirmDialog}
    </div>
  )
}
