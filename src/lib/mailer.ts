/**
 * Sending the digest, via Cloudflare Email Service's `send_email` binding.
 *
 * No API key and no third-party account. The binding is bound to an explicit
 * allowlist of recipients in wrangler.toml, so the Worker cannot send anywhere
 * else even if this file is wrong — a property no key-based sender has, where
 * a leaked key sends anywhere its owner can.
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
 * That is what the `allowed_destination_addresses` list in wrangler.toml is
 * really tracking. It is a genuine boundary while this is one person's app,
 * and it is the thing that has to go before an invited artist can ever be
 * mailed a setup code — see docs/multi-tenant-plan.md. Both the recipient and
 * the sender are settings rather than constants so that crossing that line
 * does not need a code change.
 */

import type { Env } from '../types'

export interface Mail {
  to: string
  from: string
  subject: string
  text: string
  html: string
}

export function mailerConfigured(env: Env): boolean {
  return typeof env.EMAIL?.send === 'function'
}

export async function sendMail(env: Env, mail: Mail): Promise<{ messageId?: string }> {
  const binding = env.EMAIL
  if (!binding) {
    throw new Error('email binding not configured — add [[send_email]] to wrangler.toml')
  }
  // Both bodies are sent. Plain text is not a fallback nobody sees: it is what
  // a phone notification previews, and a digest whose preview is raw markup
  // fails at the one job it has, which is getting you to open it.
  return binding.send({
    from: mail.from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  })
}
