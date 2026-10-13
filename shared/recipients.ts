/**
 * Who an email may go to: the rule, with no database in sight.
 *
 * The `send_email` binding used to carry an allowlist of one address, which
 * made it the boundary — the Worker could not mail anywhere else whatever the
 * code said. Invitations and per-artist recovery need mail to go to people
 * who are not the owner, so that list is gone and this is what replaced it.
 * It is weaker in one way worth saying plainly: a bug here widens it, where a
 * bug could not widen the allowlist. That is why it is one function, called
 * from one place (`sendMail`), and pinned by test/recipients.test.ts.
 *
 * **Every send says who it is for**, and each audience has its own list:
 *
 *  - `owner` — the owner's digest. Only the owner's configured addresses. The
 *    digest recipient is a settings row, and a settings row is not somewhere a
 *    recipient may come from on its own; an artist's address on file is not
 *    enough either, or an artist could have the owner's digest mailed to them.
 *  - `tenant` — an artist's own digest. Only an address on an account **in
 *    that artist's tenant**: the one they sign in with, fixed by their
 *    invitation. It is never typed into the digest settings, for the reason a
 *    recovery address is never typed, and it cannot reach another tenant's
 *    addresses or the owner's.
 *  - `account` — a setup code. Only an address already on an account. The
 *    person asking typed a lookup key; this is the address that key matched.
 *  - `invite` — an invitation. Only the address a live invitation was issued
 *    to, which the owner typed at issue time behind a passkey touch.
 *
 * An address on none of those lists is refused, which is the property the
 * multi-tenant plan asked for: "send a code to this address" pointed at an
 * arbitrary inbox is the account-takeover vector the recovery rule exists to
 * prevent.
 */

export type Audience = 'owner' | 'tenant' | 'account' | 'invite'

export interface AddressBook {
  /** `AUTH_EMAIL` and the owner's own account address, when either is set. */
  owner: Array<string | null | undefined>
  /** Every account's address on file, the owner's included. */
  accounts: Array<string | null | undefined>
  /**
   * The addresses of the accounts in the one tenant being mailed, when a tenant
   * was named. Empty otherwise, so an audience of `tenant` with no tenant
   * reaches nobody rather than everybody.
   */
  tenant: Array<string | null | undefined>
  /** Addresses on invitations that can still be redeemed. */
  liveInvites: Array<string | null | undefined>
}

/** Addresses compare case-insensitively and ignore surrounding space. */
export function normaliseAddress(address: string | null | undefined): string | null {
  const trimmed = address?.trim().toLowerCase()
  return trimmed && trimmed.includes('@') ? trimmed : null
}

export function recipientAllowed(input: { to: string; audience: Audience; book: AddressBook }): boolean {
  const to = normaliseAddress(input.to)
  if (!to) return false
  const list =
    input.audience === 'owner'
      ? input.book.owner
      : input.audience === 'tenant'
        ? input.book.tenant
        : input.audience === 'account'
        ? [...input.book.owner, ...input.book.accounts]
        : input.book.liveInvites
  return list.some((address) => normaliseAddress(address) === to)
}
