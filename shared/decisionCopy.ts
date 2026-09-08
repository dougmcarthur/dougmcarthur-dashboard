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

import type { ReviewItem, ReviewKind, FlagId } from './reviewQueue'
import {
  type GigStatus,
  normaliseGigStatus,
  nextGigStatuses,
  gigStatusMeta,
} from './gigStatus'

/** Everything the copy needs — an item before its own sentence is attached. */
export type DecisionInput = Omit<ReviewItem, 'decision'>

export type DecisionIntent =
  | 'confirm_sent'
  | 'reopen'
  | 'approve'
  | 'pass'
  | 'archive'
  | 'publish'
  // Phase 4 and the ways out of it. These exist because the card used to offer
  // moves the pipeline refuses: an overdue shortlisted gig was offered
  // "Archive", which `nextGigStatuses` does not allow, so the one button on
  // the card that named the obvious outcome returned a 400.
  | 'expire'
  | 'withdraw'
  | 'book'
  | 'prepare'

export interface DecisionAction {
  label: string
  intent: DecisionIntent
  /** `go` is the affirmative outcome, `no` the negative one. */
  tone: 'go' | 'no'
}

export interface Decision {
  /** One sentence naming the decision. Never empty. */
  rationale: string
  /**
   * The affirmative outcome and the negative one — two, normally.
   *
   * One where the pipeline offers only one legal move, and none where it
   * offers none at all (an archived row has nowhere to go). Never a button
   * whose move `isGigTransitionAllowed` would refuse: a card that offers a
   * decision the API rejects is worse than a card that offers nothing, because
   * it looks like it worked.
   */
  actions: DecisionAction[]
}

