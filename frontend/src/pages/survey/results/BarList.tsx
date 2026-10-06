import type { PublicBar } from '../../../../../shared/surveyPublic'
import { pct } from './format'

/**
 * Shares of the artists who answered, as a list of thin bars.
 *
 * One series, so one colour, and the accent goes to the leaders and nowhere
 * else: the eye should land on the top of each list and stay quiet over the
 * rest. The label sits above its bar rather than beside it, because the
 * answers are sentences ("I missed the deadline, or heard about it too late")
 * and a label column wide enough to hold them leaves no room for a bar on a
 * phone. The number is printed at the end of every bar in a column of its own,
 * where the eye already is, and a group too small to show says so in words
 * rather than drawing a bar for a number nobody is allowed to see.
 */
export function BarList({ bars, lead = 1, label }: { bars: PublicBar[]; lead?: number; label: string }) {
  const sized = bars.filter((b) => !b.kind && b.share !== null)
  const leaders = new Set([...sized].sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).slice(0, lead).map((b) => b.id))
  const widest = Math.max(...bars.map((b) => b.share ?? 0), 0.01)

  return (
    <ul className="space-y-3.5" aria-label={label}>
      {bars.map((b) => {
        const leading = leaders.has(b.id)
        return (
          <li key={b.id}>
            <p className={`text-sm leading-snug ${leading ? 'font-medium text-ink' : 'text-body'}`}>{b.label}</p>
            {b.share === null ? (
              <p className="mt-0.5 text-xs italic text-faint">Fewer than 10 artists chose this, so it is not shown.</p>
            ) : (
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-2.5 flex-1 border-l border-line-strong" aria-hidden="true">
                  <div
                    className={`h-full rounded-r ${leading ? 'bg-accent' : 'bg-faint'}`}
                    style={{ width: `${(b.share / widest) * 100}%`, minWidth: 4 }}
                  />
                </div>
                <span className={`w-11 shrink-0 text-right text-xs tabular-nums ${leading ? 'font-semibold text-ink' : 'text-body'}`}>{pct(b.share)}</span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
