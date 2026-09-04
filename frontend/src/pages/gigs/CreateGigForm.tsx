import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type GigOpportunity, type GigStatus } from '../../api'
import { GIG_STATUSES, GIG_STATUS_META } from '../../../../shared/gigStatus'
import { FIELD } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { SUBMISSION_METHODS } from './constants'

/** The "+ New gig" form. Its own draft shape, kept local to it. */
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
  fitRationale: '', url: '', status: 'discovered',
}

export function CreateGigForm({ onDone }: { onDone: () => void }) {
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
        // The form takes a date picker's value, so there is nothing to
        // qualify and no window — migration 0003's columns start empty.
        deadlineNote: null,
        opensAt: null,
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
    <div className="bg-surface border border-line rounded-xl shadow-card p-5 space-y-4">
      <h2 className="text-sm font-semibold text-ink">New Gig Opportunity</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Name *</label>
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="SXSW 2027" className={FIELD} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Type *</label>
            <input value={draft.type} onChange={(e) => set('type', e.target.value)} placeholder="festival, showcase, venue…" className={FIELD} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">Organizer</label>
          <input value={draft.organizer} onChange={(e) => set('organizer', e.target.value)} placeholder="SXSW LLC" className={FIELD} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Deadline</label>
          <input type="date" value={draft.deadline} onChange={(e) => set('deadline', e.target.value)} className={FIELD} />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">Fee amount</label>
          <div className="flex gap-1.5">
            <select value={draft.feeCurrency} onChange={(e) => set('feeCurrency', e.target.value)} className={`${FIELD} w-20 shrink-0`}>
              {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map((c) => <option key={c}>{c}</option>)}
            </select>
            <input type="number" min="0" value={draft.feeAmount} onChange={(e) => set('feeAmount', e.target.value)} placeholder="0" className={FIELD} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Submit via</label>
          <select value={draft.submissionMethod} onChange={(e) => set('submissionMethod', e.target.value)} className={FIELD}>
            <option value="">—</option>
            {SUBMISSION_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">Audience size</label>
          <input type="number" min="0" value={draft.audienceSize} onChange={(e) => set('audienceSize', e.target.value)} placeholder="500" className={FIELD} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Fit score (1–5)</label>
          <select value={draft.genreFitScore} onChange={(e) => set('genreFitScore', e.target.value)} className={FIELD}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">Why it fits</label>
          <textarea rows={3} value={draft.fitRationale} onChange={(e) => set('fitRationale', e.target.value)} placeholder="Describe the fit…" className={`${FIELD} resize-none`} />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">URL</label>
          <input type="url" value={draft.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" className={FIELD} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Status</label>
          <select value={draft.status} onChange={(e) => set('status', e.target.value as GigStatus)} className={FIELD}>
            {GIG_STATUSES.map((s) => (
              <option key={s} value={s} title={GIG_STATUS_META[s].meaning}>
                {GIG_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
        <input type="checkbox" checked={draft.paid} onChange={(e) => set('paid', e.target.checked)} className="rounded border-line-strong" />
        Paid gig
      </label>

      <div className="flex gap-2 pt-1">
        <Button variant="primary"
          onClick={() => createMutation.mutate()}
          disabled={!draft.name || !draft.type || createMutation.isPending}
          className="px-4"
        >
          {createMutation.isPending ? 'Adding…' : 'Add gig'}
        </Button>
        <Button variant="neutral" onClick={onDone} className="px-4">
          Cancel
        </Button>
      </div>
    </div>
  )
}
