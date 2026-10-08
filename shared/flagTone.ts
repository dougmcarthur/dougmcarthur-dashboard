import type { AlertSeverity } from './reviewParse'
import type { FlagId, ReviewFlag } from './reviewQueue'

/**
 * What colour a flag is, which is a different question from how urgent it is.
 *
 * `severity` is graded urgency and it escalates: a deadline is `warn` at two
 * weeks and `danger` inside three days, a silent application likewise at
 * ninety. That ordering is right for ranking a queue and wrong for painting
 * one, because the palette gives hue a meaning of its own: ochre is waiting or
 * due soon, clay is broken. A reply owed is waiting, however pressing, and
 * painting it clay made a quiet queue look like an outage.
 *
 * So the four flags that mean somebody's move, or the clock's, are `waiting`
 * whatever their severity, and urgency still shows where it always did: in the
 * order of the queue and in the words of the label ("Due in 2d"). Everything
 * else keeps its severity, and a deadline that has *passed* is not in the list
 * on purpose. That one is broken.
 */
const WAITING: ReadonlySet<FlagId> = new Set<FlagId>(['reply_due', 'no_reply', 'due_soon', 'blocked'])

export type FlagTone = AlertSeverity | 'waiting'

export function flagTone(flag: Pick<ReviewFlag, 'id' | 'severity'>): FlagTone {
  return WAITING.has(flag.id) ? 'waiting' : flag.severity
}
