/**
 * The sentence on a decision card, and the buttons under it.
 *
 * This is the feature, not the card styling. A card works when you can decide
 * from it without opening anything, which means the sentence has to name the
 * actual decision — not restate the flag. "Deadline passed" is a label;
 * "the deadline passed 33 days ago and it was never submitted, so nothing more
 * can be done this cycle" is a decision.
 *
 * It lives in `shared/` and is attached to every queue item, so the Overview
 * deck, the Review screen and (later) the email digest all say the same thing
 * about the same item rather than each inventing its own phrasing.
 *
 * Buttons are named for the outcome. "Approve the spend" and "Not sent —
 * reopen" say what happens; OK/Cancel make you reconstruct it.
 */

import type { ReviewItem, FlagId } from './reviewQueue'

/** Everything the copy needs — an item before its own sentence is attached. */
export type DecisionInput = Omit<ReviewItem, 'decision'>

export type DecisionIntent =
  | 'confirm_sent'
  | 'reopen'
  | 'approve'
  | 'pass'
  | 'archive'
  | 'publish'

export interface DecisionAction {
  label: string
  intent: DecisionIntent
  /** `go` is the affirmative outcome, `no` the negative one. */
  tone: 'go' | 'no'
}

export interface Decision {
  /** One sentence naming the decision. Never empty. */
  rationale: string
  /** Exactly two: the affirmative outcome and the negative one. */
  actions: [DecisionAction, DecisionAction]
}

/** Flags that can drive the copy, most decisive first. */
const PRECEDENCE: FlagId[] = [
  'conflict',
  'overdue',
  'paid',
  'issue',
  'due_soon',
  'blocked',
  'not_submitted',
]

