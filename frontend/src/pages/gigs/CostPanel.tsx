import { useQuery } from '@tanstack/react-query'
import { api, type GigOpportunity } from '../../api'
import { mappablePlace, measuredDistance } from '../../../../shared/travelDistance'
import { profileHome } from '../../../../shared/onboarding'
import {
  estimateGigCost,
  homeFrom,
  visaLead,
  formatCostRange,
  outlookScale,
  type CostLine,
  type CostRange,
  type Outlook,
  type PayLine,
} from '../../../../shared/gigCost'
import { Caption } from '../../components/ui/Surface'

/**
 * The badge. Words chosen to be encouraging without being untrue: spending on
 * a showcase is an investment in being heard, and a trip that pays is income.
 * Colours are meaning tokens, and neither of the two hard ones is a warning:
 * a trip that costs more than it pays is not a problem to be flagged.
 */
const OUTLOOK_STYLE: Record<Outlook['id'], string> = {
  income: 'bg-success-bg text-success-fg border-success-line',
  even: 'bg-surface text-body border-line',
  investment: 'bg-info-bg text-info-fg border-info-line',
}

const BAR_STYLE: Record<Outlook['id'], string> = {
  income: 'bg-success-solid',
  even: 'bg-accent',
  investment: 'bg-accent',
}

/**
 * Where the trip falls between a bigger investment and a bigger payout.
 *
 * A bar rather than a point, because the estimate is a range: one that crosses
 * the middle says "could go either way" without a word. The scale is not
 * linear, so a $200 trip and a $4,000 one read as different sizes (see
 * `scalePosition`). It carries no dollar figures of its own; the sentence above
 * it and the totals below it have them, and a graphic that printed a third
 * set would be a third place for them to disagree.
 */
