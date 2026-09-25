/**
 * Every email Scout sends, via Cloudflare Email Service's `send_email` binding.
 *
 * No API key and no third-party account — nothing to leak that sends
 * anywhere its owner can, which is what a key-based sender would add.
 *
 * It also leaves the Gmail integration alone. That token is deliberately
 * `gmail.readonly` (docs/gmail-setup.md), and re-consenting it for `gmail.send`
 * to deliver one weekly email would widen what a leak costs for no gain.
 *
 * The gate is a domain, not a plan, which is easy to get backwards. Sending to
 * a *verified destination address* is free on every plan and never touches the
 * monthly quota or the daily limit. Sending to an **arbitrary** recipient
 * needs the sending domain onboarded to Email Service — and once it is, any
 * recipient works immediately, on the same plan as before. Upgrading buys
 * nothing here; onboarding the domain buys everything.
 *
 * The binding used to carry an `allowed_destination_addresses` list of one
 * address, the owner's, and that list was the boundary. Invitations and
 * per-artist recovery need mail to reach people who are not the owner, so the
 * list is gone and `sendMail` below is the boundary instead: every send names
 * an audience, and an address that audience has no record of is refused
 * before the binding is called. The rule is `shared/recipients.ts`. The
 * binding still limits the *sender* (`allowed_sender_addresses`), so the From
 * line stays enforced outside this code.
 */

import { isNull } from 'drizzle-orm'
import { getDb } from '../db'
import { invites, users } from '../db/schema'
import type { Env } from '../types'
import { PRODUCT_NAME, type SenderIdentity } from './emailTemplate'
import { recipientAllowed, type AddressBook, type Audience } from '../../shared/recipients'
import { inviteState } from '../../shared/invites'

export interface Mail {
  to: string
  /** Who this is for, which decides which addresses it may reach. */
  audience: Audience
  /** The bare address. The display name is always the product's. */
  from: string
  subject: string
  text: string
  html: string
}

/** The footer's identification, read from configuration and nothing else. */
export function senderIdentity(env: Env): SenderIdentity {
  return {
    siteUrl: env.DASHBOARD_URL ?? 'https://scout.sundogsmusic.ca',
    postalAddress: env.MAIL_POSTAL_ADDRESS?.trim() || null,
  }
}

export function mailerConfigured(env: Env): boolean {
  return typeof env.EMAIL?.send === 'function'
}

/** Refused before the binding was called. The message names no address. */
export class UndeliverableRecipient extends Error {
  constructor(audience: Audience) {
    super(`refused: that address is not on file for ${audience} mail`)
    this.name = 'UndeliverableRecipient'
  }
}

/**
 * Every address mail may go to, read fresh on each send.
 *
 * Fresh rather than cached because the answer changes exactly when it matters:
 * an invitation withdrawn a minute ago must stop being mailable a minute ago.
 */
export async function addressBook(env: Env, now = new Date()): Promise<AddressBook> {
  const db = getDb(env.DB)
  const accounts = await db.select({ email: users.email, role: users.role }).from(users)
  const pending = await db
    .select()
    .from(invites)
    .where(isNull(invites.redeemedAt))
  return {
    owner: [env.AUTH_EMAIL, ...accounts.filter((a) => a.role === 'owner').map((a) => a.email)],
    accounts: accounts.map((a) => a.email),
    liveInvites: pending.filter((row) => inviteState({ now, invite: row }) === 'valid').map((row) => row.email),
  }
}

export async function sendMail(env: Env, mail: Mail): Promise<{ messageId?: string }> {
  const binding = env.EMAIL
  if (!binding) {
    throw new Error('email binding not configured — add [[send_email]] to wrangler.toml')
  }
  // The boundary. See shared/recipients.ts for why each audience has its own
  // list, and why this is the only place the binding is called.
  if (!recipientAllowed({ to: mail.to, audience: mail.audience, book: await addressBook(env) })) {
    throw new UndeliverableRecipient(mail.audience)
  }
  // Both bodies are sent. Plain text is not a fallback nobody sees: it is what
  // a phone notification previews, and a digest whose preview is raw markup
  // fails at the one job it has, which is getting you to open it.
  // A display name on From, so an inbox lists "Sun Dogs Music Scout" rather
  // than `login@` — the name a reader checks before trusting the message.
  const replyTo = env.MAIL_REPLY_TO?.trim()
  return binding.send({
    from: { name: PRODUCT_NAME, email: mail.from },
    ...(replyTo ? { replyTo } : {}),
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  })
}
