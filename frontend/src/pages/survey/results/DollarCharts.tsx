import { VALUE_GROUPS, type PublicRatio, type PublicValue, type ValueGroup } from '../../../../../shared/surveyPublic'
import { Card } from '../../../components/ui/Surface'
import { axisDollars, dollars, niceStep, ticksBetween } from './format'
import { DotSwatch, Legend, TableTwin, Tip } from './Marks'

/**
 * What it is worth, in dollars of pay.
 *
 * Because pay was one of the things that changed between the made-up
 * opportunities, everything else can be priced against it: an audience of
 * 10,000 rather than 100 is worth about this much pay. The forest plot shows
 * each price as a dot with the range it probably sits in; a dot that is filled
 * is clear of zero and a ring is not, so a number the data cannot stand behind
 * does not look like one it can.
 */

const GROUPS: ValueGroup[] = ['audience', 'industry', 'effort']
const STEPS = [50, 100, 200, 250, 500, 1000, 2000]

export function ForestPlot({ values }: { values: PublicValue[] }) {
  const lowest = Math.min(0, ...values.map((v) => v.lo))
  const highest = Math.max(0, ...values.map((v) => v.hi))
  const step = niceStep((highest - lowest) / 5, STEPS)
  const min = Math.floor(lowest / step) * step
  const max = Math.ceil(highest / step) * step
  const at = (v: number) => ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * 100
  const ticks = ticksBetween(min, max, step)
  const columns = 'grid grid-cols-[6.5rem_minmax(0,1fr)_4.75rem] sm:grid-cols-[9.5rem_minmax(0,1fr)_5.5rem] items-center gap-x-3'

  return (
    <div>
      <Legend
        items={[
          { swatch: <DotSwatch tone="accent" />, label: 'Worth something to artists' },
          { swatch: <DotSwatch tone="faint" />, label: 'Costs artists something' },
          { swatch: <DotSwatch tone="accent" hollow />, label: 'Range includes zero: cannot say' },
        ]}
      />

      <div className="mt-2">
        {GROUPS.map((g) => {
          const rows = values.filter((v) => v.group === g)
          if (rows.length === 0) return null
          return (
            <div key={g} role="group" aria-label={VALUE_GROUPS[g].title}>
              <p className="pt-4 pb-1 text-xs font-semibold text-ink">
                {VALUE_GROUPS[g].title} <span className="font-normal text-muted">{VALUE_GROUPS[g].baseline}</span>
              </p>
              {rows.map((v) => {
                const tone = v.value >= 0 ? 'accent' : 'faint'
                return (
                  <div
                    key={v.key}
                    tabIndex={0}
                    aria-label={`${v.phrase}: about ${dollars(v.value)} of pay, probably between ${dollars(v.lo)} and ${dollars(v.hi)}${v.clear ? '' : ', which includes zero'}.`}
                    className={`group relative ${columns} h-10 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent`}
                  >
                    <span className="text-sm text-body leading-tight">{v.label}</span>
                    <div className="relative h-full" aria-hidden="true">
                      {ticks.map((t) => (
                        <span key={t} className={`absolute inset-y-0 w-px ${t === 0 ? 'bg-line-strong' : 'bg-line'}`} style={{ left: `${at(t)}%` }} />
                      ))}
                      <span className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-faint" style={{ left: `${at(v.lo)}%`, width: `${at(v.hi) - at(v.lo)}%` }} />
                      <span
                        className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${
                          v.clear ? (tone === 'accent' ? 'bg-accent' : 'bg-faint') : `border-2 bg-surface ${tone === 'accent' ? 'border-accent' : 'border-faint'}`
                        }`}
                        style={{ left: `${at(v.value)}%` }}
                      />
                    </div>
                    <span className={`text-right text-sm tabular-nums ${v.clear ? 'font-medium text-ink' : 'text-muted'}`}>{dollars(v.value)}</span>
                    <Tip>
                      <strong className="font-semibold text-ink">{v.label}</strong> {VALUE_GROUPS[v.group].baseline}
                      <br />
                      About {dollars(v.value)} of pay
                      <br />
                      Probably between {dollars(v.lo)} and {dollars(v.hi)}
                      {!v.clear && (
                        <>
                          <br />
                          The range includes zero, so this cannot be called either way
                        </>
                      )}
                    </Tip>
                  </div>
                )
              })}
            </div>
          )
        })}

        <div className={`${columns} mt-1`} aria-hidden="true">
          <span />
          <div className="relative h-4 text-[11px] text-faint tabular-nums">
            {ticks.map((t) => (
              // The plot is about a hundred pixels wide on a phone, so only every other tick is named there (zero always is).
              <span key={t} className={`absolute -translate-x-1/2 ${Math.round(t / step) % 2 === 0 ? '' : 'hidden sm:inline'}`} style={{ left: `${at(t)}%` }}>
                {axisDollars(t)}
              </span>
            ))}
          </div>
          <span />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">The scale is dollars of pay. A dot to the right of zero is worth having, and a dot to the left is a cost.</p>

      <TableTwin
        caption="Every trade-off in dollars of pay, with its range"
        head={['Compared with', 'It is', 'Dollars of pay', 'Range', 'Clear of zero']}
        align={[2, 3]}
        rows={values.map((v) => [VALUE_GROUPS[v.group].title, `${v.label}`, dollars(v.value), `${dollars(v.lo)} to ${dollars(v.hi)}`, v.clear ? 'Yes' : 'No'])}
      />
    </div>
  )
}

/**
 * A dollar of cost, in dollars of pay. One tile each for the entry fee and for
 * travel, with a line at "a dollar is a dollar" so the number means something
 * the moment it is seen. A range too wide to call is shown as exactly that:
 * the page will not say a fee weighs "about a dollar" because the data could not
 * tell it from three.
 */
export function RatioTile({ ratio, noun }: { ratio: PublicRatio; noun: string }) {
  const lo = Math.max(0, ratio.lo)
  const hi = Math.min(4, ratio.hi)
  const top = Math.max(2, Math.ceil(Math.max(hi, ratio.value) * 2) / 2)
  const at = (v: number) => (Math.max(0, Math.min(top, v)) / top) * 100
  const clear = ratio.verdict !== 'unclear'
  const money = (v: number) => `$${v.toFixed(2)}`

  const sentence =
    ratio.verdict === 'more'
      ? `Every dollar of ${noun} feels like ${money(ratio.value)} of lost pay, so it costs artists more than its face value.`
      : ratio.verdict === 'less'
        ? `A dollar of ${noun} feels like less than a dollar of pay (${money(ratio.value)}).`
        : ratio.verdict === 'same'
          ? `A dollar of ${noun} feels like about a dollar of pay.`
          : `The best guess is ${money(ratio.value)}, but the range runs from ${money(lo)} to ${money(ratio.hi)}. That is too wide to say whether it weighs more or less than a dollar of pay.`

  return (
    <Card pad="md" className="space-y-3">
      <p className="text-sm font-medium text-ink">A dollar of {noun}</p>
      {clear ? (
        <p className="text-4xl sm:text-5xl font-semibold leading-none tracking-tight text-ink">{money(ratio.value)}</p>
      ) : (
        <p className="text-2xl font-semibold leading-tight tracking-tight text-ink">We cannot say yet.</p>
      )}
      <p className="text-sm leading-snug text-body">{sentence}</p>

      <div className="pt-1" role="img" aria-label={`A dollar of ${noun} weighs about ${money(ratio.value)} of pay, probably between ${money(lo)} and ${money(ratio.hi)}. A dollar of pay is the reference.`}>
        <div className="relative h-6">
          <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sunken" />
          <span className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line-strong" style={{ left: `${at(lo)}%`, width: `${at(hi) - at(lo)}%` }} />
          <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${at(1)}%` }} />
          <span
            className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${clear ? 'bg-accent' : 'border-2 border-accent bg-surface'}`}
            style={{ left: `${at(ratio.value)}%` }}
          />
        </div>
        <div className="relative mt-1 h-4 text-[11px] tabular-nums text-faint" aria-hidden="true">
          <span className="absolute left-0">$0</span>
          <span className="absolute -translate-x-1/2 whitespace-nowrap text-muted" style={{ left: `${at(1)}%` }}>
            a dollar is a dollar
          </span>
          <span className="absolute right-0">${top}</span>
        </div>
      </div>
    </Card>
  )
}
