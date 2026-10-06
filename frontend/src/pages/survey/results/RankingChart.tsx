import type { PublicFactor } from '../../../../../shared/surveyPublic'
import { niceStep, points, ticksBetween } from './format'
import { BarSwatch, Legend, TableTwin, Tip } from './Marks'

/**
 * What matters most: thirteen bars either side of a middle line.
 *
 * Each artist picked, from groups of four, the one that mattered most and the
 * one that mattered least. A bar is how often a thing was picked most minus how
 * often it was picked least, so zero is "no more important than average" and the
 * direction a bar points is its meaning. Colour is a second channel that says
 * how sure the page is: solid green when the whole range sits clear of zero,
 * gray when it cannot be told from zero, and an outline for clearly below.
 *
 * The shaded band behind a bar is the range the true value probably sits in.
 * Two bars whose bands overlap are, as far as these answers go, tied, and the
 * eye can see it without a statistics course.
 *
 * Only the ends of the list are labelled with a number: the leaders and the
 * trailers are what the reader will repeat, and a number on every row makes the
 * chart a table.
 *
 * On a wide screen the label sits in a column beside the plot, so the chart is
 * one row per factor. On a phone it sits above its bar, because the column that
 * would hold a label leaves no room for the plot.
 */

const DOMAINS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1]
const LABELLED = { top: 3, bottom: 2 }
/** Label column, plot, number: the same on every row and on the axis, so they line up. */
const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 sm:grid-cols-[13.5rem_minmax(0,1fr)_2.75rem] sm:items-center'

export function RankingChart({ rows }: { rows: PublicFactor[] }) {
  const widest = Math.max(...rows.flatMap((r) => [Math.abs(r.lo), Math.abs(r.hi)]), 0.05)
  const domain = niceStep(widest, DOMAINS)
  const at = (v: number) => 50 + (Math.max(-domain, Math.min(domain, v)) / domain) * 50
  const ticks = ticksBetween(-domain, domain, domain / 2)
  const named = new Set([...rows.slice(0, LABELLED.top), ...rows.slice(-LABELLED.bottom)].map((r) => r.id))

  return (
    <div>
      <Legend
        items={[
          { swatch: <BarSwatch kind="above" />, label: 'Clearly more important than average' },
          { swatch: <BarSwatch kind="about" />, label: 'Cannot be told from average' },
          { swatch: <BarSwatch kind="below" />, label: 'Clearly less important' },
          { swatch: <BarSwatch kind="range" />, label: 'Range it probably sits in' },
        ]}
      />

      <ol className="mt-4" aria-label="Ranked from most to least important">
        {rows.map((r) => {
          const left = r.score >= 0 ? 50 : at(r.score)
          const width = Math.max(Math.abs(at(r.score) - 50), 0.6)
          // The outline is filled with the card's own colour, so the range band behind does not show through it.
          const fill = r.band === 'above' ? 'bg-accent' : r.band === 'about' ? 'bg-faint' : 'border-2 border-faint bg-surface'
          return (
            <li
              key={r.id}
              tabIndex={0}
              aria-label={`${r.rank}. ${r.label}: ${points(r.score)} points, probably between ${points(r.lo)} and ${points(r.hi)}.`}
              className={`group relative ${GRID} rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent`}
            >
              <span className={`pt-2.5 text-sm leading-snug sm:pt-0 ${named.has(r.id) ? 'font-medium text-ink' : 'text-body'}`}>{r.label}</span>
              <span className="pt-2.5 text-right text-xs tabular-nums text-muted sm:col-start-3 sm:row-start-1 sm:pt-0">
                {named.has(r.id) ? points(r.score) : ''}
              </span>
              <div className="relative col-span-2 mt-1 h-6 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:mt-0 sm:h-9" aria-hidden="true">
                {ticks.map((t) => (
                  <span key={t} className={`absolute inset-y-0 w-px ${t === 0 ? 'bg-line-strong' : 'bg-line'}`} style={{ left: `${at(t)}%` }} />
                ))}
                <span
                  className="absolute top-1/2 h-4 -translate-y-1/2 rounded-sm bg-line-strong/60"
                  style={{ left: `${at(r.lo)}%`, width: `${Math.max(at(r.hi) - at(r.lo), 0.6)}%` }}
                />
                <span
                  className={`absolute top-1/2 h-3 -translate-y-1/2 ${r.score >= 0 ? 'rounded-r' : 'rounded-l'} ${fill}`}
                  style={{ left: `${left}%`, width: `${width}%`, minWidth: 4 }}
                />
              </div>
              <Tip>
                <strong className="font-semibold text-ink">{r.label}</strong>
                <br />
                Ranks {r.rank} of {rows.length}: {points(r.score)} points
                <br />
                Probably between {points(r.lo)} and {points(r.hi)}
                <br />
                Shown to {r.artists} artists
              </Tip>
            </li>
          )
        })}
      </ol>

      <div className={`mt-1 ${GRID}`} aria-hidden="true">
        <span className="hidden sm:block" />
        <div className="relative col-span-2 h-5 text-[11px] tabular-nums text-faint sm:col-span-1">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${at(t)}%` }}>
              {points(t)}
            </span>
          ))}
        </div>
      </div>
      <div className={`mt-1 text-xs text-muted ${GRID}`}>
        <span className="hidden sm:block" />
        <div className="col-span-2 flex justify-between gap-4 sm:col-span-1">
          <span>← Named least important more often</span>
          <span className="text-right">Named most important more often →</span>
        </div>
      </div>

      <TableTwin
        caption="Every factor, with its score, range and how many artists were shown it"
        head={['Rank', 'What artists were asked about', 'Score', 'Range', 'Artists shown it']}
        align={[0, 2, 3, 4]}
        rows={rows.map((r) => [r.rank, r.text, points(r.score), `${points(r.lo)} to ${points(r.hi)}`, r.artists])}
      />
    </div>
  )
}
