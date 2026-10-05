/**
 * "Request an invitation", from the logged-out landing page.
 *
 * A soft sign-up: a name, an address and why they want to try Scout, from
 * somebody with no account. It creates nothing and grants nothing — the
 * owner reads it on the admin surface and, if they choose, issues a real
 * invitation to the address, which is then typed by the owner and fixed at
 * issue like any other.
 */

export const INVITE_REQUEST_LIMITS = {
  name: 80,
  email: 200,
  messageMin: 10,
  message: 2000,
  /** From one sender in a day. A person asks once; a script asks forty times. */
  perSenderPerDay: 3,
  /** From everybody in a day. A ceiling on what a flood can cost D1. */
  perDay: 200,
} as const

/** Handled requests go after this long; unhandled ones after a year. */
export const HANDLED_RETENTION_DAYS = 90
export const UNHANDLED_RETENTION_DAYS = 365

export type InviteRequestStatus = 'new' | 'invited' | 'declined'

/** The bell's title. The name is a stranger's text, so it is trimmed and clipped. */
export function inviteRequestTitle(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 60)
  return `Invitation request from ${clean || 'somebody'}`
}
