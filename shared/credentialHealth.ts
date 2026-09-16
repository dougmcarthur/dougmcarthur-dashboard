/**
 * Whether a connection *works*, as distinct from whether it is configured.
 *
 * The integration cards asked one question — is the secret set? — and painted a
 * green pill when it was. A refresh token that Google stopped accepting weeks
 * ago passes that test, so the card read green while the reply scan quietly
 * did nothing. That is the failure this repository already names about the
 * Artist page: a check that cannot answer you is how you conclude everything
 * is fine.
 *
 * Two things make this more than a boolean.
 *
 * **"Nobody has checked" is not "it is broken."** `unverified` is a state of
 * its own, exactly as `unreviewed` is a state apart from `overdue` in
 * `artistAssets`, and for the same reason: the absence of a claim is not a
 * negative claim, and alarming on one trains you to dismiss the other.
 *
 * **A failed probe is two different facts.** Google refusing the credential
 * (`invalid_grant`, a 400, a 401) is decisive and yours to act on. Google being
 * unreachable — a timeout, a 500, a DNS failure — is evidence about the
 * network and none at all about the credential. Collapsing them into "failed"
 * would raise a critical alarm every time a request lost a race, which is how
 * an alarm becomes noise. Only `rejected` is a notification.
 */

/** The connections that can actually be probed, and the one that cannot. */
export type CredentialId = 'calendar' | 'gmail' | 'email'

export type ProbeOutcome = 'working' | 'rejected' | 'unreachable'

/** What a probe leaves behind in `app_settings`. */
export interface ProbeRecord {
  outcome: ProbeOutcome
  /** ISO timestamp of the probe. */
  at: string
  /** Google's own words, trimmed. Shown, because a reading you cannot check is one you should not trust. */
  detail?: string
}

export type CredentialState =
  /** Secrets missing. Nothing to probe. */
  | 'unconfigured'
  /** Configured, and no probe has ever run. Not a fault. */
  | 'unverified'
  /** Configured, and the last probe was accepted. */
  | 'working'
  /** Configured, and the credential was refused. This one is yours to fix. */
  | 'rejected'
  /** Configured, and the probe could not reach Google. Says nothing either way. */
  | 'unreachable'
  /** Declared, and unprobeable by nature. See `UNPROBEABLE`. */
  | 'declared'

/**
 * Sending mail goes through a Worker binding, and the only way to prove a
 * binding works is to send something. A health check that mails somebody every
 * time you open Settings is worse than not checking, so this one stays a
 * declaration — and the card says so in those words rather than showing a tick
 * that means less than it looks like it means.
 */
export const UNPROBEABLE: readonly CredentialId[] = ['email']

export function isProbeable(id: CredentialId): boolean {
  return !UNPROBEABLE.includes(id)
}

/**
 * How old a passing probe may be before the screen should say so.
 *
 * Not a failure state — a credential does not rot because nobody looked at it,
 * and the cron re-probes daily, so a stale record means the cron is not
 * running rather than the credential is bad. It is shown, not alarmed on.
 */
export const PROBE_STALE_DAYS = 3

export interface CredentialInput {
  configured: boolean
  probe: ProbeRecord | null
}

export function credentialState(id: CredentialId, input: CredentialInput): CredentialState {
  if (!input.configured) return 'unconfigured'
  if (!isProbeable(id)) return 'declared'
  if (!input.probe) return 'unverified'
  return input.probe.outcome
}

/** Whole answer for one card: the state, when it was learned, and whether that is stale. */
export interface CredentialHealth {
  id: CredentialId
  state: CredentialState
  checkedAt: string | null
  detail: string | null
  stale: boolean
}

export function credentialHealth(
  id: CredentialId,
  input: CredentialInput,
  now: Date,
): CredentialHealth {
  const state = credentialState(id, input)
  const checkedAt = input.probe?.at ?? null
  return {
    id,
    state,
    checkedAt,
    detail: input.probe?.detail ?? null,
    stale: state === 'working' && checkedAt !== null && ageInDays(checkedAt, now) > PROBE_STALE_DAYS,
  }
}

function ageInDays(at: string, now: Date): number {
  const then = Date.parse(at)
  if (Number.isNaN(then)) return 0
  return (now.getTime() - then) / 86_400_000
}

/**
 * Is this state one the owner has to do something about?
 *
 * `unconfigured` and `rejected` only. `unverified` is an absent claim,
 * `unreachable` is a claim about the network, and `declared` is the honest
 * answer for something that cannot be tested — none of the three is a fault to
 * raise, and raising them is how the bell stops being read.
 */
export function needsAttention(state: CredentialState): boolean {
  return state === 'unconfigured' || state === 'rejected'
}

/** What a card says, so every surface agrees and none of them invents wording. */
export const STATE_LABELS: Record<CredentialState, string> = {
  unconfigured: 'Not connected',
  unverified: 'Not checked yet',
  working: 'Working',
  rejected: 'No longer accepted',
  unreachable: 'Could not check',
  declared: 'Configured',
}

/**
 * The sentence under the label. These say what the state *means for the app*,
 * because "rejected" alone does not tell you the reply scan has stopped.
 */
export const STATE_NOTES: Record<CredentialState, string> = {
  unconfigured: 'The secrets for this connection are not set.',
  unverified: 'Configured, but nothing has confirmed it works yet.',
  working: 'Checked and accepted.',
  rejected: 'The credential was refused. Whatever depends on it has stopped.',
  unreachable: 'The check could not reach Google. This says nothing about the credential itself.',
  declared: 'Sending is a Worker binding, and the only way to test one is to send a message. Declared rather than checked.',
}
