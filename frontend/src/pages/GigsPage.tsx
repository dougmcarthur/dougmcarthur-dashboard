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
import { StatusBadge } from '../components/StatusBadge'
import { Chevron } from '../components/Chevron'
import { SkeletonTable } from '../components/Skeleton'
import { ApplicationPrep } from '../components/ApplicationPrep'

const GIG_STATUSES: GigStatus[] = [
  'pending_review',
  'approved',
  'awaiting_window',
  'submitted',
  'rejected',
  'archived',
]
const SUBMISSION_METHODS = ['email', 'portal', 'form'] as const
const PREP_TRACKED: GigStatus[] = ['approved', 'awaiting_window', 'submitted']

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Mirrors the server's windowState() so the table reads the same way. */
function windowStateOf(gig: GigOpportunity): 'open' | 'upcoming' | 'closed' | 'unknown' {
  const today = todayStr()
  const opens = gig.submissionOpensAt?.slice(0, 10) || null
  const closes = (gig.submissionClosesAt || gig.deadline)?.slice(0, 10) || null
  if (closes && closes < today) return 'closed'
  if (opens && opens > today) return 'upcoming'
  if (opens || closes) return 'open'
  return 'unknown'
}

function daysUntil(date: string): number {
  const a = Date.parse(`${todayStr()}T00:00:00Z`)
  const b = Date.parse(`${date.slice(0, 10)}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

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
  submissionOpensAt: string; submissionClosesAt: string
  applicationUrl: string; loginRequired: boolean; windowNote: string
}

const EMPTY_DRAFT: GigDraft = {
  name: '', type: '', organizer: '', deadline: '',
  feeAmount: '', feeCurrency: 'USD', paid: false,
  submissionMethod: '', audienceSize: '', genreFitScore: '',
  fitRationale: '', url: '', status: 'pending_review',
  submissionOpensAt: '', submissionClosesAt: '',
  applicationUrl: '', loginRequired: false, windowNote: '',
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
        url: draft.url || null,
        status: draft.status,
        submissionOpensAt: draft.submissionOpensAt || null,
        submissionClosesAt: draft.submissionClosesAt || null,
        applicationUrl: draft.applicationUrl || null,
        windowNote: draft.windowNote || null,
        loginRequired: draft.loginRequired ? 1 : 0,
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
          <label className="block text-xs font-medium text-gray-500 mb-1">Submissions open</label>
          <input type="date" value={draft.submissionOpensAt} onChange={(e) => set('submissionOpensAt', e.target.value)} className={INPUT} />
          <p className="text-[11px] text-gray-400 mt-1">Leave blank if the window is already open.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Submissions close</label>
          <input type="date" value={draft.submissionClosesAt} onChange={(e) => set('submissionClosesAt', e.target.value)} className={INPUT} />
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Application form URL</label>
          <input type="url" value={draft.applicationUrl} onChange={(e) => set('applicationUrl', e.target.value)} placeholder="Direct link to the form (if different from the main URL)" className={INPUT} />
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

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={draft.paid} onChange={(e) => set('paid', e.target.checked)} className="rounded border-gray-300" />
          Paid gig
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={draft.loginRequired} onChange={(e) => set('loginRequired', e.target.checked)} className="rounded border-gray-300" />
          Application is behind a login
        </label>
      </div>

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
    submissionOpensAt: gig.submissionOpensAt ?? '',
    submissionClosesAt: gig.submissionClosesAt ?? '',
    applicationUrl: gig.applicationUrl ?? '',
    windowNote: gig.windowNote ?? '',
    loginRequired: Boolean(gig.loginRequired),
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
      submissionOpensAt: draft.submissionOpensAt || null,
      submissionClosesAt: draft.submissionClosesAt || null,
      applicationUrl: draft.applicationUrl || null,
      windowNote: draft.windowNote || null,
      loginRequired: draft.loginRequired ? 1 : 0,
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

        <div className="col-span-2 pt-1 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2 mb-2">Submission window</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Opens</label>
          <input type="date" value={draft.submissionOpensAt} onChange={(e) => set('submissionOpensAt', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Closes</label>
          <input type="date" value={draft.submissionClosesAt} onChange={(e) => set('submissionClosesAt', e.target.value)} className={INPUT} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-400 mb-1">Application form URL</label>
          <input type="url" value={draft.applicationUrl} onChange={(e) => set('applicationUrl', e.target.value)} placeholder="Direct link to the form" className={INPUT} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-400 mb-1">Window note</label>
          <input value={draft.windowNote} onChange={(e) => set('windowNote', e.target.value)} placeholder="e.g. early bird until Aug 1, applications usually open in March" className={INPUT} />
        </div>
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={draft.paid} onChange={(e) => set('paid', e.target.checked)} className="rounded border-gray-300" />
          Paid gig
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={draft.loginRequired} onChange={(e) => set('loginRequired', e.target.checked)} className="rounded border-gray-300" />
          Behind a login
        </label>
      </div>
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

function WindowChip({ gig }: { gig: GigOpportunity }) {
  const state = windowStateOf(gig)
  if (state === 'upcoming') {
    const days = daysUntil(gig.submissionOpensAt!)
    return (
      <span className="bg-white px-2.5 py-1 rounded-md border border-indigo-200 text-indigo-700">
        ⏳ Opens {gig.submissionOpensAt} ({days === 0 ? 'today' : `in ${days}d`})
      </span>
    )
  }
  if (state === 'closed') {
    return (
      <span className="bg-white px-2.5 py-1 rounded-md border border-gray-200 text-gray-500">
        Window closed
      </span>
    )
  }
  if (state === 'open') {
    return (
      <span className="bg-white px-2.5 py-1 rounded-md border border-green-200 text-green-700">
        Window open
      </span>
    )
  }
  return null
}

function GigDetail({
  gig,
  onEdit,
  onPatch,
  isPatching,
}: {
  gig: GigOpportunity
  onEdit: () => void
  onPatch: (body: Partial<GigOpportunity>) => void
  isPatching: boolean
}) {
  const [scheduleDate, setScheduleDate] = useState(gig.submissionOpensAt ?? '')
  const state = windowStateOf(gig)
  const active = gig.status === 'approved' || gig.status === 'awaiting_window'

  return (
    <div className="space-y-4 max-w-3xl">
      {(gig.fitRationale || gig.fitNotes) && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Why it fits</p>
          <p className="text-sm text-gray-700 leading-relaxed">{gig.fitRationale ?? gig.fitNotes}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        <WindowChip gig={gig} />
        {gig.submissionMethod && (
          <span className="bg-white px-2.5 py-1 rounded-md border border-gray-200 text-gray-600">Submit via {gig.submissionMethod}</span>
        )}
        {gig.audienceSize && (
          <span className="bg-white px-2.5 py-1 rounded-md border border-gray-200 text-gray-600">~{gig.audienceSize.toLocaleString()} audience</span>
        )}
        {Boolean(gig.loginRequired) && (
          <span className="bg-white px-2.5 py-1 rounded-md border border-amber-200 text-amber-700">🔒 Login required</span>
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

      {gig.windowNote && <p className="text-xs text-gray-500">{gig.windowNote}</p>}

      {/* Approving something that isn't open yet needs a date to wait on. */}
      {gig.status === 'pending_review' && (
        <div className="flex flex-wrap items-end gap-2 bg-white border border-gray-200 rounded-lg p-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Submissions open on</label>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className={`${INPUT} w-44`}
            />
          </div>
          <button
            disabled={!scheduleDate || isPatching}
            onClick={() => onPatch({ submissionOpensAt: scheduleDate, status: 'approved' })}
            className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            Approve for later
          </button>
          <p className="text-xs text-gray-400 basis-full">
            Files this gig under “awaiting window”, schedules the reminder email, and prepares your
            answers ahead of the date.
          </p>
        </div>
      )}

      <div className="flex gap-2 flex-wrap pt-1">
        {gig.status === 'awaiting_window' && (
          <button disabled={isPatching} onClick={() => onPatch({ status: 'approved' })}
            className="text-xs px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 transition-colors">
            {state === 'upcoming' ? 'Open it early' : 'Mark window open'}
          </button>
        )}
        {active && (
          <button disabled={isPatching} onClick={() => onPatch({ status: 'submitted' })}
            className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
            Mark Submitted
          </button>
        )}
        {active && (
          <button disabled={isPatching} onClick={() => onPatch({ status: 'archived' })}
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

  // Reminder emails link straight to a gig: #gigs/42 opens it expanded.
  useEffect(() => {
    const deepLinked = Number(window.location.hash.split('/')[1])
    if (Number.isFinite(deepLinked) && deepLinked > 0) {
      setExpanded((prev) => new Set(prev).add(deepLinked))
    }
  }, [])

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
    col.display({
      id: 'window',
      header: 'Window',
      cell: (info) => {
        const gig = info.row.original
        const state = windowStateOf(gig)
        if (state === 'upcoming') {
          const days = daysUntil(gig.submissionOpensAt!)
          return (
            <span className="text-indigo-600 whitespace-nowrap">
              {gig.submissionOpensAt}
              <span className="ml-1 text-xs text-indigo-400">({days}d)</span>
            </span>
          )
        }
        if (state === 'open') return <span className="text-green-600 text-xs">open</span>
        if (state === 'closed') return <span className="text-gray-400 text-xs">closed</span>
        return <span className="text-gray-300">—</span>
      },
    }),
    col.display({
      id: 'prep',
      header: 'Answers',
      cell: (info) => {
        const gig = info.row.original
        if (!PREP_TRACKED.includes(gig.status)) return <span className="text-gray-300">—</span>
        switch (gig.prepStatus) {
          case 'ready':
            return <span className="text-xs text-green-700">prepared</span>
          case 'queued':
            return <span className="text-xs text-blue-600">queued</span>
          case 'blocked':
            return <span className="text-xs text-amber-700">needs you</span>
          case 'failed':
            return <span className="text-xs text-red-600">retrying</span>
          default:
            // Forms go up when submissions open, so prep waits for the window.
            return windowStateOf(gig) === 'upcoming' ? (
              <span className="text-xs text-indigo-500">on open</span>
            ) : (
              <span className="text-gray-300">—</span>
            )
        }
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
            {(row.status === 'approved' || row.status === 'awaiting_window') && (
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
                          <>
                            <GigDetail
                              gig={row.original}
                              onEdit={() => setEditingId(row.original.id)}
                              onPatch={(body) => patchMutation.mutate({ id: row.original.id, body })}
                              isPatching={isPatching}
                            />
                            {PREP_TRACKED.includes(row.original.status) && (
                              <div className="mt-5 pt-4 border-t border-blue-100">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                                  Application answers
                                </p>
                                <ApplicationPrep gigId={row.original.id} />
                              </div>
                            )}
                          </>
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