/** Flags that can drive the copy, most decisive first. */
const PRECEDENCE: FlagId[] = [
  'conflict',
  // Second, because it is the only flag that can say the opportunity is not
  // possible rather than not yet done. Every sentence below this one assumes
  // the date is reachable.
  'visa_risk',
  'reply_due',
  // Ahead of `overdue`, which is not a mistake. A deadline in the past on a
  // row you already submitted is expected and says nothing; the overdue copy
  // would tell you it "was never submitted", which for these rows is false.
  'no_reply',
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

/**
 * What an intent means as a status.
 *
 * This lived in the Overview deck, in the browser, with no knowledge of
 * `nextGigStatuses` — which is how the deck came to deal cards whose only
 * buttons the API refuses. Resolving the intent here means the copy and the
 * legality check read the same table.
 */
export const GIG_STATUS_BY_INTENT: Record<DecisionIntent, GigStatus> = {
  confirm_sent: 'submitted',
  reopen: 'shortlisted',
  approve: 'shortlisted',
  pass: 'passed',
  archive: 'archived',
  publish: 'submitted',
  expire: 'expired',
  withdraw: 'withdrawn',
  book: 'booked',
  prepare: 'preparing',
}

/**
 * How a move is named on a button.
 *
 * Not `GIG_STATUS_META[s].label`, which names the *state* a row lands in.
 * "Archived" is where you end up; "Archive" is what you are about to do, and a
 * button has to say the second one. Exported because the Review pane builds
 * its bar from the same moves.
 */
export const GIG_MOVE_LABEL: Partial<Record<GigStatus, string>> = {
  shortlisted: 'Will apply',
  preparing: 'Start preparing',
  submitted: 'Applied',
  booked: 'Confirm the booking',
  passed: 'Pass',
  expired: 'Window closed',
  withdrawn: 'Withdraw',
  archived: 'Archive',
}

const INTENT_BY_GIG_STATUS = {
  shortlisted: 'approve',
  preparing: 'prepare',
  submitted: 'confirm_sent',
  booked: 'book',
  passed: 'pass',
  expired: 'expire',
  withdrawn: 'withdraw',
  archived: 'archive',
} as const satisfies Partial<Record<GigStatus, DecisionIntent>>

/**
 * Which legal move is worth a button when the preferred one is not available,
 * affirmative first and negative second.
 *
 * `acknowledged`, `info_requested`, `invited` and `declined` are absent on
 * purpose: those record what the *organiser* did, and a one-click button that
 * writes down their rejection is not a decision you should be able to make by
 * reflex on the Overview page.
 */
const LADDER: Record<'go' | 'no', GigStatus[]> = {
  go: ['booked', 'submitted', 'preparing', 'shortlisted'],
  no: ['expired', 'withdrawn', 'passed', 'archived'],
}

export function gigMoveAction(to: GigStatus, tone: 'go' | 'no'): DecisionAction | null {
  const intent = INTENT_BY_GIG_STATUS[to as keyof typeof INTENT_BY_GIG_STATUS]
  const label = GIG_MOVE_LABEL[to]
  return intent && label ? { label, intent, tone } : null
}

/**
 * Drop every proposed action the pipeline would refuse, and top the pair back
 * up from whatever it does allow.
 *
 * A same-status target counts as refused even though the API treats it as a
 * no-op: "Keep for next cycle" on an already-shortlisted gig wrote nothing,
 * changed nothing, and dealt the identical card straight back.
 */
function gigActions(
  kind: ReviewKind,
  status: string,
  preferred: DecisionAction[],
): DecisionAction[] {
  if (kind === 'gig') return legaliseGig(status, preferred)
  // Sync targets and promo drafts take a free-form status, so nothing here is
  // illegal — but a table may list alternates for the gig side, and a card is
  // one affirmative and one negative. Take the first of each.
  return (['go', 'no'] as const)
    .map((tone) => preferred.find((a) => a.tone === tone))
    .filter((a): a is DecisionAction => a !== undefined)
}

function legaliseGig(status: string, preferred: DecisionAction[]): DecisionAction[] {
  const moves = new Set<GigStatus>(nextGigStatuses(status))
  const out: DecisionAction[] = []

  for (const tone of ['go', 'no'] as const) {
    const kept = preferred.find((a) => a.tone === tone && moves.has(GIG_STATUS_BY_INTENT[a.intent]))
    if (kept) {
      out.push(kept)
      continue
    }
    const fallback = LADDER[tone].find((s) => moves.has(s))
    const action = fallback ? gigMoveAction(fallback, tone) : null
    if (action) out.push(action)
  }

  return out
}

/**
 * Proposed actions per situation, affirmative first.
 *
 * More than one `go` is allowed and is not a mistake: `legaliseGig` takes the
 * first whose move the row's status actually offers, so a label that names the
 * *meaning* of the decision can survive a change in which status carries it.
 * "Approve the spend" on a discovered gig means shortlisting it; on one you
 * already shortlisted it means starting the application. Same sentence, same
 * button, different move.
 */
const GIG_ACTIONS: Record<string, DecisionAction[]> = {
  sent_check: [
    { label: 'It went out', intent: 'confirm_sent', tone: 'go' },
    { label: 'Not sent — reopen', intent: 'reopen', tone: 'no' },
  ],
  spend: [
    { label: 'Approve the spend', intent: 'approve', tone: 'go' },
    { label: 'Approve the spend', intent: 'prepare', tone: 'go' },
    { label: 'Pass', intent: 'pass', tone: 'no' },
  ],
  // "Keep for next cycle" used to sit here as `approve`, which on an
  // already-shortlisted gig set the status it already had: nothing was
  // written and the same card came straight back. `expire` is the move the
  // pipeline actually offers, and it is what happened.
  close_out: [
    { label: 'Applied', intent: 'confirm_sent', tone: 'go' },
    { label: 'Window closed', intent: 'expire', tone: 'no' },
  ],
  invitation: [
    { label: 'Confirm the booking', intent: 'book', tone: 'go' },
    { label: 'Withdraw', intent: 'withdraw', tone: 'no' },
  ],
  // One action, and it is the negative one. There is no status that means
  // "chased" — following up is an email — so the affirmative path off this
  // card is the snooze beside it, which is why the sentence names it.
  give_up: [{ label: 'Never heard back', intent: 'expire', tone: 'no' }],
  // A permit that cannot be got in time is not a reason to invent a status.
  // The affirmative is "do it anyway, knowing"; the negative is whichever move
  // records pulling out — `withdrawn` once it has gone in, `passed` before.
  // Ordered that way because turning down an invitation is your verb, and
  // `declined` would say they turned you down.
  visa: [
    { label: 'Apply anyway', intent: 'approve', tone: 'go' },
    { label: 'Apply anyway', intent: 'prepare', tone: 'go' },
    { label: 'Withdraw', intent: 'withdraw', tone: 'no' },
    { label: 'Pass', intent: 'pass', tone: 'no' },
  ],
  go_no: [
    { label: 'Will apply', intent: 'approve', tone: 'go' },
    { label: 'Start preparing', intent: 'prepare', tone: 'go' },
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

const SYNC_PITCH: [DecisionAction, DecisionAction] = [
  { label: 'Worth pitching', intent: 'approve', tone: 'go' },
  { label: 'Let it go', intent: 'pass', tone: 'no' },
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
      if (kind === 'sync') {
        return {
          rationale:
            `Marked ${status.replace(/_/g, ' ')} in the tracker, but the note says it was never ` +
            `actually sent.${extra} Did this go out?`,
          actions: SYNC_SENT_CHECK,
        }
      }
      // No buttons, deliberately. The gig pipeline has no reverse gear —
      // `submitted` cannot walk back to `shortlisted`, because undoing a
      // transition is an edit, not a move (see shared/gigStatus.ts). The card
      // used to offer "Not sent — reopen" anyway, and it returned a 400 every
      // time. Naming the contradiction and sending you to the row is the only
      // thing here that is true.
      return {
        rationale:
          `Marked ${status.replace(/_/g, ' ')} in the tracker, but the note says it was never ` +
          `actually sent.${extra} One of the two is wrong, and fixing it is an edit rather ` +
          `than a decision — open it and correct whichever side is.`,
        actions: [],
      }
    }

    case 'visa_risk': {
      const uncertain = item.flags.some((f) => f.id === 'visa_risk' && f.severity === 'warn')
      if (uncertain) {
        // No buttons. The missing thing is a fact about the booking, not a
        // decision about the row, and a card that offered "Pass" here would
        // be asking you to decide on the strength of the question itself.
        return {
          rationale:
            'A US date, and nobody has said whether it is a showcase or a paid booking. ' +
            'Showcase enters as a business visitor and costs nothing; paid needs a P-2, about ' +
            '$800 and ninety days — and there is not ninety days here. Say which it is in ' +
            'Edit details, then decide.',
          actions: [],
        }
      }
      return {
        rationale:
          'A paid US performance needs a P-2, and the ninety days it takes do not fit between ' +
          'the deadline and the show. Applying is still your call; counting on the permit is ' +
          'not. Ask the organiser about the dates before you spend the entry fee.',
        actions: gigActions(kind, status, GIG_ACTIONS.visa),
      }
    }

    case 'reply_due': {
      if (normaliseGigStatus(status) === 'invited') {
        return {
          rationale:
            'They want you. Nothing is booked until the agreement is signed, so this is the ' +
            'confirmation — and turning it down is you withdrawing, not them declining.',
          actions: gigActions(kind, status, GIG_ACTIONS.invitation),
        }
      }
      // No buttons. The answer to a question is an email, and there is no
      // status that means "replied" — recording what came back is the next
      // decision, not this one. This is the state the plan called out as the
      // one that stalls if nobody notices, so the card exists to make it
      // impossible not to.
      return {
        rationale:
          'They asked a question, and nothing moves until you answer it. Answering is a ' +
          'reply in your mail, not a button here — open it, send the answer, then record ' +
          'whatever comes back.',
        actions: [],
      }
    }

    case 'no_reply': {
      const { days, exact } = item.silence ?? { days: 0, exact: true }
      const sent = normaliseGigStatus(status) === 'acknowledged'
        ? 'They confirmed they had it'
        : 'It went out'
      return {
        rationale:
          `${sent} ${exact ? '' : 'about '}${days} days ago and nothing has come back. ` +
          `Chasing is an email rather than a button — send one and snooze this, or write ` +
          `it off if the answer was never coming.`,
        actions: gigActions(kind, status, GIG_ACTIONS.give_up),
      }
    }

    case 'overdue': {
      const days = Math.abs(deadline.daysUntil ?? 0)
      return {
        rationale:
          `The deadline passed ${days} ${days === 1 ? 'day' : 'days'} ago and nothing was ` +
          `submitted. Either it went out and the tracker never heard, or the window closed on it.`,
        actions: gigActions(kind, status, GIG_ACTIONS.close_out),
      }
    }

    case 'paid': {
      const cost = fee.amount != null ? `${fee.currency} ${fee.amount.toLocaleString()}` : 'money'
      return {
        rationale:
          `Costs ${cost} to enter, so nobody can submit it without your say-so. ` +
          `Approving here is approving the spend.`,
        actions: gigActions(kind, status, GIG_ACTIONS.spend),
      }
    }

    case 'issue': {
      const detail = dangerAlert
        ? upperFirst(condense(dangerAlert.text))
        : 'Something about this needs a look.'
      const isDuplicate = /already exists|duplicate|two independent/i.test(detail)
      return {
        rationale: isDuplicate ? `${detail} Pick one to send.` : detail,
        actions: isDuplicate && kind === 'sync' ? SYNC_PICK : gigActions(kind, status, GIG_ACTIONS.go_no),
      }
    }

    case 'due_soon': {
      const days = deadline.daysUntil ?? 0
      return {
        rationale:
          days === 0
            ? 'The deadline is today and nothing has been submitted yet.'
            : `Due in ${days} ${days === 1 ? 'day' : 'days'} and nothing has been submitted yet.`,
        actions: gigActions(kind, status, GIG_ACTIONS.go_no),
      }
    }

    case 'blocked': {
      return {
        rationale: missingFields.length
          ? `Waiting on you for ${listFields(missingFields)}.`
          : blocker
          ? `Waiting on you: ${lowerFirst(condense(blocker))}`
          : 'This is waiting on something only you can supply.',
        actions: gigActions(kind, status, GIG_ACTIONS.go_no),
      }
    }

    case 'not_submitted': {
      const how = parsed.submissionMethod ? ` It goes out by ${parsed.submissionMethod}.` : ''
      return {
        rationale: `Drafted but never sent.${how} Decide whether it is worth doing.`,
        actions: gigActions(kind, status, GIG_ACTIONS.go_no),
      }
    }

    default: {
      // No flag is driving this one, so describe it and ask the plain question.
      // Sync targets are described rather than named — their subtitle is often
      // an email address, which reads badly mid-sentence.
      if (kind === 'sync') {
        return {
          rationale: 'A sync target with nothing outstanding on it. Worth pitching, or let it go?',
          actions: SYNC_PITCH,
        }
      }
      const what = item.subtitle ? lowerFirst(condense(item.subtitle, 60)) : 'opportunity'
      const where = parsed.location ? ` in ${parsed.location}` : ''
      return {
        rationale: `A ${what}${where} with no deadline forcing the issue. Worth doing, or not?`,
        actions: gigActions(kind, status, GIG_ACTIONS.go_no),
      }
    }
  }
}
