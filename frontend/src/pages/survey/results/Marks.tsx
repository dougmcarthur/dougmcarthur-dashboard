import type { ReactNode } from 'react'
import { Card } from '../../../components/ui/Surface'

/**
 * The pieces every chart on the results page is made of, so each chart is the
 * data and its geometry and nothing else.
 *
 * Everything is drawn from the app's colour tokens and nothing else, which is
 * what makes the page follow the theme without a `dark:` anywhere. The
 * vocabulary is the one the data-visualization notes ask for: one accent against
 * a quiet gray for emphasis, thin marks with a 4px rounded end, hairline grids,
 * the number printed where the reader's eye already is, and a table twin
 * under every chart so nothing is ever only in a tooltip.
 */

/**
 * A tooltip that shows on hover and on keyboard focus, from the row that owns
 * it. It enhances: every figure it carries is printed on the row or in the
 * table twin, and the row's `aria-label` says the same thing, so a screen
 * reader is not asked to find a popover.
 */
export function Tip({ children }: { children: ReactNode }) {
  return (
    <span
      role="tooltip"
      aria-hidden="true"
      className="pointer-events-none absolute left-0 bottom-full z-20 mb-1 hidden w-max max-w-[17rem] rounded-md border border-line-strong bg-raised px-2.5 py-1.5 text-xs text-body shadow-raised group-hover:block group-focus-visible:block"
    >
      {children}
    </span>
  )
}

/** The key to a chart: a short row of swatch and words, wrapped. */
export function Legend({ items }: { items: Array<{ swatch: ReactNode; label: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted" aria-label="Key">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span aria-hidden="true" className="flex w-5 shrink-0 justify-center">
            {i.swatch}
          </span>
          {i.label}
        </li>
      ))}
    </ul>
  )
}

/** A bar's swatch, in the three treatments the ranking uses. */
export function BarSwatch({ kind }: { kind: 'above' | 'about' | 'below' | 'range' }) {
  const style =
    kind === 'above'
      ? 'bg-accent'
      : kind === 'about'
        ? 'bg-faint'
        : kind === 'below'
          ? 'border-2 border-faint'
          : 'bg-line-strong/60 h-3'
  return <span className={`block h-2.5 w-5 rounded-[3px] ${style}`} />
}

/** A dot's swatch: filled in a tone, or a ring when the range includes zero. */
export function DotSwatch({ tone, hollow = false }: { tone: 'accent' | 'faint'; hollow?: boolean }) {
  const ring = tone === 'accent' ? 'border-accent' : 'border-faint'
  const fill = hollow ? 'bg-surface' : tone === 'accent' ? 'bg-accent' : 'bg-faint'
  return <span className={`block h-3 w-3 rounded-full border-2 ${ring} ${fill}`} />
}

/**
 * A section of the page. The headline is a finding, not a topic: "What artists
 * weigh" tells a reader nothing and "Artists put a proper set ahead of
 * everything else" tells them the answer before they have read the chart. So
 * there is no label above it saying what the topic is; the sentence says.
 */
export function Section({
  id,
  title,
  lede,
  children,
}: {
  id: string
  title: string
  lede?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="scroll-mt-6">
      <h2 id={`${id}-title`} className="text-2xl sm:text-3xl font-semibold text-ink tracking-tight text-balance">
        {title}
      </h2>
      {lede && <div className="mt-2.5 max-w-2xl text-sm sm:text-base text-body leading-relaxed">{lede}</div>}
      <div className="mt-6">{children}</div>
    </section>
  )
}

/**
 * One sentence that opens with a figure. The figure is set large, in proportional
 * figures, and the sentence carries on after it in the body size, so the card
 * reads as a sentence and not as a number with a caption.
 */
export function Figure({ figure, rest, hero = false }: { figure: string; rest: string; hero?: boolean }) {
  return (
    <Card pad="md">
      <p className="text-base leading-snug text-body">
        <span className={`${hero ? 'text-5xl sm:text-6xl' : 'text-4xl sm:text-5xl'} mr-1 font-semibold leading-none tracking-tight text-ink`}>{figure}</span>{' '}
        {rest}
      </p>
    </Card>
  )
}

/**
 * The same numbers as the chart above it, as a table. Closed until asked for,
 * because most readers want the picture, and always there because a chart no
 * one can read as numbers is a chart some people cannot read.
 */
export function TableTwin({
  caption,
  head,
  rows,
  align = [],
}: {
  caption: string
  head: string[]
  rows: ReactNode[][]
  /** Columns to right-align, by index. Numbers line up in a column. */
  align?: number[]
}) {
  return (
    <details className="group mt-5">
      <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink focus-visible:text-ink">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
          ›
        </span>
        See every number
      </summary>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-sunken text-left text-muted">
              {head.map((h, i) => (
                <th key={h} scope="col" className={`px-3 py-2 font-medium ${align.includes(i) ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-b border-line last:border-b-0 align-top">
                {row.map((cell, i) => (
                  <td key={i} className={`px-3 py-2 text-body ${align.includes(i) ? 'text-right tabular-nums' : ''}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