function OutlookScaleGraphic({ outlook, net }: { outlook: Outlook; net: CostRange }) {
  const scale = outlookScale(net)
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`
  // A hairline is still a bar: a trip that costs almost exactly what it pays
  // has a range a few dollars wide, and nothing drawn would read as no answer.
  const width = Math.max(scale.to - scale.from, 0.025)
  const left = Math.min(scale.from, 1 - width)

  return (
    <div
      className="mt-3"
      role="img"
      aria-label={`On a scale from a bigger investment to a bigger payout: ${outlook.label}. ${outlook.summary}`}
    >
      <div className="relative h-2.5 rounded-full border border-line bg-sunken">
        {scale.ticks.map((t) => (
          <span key={t.ahead} className="absolute inset-y-0 w-px bg-line-strong/60" style={{ left: pct(t.position) }} />
        ))}
        <span className="absolute -inset-y-1 w-0.5 bg-line-strong" style={{ left: '50%' }} />
        <span
          className={`absolute inset-y-0 rounded-full ${BAR_STYLE[outlook.id]}`}
          style={{ left: pct(left), width: pct(width) }}
        />
      </div>
      <div className="mt-1 grid grid-cols-3 text-xs text-muted" aria-hidden>
        <span>Bigger investment</span>
        <span className="text-center">Even</span>
        <span className="text-right">Bigger payout</span>
      </div>
    </div>
  )
}

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
  const home = useQuery({ queryKey: ['travel-home'], queryFn: api.travel.home })
  const said = useQuery({ queryKey: ['onboarding'], queryFn: api.onboarding.read })
  // Where they travel from, so a guess is made from their province and not
  // from nobody's: the home base when there is one, and the province they said
  // in the welcome questions until then. See `inferTravelBand`.
  const estimate = estimateGigCost(gig, homeFrom(home.data?.home?.place) ?? profileHome(said.data?.profile ?? null))
  const lead = visaLead(gig, today)

  // Measured on the map, or why not. Only asked where the gig names a real
  // place and nobody set its band by hand — elsewhere a map has nothing to add.
  const travel = estimate.lines.find((l) => l.id === 'travel')
  const mapBasis = travel?.basis ?? null
  const measurable = !gig.travelBand && mappablePlace(gig) !== null && !measuredDistance(gig)
  const whyGuessed = !measurable
    ? null
    : home.data && !home.data.home
      ? 'Set where you travel from in Settings, and this trip is measured on the map instead of guessed.'
      : gig.geoStatus === 'not_found' && gig.geoPlace === mappablePlace(gig)
        ? `The map does not know "${gig.geoPlace}", so this is guessed from the name.`
        : home.data?.home
          ? 'Being measured on the map. It takes up to an hour.'
          : null

  // Nothing banded and nothing paid: the row has none of the inputs, and a
  // panel reading "$0" would be a claim rather than an absence.
  if (estimate.lines.length === 0 && estimate.income.high === 0) {
    return (
      <div>
        <Caption spaced>Costs and pay</Caption>
        <p className="text-sm text-muted">
          Nothing to cost this on yet. Add a location, a country and the nights away in Edit details.
        </p>
      </div>
    )
  }

  const { outlook } = estimate

  return (
    <div>
      <Caption spaced>Costs and pay</Caption>

      {/*
        The answer first, as a word and a sentence. Everything below is how it
        was reached, and the sentence carries the same ranges the rows do.
      */}
      {outlook && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={`inline-block rounded-md border px-2.5 py-0.5 text-sm font-semibold ${OUTLOOK_STYLE[outlook.id]}`}
          >
            {outlook.label}
          </span>
          <p className="text-sm text-ink">{outlook.summary}</p>
        </div>
      )}
      {outlook && <OutlookScaleGraphic outlook={outlook} net={estimate.net} />}
      <p className="text-xs text-muted mt-2">
        Estimates in Canadian dollars, shown as a range because the real figure depends on the trip.
        {estimate.anyInferred && ' Partly estimated from the location.'}
      </p>

      {/* What it costs, line by line, and the total of the lines. */}
      <ul className="mt-3 space-y-2">
        {estimate.lines.map((line: CostLine) => (
          <li key={line.id} className="flex justify-between gap-4 text-sm">
            <span className="text-body">
              {line.label}
              {/*
                The same treatment a deadline gets when its date came out of
                prose. A band nobody set must not read as one somebody did.
              */}
              {line.basis ? (
                <span className="text-muted"> · from the map</span>
              ) : (
                line.inferred && <span className="text-muted"> · guessed</span>
              )}
              <span className="block text-xs text-muted">{line.detail}</span>
            </span>
            <span className="text-ink tabular-nums whitespace-nowrap">{formatCostRange(line.amount)}</span>
          </li>
        ))}
        {estimate.lines.length > 0 && (
          <li className="flex justify-between gap-4 border-t border-line pt-2 text-sm font-semibold text-ink">
            <span>Estimated total cost</span>
            <span className="tabular-nums whitespace-nowrap">{formatCostRange(estimate.gross)}</span>
          </li>
        )}
      </ul>

      {/* What they pay, so the two sides can be read against each other. */}
      <ul className="mt-3 space-y-2">
        {estimate.payLines.map((pay: PayLine) => (
          <li key={pay.id} className="flex justify-between gap-4 text-sm">
            <span className="text-body">
              {pay.label}
              <span className="block text-xs text-muted">{pay.detail}</span>
            </span>
            <span className="text-success-fg tabular-nums whitespace-nowrap">{formatCostRange(pay.amount)}</span>
          </li>
        ))}
        <li
          className={`flex justify-between gap-4 text-sm ${
            estimate.payLines.length > 0 ? 'border-t border-line pt-2 font-semibold text-ink' : 'text-body'
          }`}
        >
          <span>{estimate.payLines.length > 0 ? 'Estimated pay' : 'Pay'}</span>
          <span className="tabular-nums whitespace-nowrap">
            {estimate.payLines.length > 0
              ? formatCostRange(estimate.income)
              : outlook?.payKnown
                ? 'None'
                : 'Not recorded'}
          </span>
        </li>
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

      {/*
        The credit OpenStreetMap's licence asks for, wherever a figure derived
        from it is shown — and the one caveat about how it was derived.
      */}
      {mapBasis && (
        <p className="mt-2 text-xs text-muted">
          {mapBasis === 'straight_line' ? 'No road route was found, so the distance is a straight line, adjusted. ' : ''}
          Distance from{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
            © OpenStreetMap contributors
          </a>
          .
        </p>
      )}
      {whyGuessed && <p className="mt-2 text-xs text-muted">{whyGuessed}</p>}

      {estimate.unknowns.length > 0 && (
        <div className="mt-3">
          <Caption className="mb-1">Not counted</Caption>
          <ul className="space-y-0.5">
            {estimate.unknowns.map((u) => (
              <li key={u} className="text-xs text-muted">
                {u}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
