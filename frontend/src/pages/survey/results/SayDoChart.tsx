import { notableMove, numberWord, type SayDoResult } from '../../../../../shared/surveyPublic'
import { pct } from './format'
import { TableTwin } from './Marks'

/**
 * What artists said matters, against what stopped them.
 *
 * Two columns of the same things in two orders, and a line from each to where it
 * went. Left is the ranking: asked what matters, which comes first. Right is
 * what they did: the reason they gave for the last opportunity they passed on.
 * A flat line is an artist who does what they say. A steep one is a thing that
 * matters more, or less, in a decision than it does in a conversation, and that
 * is the finding the page leads with when there is one: the lines that climb or
 * fall by a third of the list or more are drawn in the accent and the rest are
 * left quiet, so the eye goes to the disagreement.
 *
 * Both lists are ranked among the same items. A reason given by fewer than ten
 * artists may not be shown, so it is not in the chart at all rather than drawn
 * as a zero, and the page says how many were left out.
 *
 * The lines are an SVG as wide as the gap between the columns, with no viewBox,
 * so a stroke is the same width on a phone and a desktop and nothing is
 * stretched. Rows have a fixed height so the line ends meet the labels.
 */

const ROW = 54

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function SayDoChart({ data }: { data: SayDoResult }) {
  const n = data.rows.length
  const threshold = notableMove(n)
  const bySay = [...data.rows].sort((a, b) => a.say - b.say)
  const byDoing = [...data.rows].sort((a, b) => a.doing - b.doing)
  const y = (rank: number) => (rank - 0.5) * ROW
  const moved = (r: { say: number; doing: number }) => Math.abs(r.say - r.doing) >= threshold
  const columns = 'grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_11rem_minmax(0,1fr)] gap-x-2'

  return (
    <div>
      <div className={`${columns} items-end pb-3`}>
        <p className="text-right text-sm font-medium text-ink">What artists said matters</p>
        <span />
        <p className="text-sm font-medium text-ink">What actually stopped them</p>
      </div>

      <div className={columns}>
        <ol className="m-0 list-none p-0" aria-label="In the order artists said they matter">
          {bySay.map((r) => (
            <li key={r.id} style={{ height: ROW }} className="flex items-center justify-end gap-2.5 text-right">
              <span className={`text-[13px] leading-tight ${moved(r) ? 'font-semibold text-ink' : 'text-body'}`}>{r.label}</span>
              <span className="w-4 shrink-0 text-xs tabular-nums text-faint">{r.say}</span>
            </li>
          ))}
        </ol>

        <svg aria-hidden="true" width="100%" height={n * ROW} className="overflow-visible">
          {[...data.rows]
            .sort((a, b) => Number(moved(a)) - Number(moved(b)))
            .map((r) => (
              <g key={r.id}>
                <line
                  x1="0"
                  x2="100%"
                  y1={y(r.say)}
                  y2={y(r.doing)}
                  strokeLinecap="round"
                  strokeWidth={moved(r) ? 2.5 : 1.5}
                  className={moved(r) ? 'stroke-accent' : 'stroke-line-strong'}
                />
                <circle cx="0" cy={y(r.say)} r={moved(r) ? 4.5 : 3.5} className={moved(r) ? 'fill-accent' : 'fill-faint'} />
                <circle cx="100%" cy={y(r.doing)} r={moved(r) ? 4.5 : 3.5} className={moved(r) ? 'fill-accent' : 'fill-faint'} />
              </g>
            ))}
        </svg>

        <ol className="m-0 list-none p-0" aria-label="In the order of the reasons artists gave for passing">
          {byDoing.map((r) => (
            <li key={r.id} style={{ height: ROW }} className="flex items-center gap-2.5">
              <span className="w-4 shrink-0 text-xs tabular-nums text-faint">{r.doing}</span>
              <span className={`text-[13px] leading-tight ${moved(r) ? 'font-semibold text-ink' : 'text-body'}`}>
                {r.label} <span className="font-normal text-muted">{pct(r.share)}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <p className="mt-4 text-xs text-muted">
        A line that climbs or falls by {numberWord(threshold)} places or more is highlighted.
        {data.hidden > 0 &&
          ` ${upperFirst(numberWord(data.hidden))} other ${data.hidden === 1 ? 'reason was' : 'reasons were'} given by fewer than ten artists, so ${data.hidden === 1 ? 'it is' : 'they are'} left out.`}
      </p>

      <TableTwin
        caption="Each factor's place when artists were asked what matters, and as a reason they passed"
        head={['What it is', 'Place when asked', 'Place as a reason to pass', 'Share who passed for it']}
        align={[1, 2, 3]}
        rows={bySay.map((r) => [r.label, `${r.say} of ${n}`, `${r.doing} of ${n}`, pct(r.share)])}
      />
    </div>
  )
}
