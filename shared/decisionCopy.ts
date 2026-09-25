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
} from './gigStatus'
import { gigMoves, gigStage, gigStageLabel, settledByAward } from './gigStage'

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
  // Clears "they need more": you sent what they asked for.
  | 'answered'

export interface DecisionAction {
  label: string
  intent: DecisionIntent
  /** `go` is the affirmative outcome, `no` the negative one. */
  tone: 'go' | 'no'
}

export interface Decision {
  /**
   * Two words or so saying what kind of thing this is — "New", "Due soon",
   * "Reply owed". The Overview card shows this instead of the sentence: a card
   * is for deciding at a glance, and the reasoning waits in the item's detail
   * for whoever opens it. Set beside the rationale in every branch below, so
   * the two can never describe different situations.
   */
  badge: string
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
  answered: 'acknowledged',
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
  shortlisted: 'Apply',
  preparing: 'Start preparing',
  submitted: 'Mark as submitted',
  booked: 'Contract signed',
  passed: 'Pass',
  expired: 'Missed the deadline',
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
  // `preparing` is gone from here: it is In progress, the same stage as
  // `shortlisted`, so a button into it moved nothing you could see.
  go: ['booked', 'submitted', 'shortlisted'],
  no: ['expired', 'withdrawn', 'passed', 'archived'],
}

/**
 * The moves worth a button inside a table row, in the order to render them.
 *
 * A cell is not a decision surface. The expanded row under it has a picker
 * holding every move `nextGigStatuses` offers, so the cell carries only the
 * step you would take without opening anything: the furthest-forward move
 * that is yours to make, from the same ladder the cards fall back on — which
 * is why an organiser's verdict (`acknowledged`, `invited`, `declined`) never
 * gets one.
 *
 * The negative joins it only while the row is still in the collect phase.
 * Passing on something freshly found is triage, the reason you scan the table
 * at all; passing, withdrawing or letting the window close on something you
 * already said yes to is a second thought, and belongs where the row's
 * meaning is on screen rather than one mis-click from a Will apply.
 */
export function inlineGigMoves(
  status: string,
  type?: string | null,
): Array<{ to: GigStatus; tone: 'go' | 'no'; label: string; meaning: string }> {
  const moves = gigMoves(status, type)
  const triage = gigStage(status) === 'new'
  const tones: Array<'go' | 'no'> = triage ? ['go', 'no'] : ['go']
  return tones.flatMap((tone) => {
    const move = moves.find((m) => m.tone === tone)
    return move ? [{ to: move.to, tone, label: move.label, meaning: move.meaning }] : []
  })
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
    { label: 'Pass', intent: 'pass', tone: 'no' },
  ],
  // "Keep for next cycle" used to sit here as `approve`, which on an
  // already-shortlisted gig set the status it already had: nothing was
  // written and the same card came straight back. `expire` is the move the
  // pipeline actually offers, and it is what happened.
  close_out: [
    { label: 'Mark as submitted', intent: 'confirm_sent', tone: 'go' },
    { label: 'Missed the deadline', intent: 'expire', tone: 'no' },
  ],
  invitation: [
    { label: 'Contract signed', intent: 'book', tone: 'go' },
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
    { label: 'Withdraw', intent: 'withdraw', tone: 'no' },
    { label: 'Pass', intent: 'pass', tone: 'no' },
  ],
  go_no: [
    { label: 'Apply', intent: 'approve', tone: 'go' },
    { label: 'Pass', intent: 'pass', tone: 'no' },
  ],
}

/**
 * How an action looks on the Overview deck, which draws it as an icon alone.
 *
 * The icon follows the tone and nothing else, so the check always goes
 * forward and the cross always ends it — a fixed icon in a fixed place is
 * what makes the deck quick to use without reading. That only holds while a
 * card never carries two actions with the same icon, so the choice lives
 * here, where a test can check it against every card, rather than in the JSX.
 */
export type ActionGlyph = 'check' | 'x'

export function actionGlyph(action: DecisionAction): ActionGlyph {
  return action.tone === 'go' ? 'check' : 'x'
}

export interface PromoMove {
  /** The status this writes. */
  to: 'approved' | 'published'
  action: DecisionAction
}

const APPROVE_PROMO: PromoMove = {
  to: 'approved',
  action: { label: 'Approve', intent: 'approve', tone: 'go' },
}
const PUBLISH_PROMO: PromoMove = {
  to: 'published',
  action: { label: 'Mark published', intent: 'publish', tone: 'go' },
}

/**
 * The forward moves a promo draft offers, nearest first.
 *
 * The card used to offer Approve and Mark published together, whatever the
 * status: two checks side by side, with only a tooltip to tell them apart,
 * and Approve still showing on copy already published. A card takes the first
 * move here; the Review bar lists them all, since going straight from draft to
 * published is allowed — the Promo page's Publish button does exactly that.
 *
 * The column is free text (see shared/types.ts), so a status not named here is
 * read as approved, which is what the sentence says about it too: only
 * `draft` is unapproved and only `published` is finished.
 */
