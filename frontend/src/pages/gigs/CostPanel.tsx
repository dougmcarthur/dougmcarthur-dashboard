import { type GigOpportunity } from '../../api'
import {
  estimateGigCost,
  visaLead,
  formatCostRange,
  type CostLine,
} from '../../../../shared/gigCost'

/**
 * What the trip costs, assembled on read.
 *
 * Never stored, for the reason `assembleEpk` is never stored: a number cached
 * in March cannot tell you the nights changed in April. And never blended
 * with anything — the swing-weighted `value` this would be a denominator for
 * is not built, and a single score here would be five weights nobody was
 * asked for. See docs/gig-pipeline-plan.md §7.
 */
export function CostPanel({ gig, today }: { gig: GigOpportunity; today: string }) {
  const estimate = estimateGigCost(gig)
  const lead = visaLead(gig, today)

  // Nothing banded and nothing paid: the row has none of the inputs, and a
  // panel reading "$0" would be a claim rather than an absence.
  if (estimate.lines.length === 0 && estimate.income.high === 0) {
    return (
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">What it costs</p>
        <p className="text-sm text-faint">
          Nothing to cost this on yet — add a location, a country and the nights away in Edit details.
        </p>
      </div>
    )
  }

  const pays = estimate.net.high < 0

  return (
    <div>
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">What it costs</p>

      <p className="text-lg font-semibold text-ink">
        {formatCostRange(estimate.net)}
        {estimate.anyInferred && <span className="text-xs font-normal text-faint ml-2">partly estimated</span>}
      </p>
      <p className="text-xs text-faint mt-0.5">
        {pays
          ? 'Net, after what they pay you — this one covers itself.'
          : 'Net of anything they pay you. An estimate, in CAD, at both ends.'}
      </p>

      <ul className="mt-2.5 space-y-1">
        {estimate.lines.map((line: CostLine) => (
          <li key={line.id} className="flex justify-between gap-4 text-sm">
            <span className="text-body">
              {line.label}
              {/*
                The same treatment a deadline gets when its date came out of
                prose. A band nobody set must not read as one somebody did.
              */}
              {line.inferred && <span className="text-faint"> · guessed</span>}
            </span>
            <span className="text-ink tabular-nums">{formatCostRange(line.amount)}</span>
          </li>
        ))}
        {estimate.income.high > 0 && (
          <li className="flex justify-between gap-4 text-sm">
            <span className="text-body">They pay</span>
            <span className="text-success-fg tabular-nums">−{formatCostRange(estimate.income)}</span>
          </li>
        )}
      </ul>

      {/*
        A lead time is not a line item. It is whether the date is reachable at
        all, so it gets its own block above the caveats rather than a row in
        the sum.
      */}
      {lead && (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-sm ${
            lead.short
              ? lead.certain
                ? 'border-danger-line bg-danger-bg text-danger-fg'
                : 'border-warn-line bg-warn-bg text-warn-fg'
              : 'border-line bg-surface text-body'
          }`}
        >
          <p className="font-semibold">
            {lead.short
              ? lead.certain
                ? `Not enough time for the P-2: ${lead.daysAvailable} days, and it needs ${lead.requirement.leadTimeDays}.`
                : `A US date ${lead.daysAvailable} days out — showcase or paid?`
              : `${lead.daysAvailable} days for the paperwork. Enough.`}
          </p>
          <p className="text-xs mt-0.5 opacity-90">
            {lead.requirement.reason} Counted from {lead.from === today ? 'today' : `the deadline, ${lead.from}`},
            because nobody files for a performer before applications close.
          </p>
        </div>
      )}

      {estimate.unknowns.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Not counted</p>
          <ul className="space-y-0.5">
            {estimate.unknowns.map((u) => (
              <li key={u} className="text-xs text-faint">
                {u}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