/** Trims a note fragment down to something that fits in a sentence. */
function condense(text: string, max = 130): string {
  const cleaned = text
    .replace(/^(?:⚠️|❗|🚨|\*+)\s*/u, '')
    .replace(/^(?:IMPORTANT|WARNING|NOTE|ACTION)\b\s*[:!—-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, max).replace(/[\s,;—-]+\S*$/, '') + '…'
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "Contact Phone" + "Mailing Address" → "your contact phone and mailing address" */
function listFields(labels: string[]): string {
  const named = labels.map((l) => l.toLowerCase())
  const joined =
    named.length <= 1
      ? named[0]
      : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`
  return `your ${joined}`
}

const GIG_ACTIONS: Record<string, [DecisionAction, DecisionAction]> = {
  sent_check: [
    { label: 'It went out', intent: 'confirm_sent', tone: 'go' },
    { label: 'Not sent — reopen', intent: 'reopen', tone: 'no' },
  ],
  spend: [
    { label: 'Approve the spend', intent: 'approve', tone: 'go' },
    { label: 'Pass', intent: 'pass', tone: 'no' },
  ],
  close_out: [
    { label: 'Keep for next cycle', intent: 'approve', tone: 'go' },
    { label: 'Archive', intent: 'archive', tone: 'no' },
  ],
  go_no: [
    { label: 'Approve', intent: 'approve', tone: 'go' },
    { label: 'Pass', intent: 'pass', tone: 'no' },
  ],
}

const PROMO_ACTIONS: [DecisionAction, DecisionAction] = [
  { label: 'Approve', intent: 'approve', tone: 'go' },
  { label: 'Mark published', intent: 'publish', tone: 'go' },
]

const SYNC_SENT_CHECK: [DecisionAction, DecisionAction] = [
  { label: 'It went out', intent: 'confirm_sent', tone: 'go' },
  { label: 'Not sent — reopen', intent: 'reopen', tone: 'no' },
]

const SYNC_PICK: [DecisionAction, DecisionAction] = [
  { label: 'Send this one', intent: 'confirm_sent', tone: 'go' },
  { label: 'Drop it', intent: 'pass', tone: 'no' },
]

/** Builds the sentence and buttons for one queue item. */
export function decisionFor(item: DecisionInput): Decision {
  const { parsed, fee, deadline, kind, status } = item
  const has = (id: FlagId) => item.flags.some((f) => f.id === id)
  const dominant = PRECEDENCE.find(has)

  const blocker = parsed.blockers[0] ?? parsed.draftedFields.find((f) => f.needsDoug)?.value
  const dangerAlert = parsed.alerts.find((a) => a.severity === 'danger')

  // Drafted fields waiting on a person carry placeholder text like "needs Doug,
  // not on file" — the label is the useful half, the value just repeats itself.
  const missingFields = parsed.draftedFields
    .filter((f) => f.needsDoug && f.label)
    .map((f) => f.label)

  if (kind === 'promo') {
    return {
      rationale:
        status === 'draft'
          ? 'A drafted post that has not been approved yet. Read it and decide whether it goes out as written.'
          : 'Approved copy that has not been marked published. Confirm once it is out.',
      actions: PROMO_ACTIONS,
    }
  }

  switch (dominant) {
    case 'conflict': {
      const extra = missingFields.length
        ? ` It still needs ${listFields(missingFields)}.`
        : blocker
        ? ` ${upperFirst(condense(blocker, 90))}`
        : ''
      return {
        rationale:
          `Marked ${status.replace(/_/g, ' ')} in the tracker, but the note says it was never ` +
          `actually sent.${extra} Did this go out?`,
        actions: kind === 'sync' ? SYNC_SENT_CHECK : GIG_ACTIONS.sent_check,
      }
    }

    case 'overdue': {
      const days = Math.abs(deadline.daysUntil ?? 0)
      return {
        rationale:
          `The deadline passed ${days} ${days === 1 ? 'day' : 'days'} ago and it was never ` +
          `submitted. Nothing more can happen this cycle — keep it for the next one or archive it.`,
        actions: GIG_ACTIONS.close_out,
      }
    }

    case 'paid': {
      const cost = fee.amount != null ? `${fee.currency} ${fee.amount.toLocaleString()}` : 'money'
      return {
        rationale:
          `Costs ${cost} to enter, so nobody can submit it without your say-so. ` +
          `Approving here is approving the spend.`,
        actions: GIG_ACTIONS.spend,
      }
    }

    case 'issue': {
      const detail = dangerAlert
        ? upperFirst(condense(dangerAlert.text))
        : 'Something about this needs a look.'
      const isDuplicate = /already exists|duplicate|two independent/i.test(detail)
      return {
        rationale: isDuplicate ? `${detail} Pick one to send.` : detail,
        actions: isDuplicate && kind === 'sync' ? SYNC_PICK : GIG_ACTIONS.go_no,
      }
    }

    case 'due_soon': {
      const days = deadline.daysUntil ?? 0
      return {
        rationale:
          days === 0
            ? 'The deadline is today and nothing has been submitted yet.'
            : `Due in ${days} ${days === 1 ? 'day' : 'days'} and nothing has been submitted yet.`,
        actions: GIG_ACTIONS.go_no,
      }
    }

    case 'blocked': {
      return {
        rationale: missingFields.length
          ? `Waiting on you for ${listFields(missingFields)}.`
          : blocker
          ? `Waiting on you: ${lowerFirst(condense(blocker))}`
          : 'This is waiting on something only you can supply.',
        actions: GIG_ACTIONS.go_no,
      }
    }

    case 'not_submitted': {
      const how = parsed.submissionMethod ? ` It goes out by ${parsed.submissionMethod}.` : ''
      return {
        rationale: `Drafted but never sent.${how} Decide whether it is worth doing.`,
        actions: GIG_ACTIONS.go_no,
      }
    }

    default: {
      // No flag is driving this one, so describe it and ask the plain question.
      // Sync targets are described rather than named — their subtitle is often
      // an email address, which reads badly mid-sentence.
      if (kind === 'sync') {
        return {
          rationale: 'A sync target with nothing outstanding on it. Worth pitching, or let it go?',
          actions: GIG_ACTIONS.go_no,
        }
      }
      const what = item.subtitle ? lowerFirst(condense(item.subtitle, 60)) : 'opportunity'
      const where = parsed.location ? ` in ${parsed.location}` : ''
      return {
        rationale: `A ${what}${where} with no deadline forcing the issue. Worth doing, or not?`,
        actions: GIG_ACTIONS.go_no,
      }
    }
  }
}