export function promoMoves(status: string): PromoMove[] {
  if (status === 'draft') return [APPROVE_PROMO, PUBLISH_PROMO]
  if (status === 'published') return []
  return [PUBLISH_PROMO]
}

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
    // One button: the next step for this status. See `promoMoves`.
    const actions = promoMoves(status).slice(0, 1).map((m) => m.action)
    if (status === 'published') {
      return { badge: 'Published', rationale: 'Published. Nothing left to decide.', actions }
    }
    return {
      badge: status === 'draft' ? 'New' : 'Not published',
      rationale:
        status === 'draft'
          ? 'A drafted post that has not been approved yet. Read it and decide whether it goes out as written.'
          : 'Approved copy that has not been marked published. Confirm once it is out.',
      actions,
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
          badge: 'Conflict',
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
        badge: 'Conflict',
        rationale:
          `Marked ${gigStageLabel(status).label.toLowerCase()} in the tracker, but the note says it was never ` +
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
          badge: 'Visa question',
          rationale:
            'A US date, and nobody has said whether it is a showcase or a paid booking. ' +
            'Showcase enters as a business visitor and costs nothing; paid needs a P-2, about ' +
            '$800 and ninety days — and there is not ninety days here. Say which it is in ' +
            'Edit details, then decide.',
          actions: [],
        }
      }
      return {
        badge: 'Visa risk',
        rationale:
          'A paid US performance needs a P-2, and the ninety days it takes do not fit between ' +
          'the deadline and the show. Applying is still your call; counting on the permit is ' +
          'not. Ask the organiser about the dates before you spend the entry fee.',
        actions: gigActions(kind, status, GIG_ACTIONS.visa),
      }
    }

    case 'reply_due': {
      if (normaliseGigStatus(status) === 'invited') {
        const award = item.source.kind === 'gig' && settledByAward(item.source.row.type)
        return {
          badge: 'Offer',
          rationale: award
            ? 'They made an offer. It is not accepted until the award is confirmed in writing, ' +
              'so confirm it here once it is — and turning it down is you withdrawing, not them declining.'
            : 'They made an offer. It is not accepted until the contract is signed, so record it ' +
              'here once it is — and turning it down is you withdrawing, not them declining.',
          actions: gigActions(
            kind,
            status,
            award
              ? GIG_ACTIONS.invitation.map((a) => (a.intent === 'book' ? { ...a, label: 'Award confirmed' } : a))
              : GIG_ACTIONS.invitation,
          ),
        }
      }
      // One button, and it is not the answer. The answer is an email; the
      // button records that you sent it, which clears the flag and puts the
      // gig back to waiting. Nothing else moves the stage — it stays Applied.
      return {
        badge: 'Reply owed',
        rationale:
          'They asked for something, and nothing moves until you answer. Send the answer ' +
          'from your mail, then mark it answered here.',
        actions: kind === 'gig' ? [{ label: 'Answered', intent: 'answered', tone: 'go' }] : [],
      }
    }

    case 'no_reply': {
      const { days, exact } = item.silence ?? { days: 0, exact: true }
      const sent = normaliseGigStatus(status) === 'acknowledged'
        ? 'They confirmed they had it'
        : 'It went out'
      return {
        badge: 'No reply',
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
        badge: 'Deadline passed',
        rationale:
          `The deadline passed ${days} ${days === 1 ? 'day' : 'days'} ago and nothing was ` +
          `submitted. Either it went out and the tracker never heard, or the window closed on it.`,
        actions: gigActions(kind, status, GIG_ACTIONS.close_out),
      }
    }

    case 'paid': {
      const cost = fee.amount != null ? `${fee.currency} ${fee.amount.toLocaleString()}` : 'money'
      // Once it is In progress the spend is already approved — saying yes was
      // saying yes to the fee — so the card stops asking and names when the
      // money actually goes: at submission.
      if (kind === 'gig' && gigStage(status) === 'in_progress') {
        return {
          badge: 'Entry fee',
          rationale: `Costs ${cost} to enter, paid when it is submitted. You already said yes to applying.`,
          actions: gigActions(kind, status, GIG_ACTIONS.spend),
        }
      }
      return {
        badge: 'Entry fee',
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
        badge: isDuplicate ? 'Duplicate' : 'Check this',
        rationale: isDuplicate ? `${detail} Pick one to send.` : detail,
        actions: isDuplicate && kind === 'sync' ? SYNC_PICK : gigActions(kind, status, GIG_ACTIONS.go_no),
      }
    }

    case 'due_soon': {
      const days = deadline.daysUntil ?? 0
      return {
        badge: days === 0 ? 'Due today' : 'Due soon',
        rationale:
          days === 0
            ? 'The deadline is today and nothing has been submitted yet.'
            : `Due in ${days} ${days === 1 ? 'day' : 'days'} and nothing has been submitted yet.`,
        actions: gigActions(kind, status, GIG_ACTIONS.go_no),
      }
    }

    case 'blocked': {
      return {
        badge: 'Missing details',
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
        badge: 'Not sent',
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
          badge: status === 'draft_ready' ? 'New' : 'Open',
          rationale: 'A sync target with nothing outstanding on it. Worth pitching, or let it go?',
          actions: SYNC_PITCH,
        }
      }
      const what = item.subtitle ? lowerFirst(condense(item.subtitle, 60)) : 'opportunity'
      const where = parsed.location ? ` in ${parsed.location}` : ''
      return {
        badge: gigStage(status) === 'new' ? 'New' : 'Open',
        rationale: `A ${what}${where} with no deadline forcing the issue. Worth doing, or not?`,
        actions: gigActions(kind, status, GIG_ACTIONS.go_no),
      }
    }
  }
}
