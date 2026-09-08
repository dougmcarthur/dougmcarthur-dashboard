import { useState } from 'react'
import {  type GigOpportunity } from '../../api'
import { FIELD } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { SUBMISSION_METHODS } from './constants'
import { performanceDateProblem } from '../../../../shared/performance'
import { TRAVEL_BANDS, LODGING_TIERS } from '../../../../shared/gigCost'

/** Editing an existing row in place, inside its expanded table row. */
export function EditGigPanel({
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
    opensAt: gig.opensAt ?? '',
    performanceStart: gig.performanceStart ?? '',
    performanceEnd: gig.performanceEnd ?? '',
    feeAmount: gig.feeAmount?.toString() ?? '',
    feeCurrency: gig.feeCurrency ?? 'USD',
    paid: Boolean(gig.paid),
    submissionMethod: gig.submissionMethod ?? '',
    audienceSize: gig.audienceSize?.toString() ?? '',
    genreFitScore: gig.genreFitScore?.toString() ?? '',
    fitRationale: gig.fitRationale ?? gig.fitNotes ?? '',
    url: gig.url ?? '',
    location: gig.location ?? '',
    country: gig.country ?? '',
    travelBand: gig.travelBand ?? '',
    lodgingTier: gig.lodgingTier ?? '',
    nights: gig.nights?.toString() ?? '',
    performanceKind: gig.performanceKind ?? '',
    stipendAmount: gig.stipendAmount?.toString() ?? '',
    guaranteeAmount: gig.guaranteeAmount?.toString() ?? '',
  })
  const set = (k: keyof typeof draft, v: string | boolean) =>
    setDraft((d) => ({ ...d, [k]: v }))

  // The API refuses a bad pair too; this is so you find out while the field is
  // still under your cursor rather than after a round trip.
  const dateProblem = performanceDateProblem(
    draft.performanceStart || null,
    draft.performanceEnd || null,
  )

  function handleSave() {
    if (dateProblem) return
    onSave({
      name: draft.name,
      type: draft.type,
      organizer: draft.organizer || null,
      deadline: draft.deadline || null,
      opensAt: draft.opensAt || null,
      performanceStart: draft.performanceStart || null,
      performanceEnd: draft.performanceEnd || null,
      feeAmount: draft.feeAmount ? parseFloat(draft.feeAmount) : null,
      feeCurrency: draft.feeCurrency,
      paid: draft.paid ? 1 : 0,
      submissionMethod: (draft.submissionMethod as GigOpportunity['submissionMethod']) || null,
      audienceSize: draft.audienceSize ? parseInt(draft.audienceSize) : null,
      genreFitScore: draft.genreFitScore ? parseInt(draft.genreFitScore) : null,
      fitRationale: draft.fitRationale || null,
      url: draft.url || null,
      location: draft.location || null,
      country: draft.country || null,
      travelBand: (draft.travelBand as GigOpportunity['travelBand']) || null,
      lodgingTier: (draft.lodgingTier as GigOpportunity['lodgingTier']) || null,
      // Empty means "not answered" and null carries that; 0 nights is a real
      // answer and has to survive, which `|| null` on a number would not.
      nights: draft.nights === '' ? null : parseInt(draft.nights),
      performanceKind: (draft.performanceKind as GigOpportunity['performanceKind']) || null,
      stipendAmount: draft.stipendAmount ? parseFloat(draft.stipendAmount) : null,
      guaranteeAmount: draft.guaranteeAmount ? parseFloat(draft.guaranteeAmount) : null,
    })
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Name</label>
          <input value={draft.name} onChange={(e) => set('name', e.target.value)} className={FIELD} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Type</label>
          <input value={draft.type} onChange={(e) => set('type', e.target.value)} className={FIELD} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Organizer</label>
          <input value={draft.organizer} onChange={(e) => set('organizer', e.target.value)} className={FIELD} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Deadline</label>
          <input type="date" value={draft.deadline} onChange={(e) => set('deadline', e.target.value)} className={FIELD} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Applications open</label>
          <input type="date" value={draft.opensAt} onChange={(e) => set('opensAt', e.target.value)} className={FIELD} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Fee</label>
          <div className="flex gap-1.5">
            <select value={draft.feeCurrency} onChange={(e) => set('feeCurrency', e.target.value)} className={`${FIELD} w-20 shrink-0`}>
              {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map((c) => <option key={c}>{c}</option>)}
            </select>
            <input type="number" min="0" value={draft.feeAmount} onChange={(e) => set('feeAmount', e.target.value)} className={FIELD} />
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
          <input type="number" min="0" value={draft.audienceSize} onChange={(e) => set('audienceSize', e.target.value)} className={FIELD} />
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
          <textarea rows={3} value={draft.fitRationale} onChange={(e) => set('fitRationale', e.target.value)} className={`${FIELD} resize-none`} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">URL</label>
          <input type="url" value={draft.url} onChange={(e) => set('url', e.target.value)} className={FIELD} />
        </div>

        {/*
          Separated and captioned, because these are the only dates on this
          form that mean a stage. The deadline above is a chore; these are the
          show, and they are the only ones the calendar writes as an event.
        */}
        <div className="col-span-2 pt-1">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Performance dates</p>
          <p className="text-xs text-faint mt-0.5">
            When you are on stage. Goes on your calendar once this is booked, and not before.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">First day</label>
          <input type="date" value={draft.performanceStart} onChange={(e) => set('performanceStart', e.target.value)} className={FIELD} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Last day <span className="text-faint font-normal">— if it runs more than one</span></label>
          <input type="date" value={draft.performanceEnd} onChange={(e) => set('performanceEnd', e.target.value)} className={FIELD} />
        </div>
        {dateProblem && (
          <p className="col-span-2 text-xs text-danger-fg">{dateProblem}</p>
        )}

        {/*
          The cost inputs. Every one is optional and every one is allowed to
          stay empty — `estimateGigCost` names what it could not count rather
          than defaulting it, so a half-filled section produces a partial
          estimate with its gaps on screen instead of a confident wrong number.
        */}
        <div className="col-span-2 pt-1">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">The trip</p>
          <p className="text-xs text-faint mt-0.5">
            What it costs to get there. Leave a band empty and it is guessed from the location, and
            labelled as guessed.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Where</label>
          <input
            type="text" placeholder="Gimli, MB" value={draft.location}
            onChange={(e) => set('location', e.target.value)} className={FIELD}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Country</label>
          <select value={draft.country} onChange={(e) => set('country', e.target.value)} className={FIELD}>
            <option value="">—</option>
            <option value="CA">Canada</option>
            <option value="US">United States</option>
            <option value="other">Somewhere else</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Getting there</label>
          <select value={draft.travelBand} onChange={(e) => set('travelBand', e.target.value)} className={FIELD}>
            <option value="">Guess from the location</option>
            {(Object.keys(TRAVEL_BANDS) as Array<keyof typeof TRAVEL_BANDS>).map((b) => (
              <option key={b} value={b} title={TRAVEL_BANDS[b].note}>
                {TRAVEL_BANDS[b].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            Nights away <span className="text-faint font-normal">— 0 if you sleep at home</span>
          </label>
          <input
            type="number" min={0} value={draft.nights}
            onChange={(e) => set('nights', e.target.value)} className={FIELD}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Room</label>
          <select value={draft.lodgingTier} onChange={(e) => set('lodgingTier', e.target.value)} className={FIELD}>
            <option value="">Guess from the location</option>
            {(Object.keys(LODGING_TIERS) as Array<keyof typeof LODGING_TIERS>).map((t) => (
              <option key={t} value={t}>{LODGING_TIERS[t].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Showcase or paid booking</label>
          <select
            value={draft.performanceKind}
            onChange={(e) => set('performanceKind', e.target.value)}
            className={FIELD}
          >
            {/*
              Empty is an open question, never a quiet "showcase". A US date
              with this unanswered keeps the ninety-day lead time, because
              resolving it in favour of the cheap answer is how you find out
              about the P-2 with sixty days left.
            */}
            <option value="">Not said yet</option>
            <option value="showcase">Showcase or conference</option>
            <option value="paid">Paid booking</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            Stipend <span className="text-faint font-normal">— CAD</span>
          </label>
          <input
            type="number" min={0} value={draft.stipendAmount}
            onChange={(e) => set('stipendAmount', e.target.value)} className={FIELD}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            Guarantee <span className="text-faint font-normal">— CAD</span>
          </label>
          <input
            type="number" min={0} value={draft.guaranteeAmount}
            onChange={(e) => set('guaranteeAmount', e.target.value)} className={FIELD}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
        <input type="checkbox" checked={draft.paid} onChange={(e) => set('paid', e.target.checked)} className="rounded border-line-strong" />
        {/*
          Not "Paid gig", which is what this said and is the opposite of what
          the column means: `paid` is what *you* pay *them* to be considered.
          The mislabel was survivable until `performance_kind` gave the word
          "paid" a second meaning on the same form.
        */}
        Costs money to enter
      </label>
      <div className="flex gap-2 pt-1">
        <Button variant="primary" onClick={handleSave} disabled={isSaving || dateProblem !== null} >
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="neutral" onClick={onCancel} >
          Cancel
        </Button>
      </div>
    </div>
  )
}
