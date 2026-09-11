/**
 * Invitations: the rules, with no database in sight.
 *
 * An invite is a credential that grants an *account*, which is a bigger thing
 * than any other credential this app issues — a passkey signs into an account
 * that already exists, and this one brings one into being. So the rules are
 * strict, and each of them is here rather than in a route because the route is
 * the place they would be checked inconsistently.
 *
 * As everywhere else in this repo, `now` is handed in rather than read. A
 * function that reads the clock is one whose tests pass today and fail in CI
 * tomorrow, and expiry is exactly the kind of arithmetic that does that.
 */

/** Thirty days, as asked. Long enough to forget about, short enough to lapse. */
export const INVITE_TTL_DAYS = 30

/**
 * Why an invite cannot be used, or that it can.
 *
 * `redeemed` is checked before `expired` on purpose: single use means a second
 * attempt on the same token fails *whether or not* it has expired, and the
 * person holding it is better served by "this was already used" than by a
 * date that is beside the point.
 */
export type InviteState = 'valid' | 'redeemed' | 'revoked' | 'expired'

export interface InviteTimes {
  expiresAt: string
  redeemedAt?: string | null
  revokedAt?: string | null
}

export function inviteState(input: { now: Date; invite: InviteTimes }): InviteState {
  const { now, invite } = input
  if (invite.redeemedAt) return 'redeemed'
  if (invite.revokedAt) return 'revoked'
  return Date.parse(invite.expiresAt) <= now.getTime() ? 'expired' : 'valid'
}

/** When an invite issued now would lapse. */
export function inviteExpiry(now: Date): string {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000).toISOString()
}

/**
 * What the person holding a dead link is told.
 *
 * Each one says what happened and what to do about it, because "invalid
 * invitation" leaves somebody staring at a screen with no next move. The
 * remedy is always the same — ask for another — and saying so is the whole
 * value of distinguishing the cases.
 */
export const INVITE_REFUSALS: Record<Exclude<InviteState, 'valid'>, string> = {
  redeemed: 'This invitation has already been used. If that was not you, ask for a new one.',
  revoked: 'This invitation was withdrawn. Ask for a new one.',
  expired: 'This invitation has expired. Ask for a new one.',
}

/**
 * `d••••••@gmail.com` — enough to recognise, not enough to harvest.
 *
 * The join screen shows the address the invite was issued to, because somebody
 * following a link needs to know it is meant for them. Masked, because a link
 * can be forwarded or found in a browser history, and a full address on a page
 * anyone holding the URL can load is an address anyone holding the URL has.
 */
export function maskAddress(address: string): string {
  const [name, domain] = address.split('@')
  if (!domain) return '•••'
  return `${name.slice(0, 1)}${'•'.repeat(Math.max(name.length - 1, 1))}@${domain}`
}
