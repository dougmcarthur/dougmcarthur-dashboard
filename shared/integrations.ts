/**
 * What each integration is, in words a person reads.
 *
 * Six of them, and they are not the same kind of thing: four are grants the
 * artist makes in their browser, one is a credential somebody set on the
 * server, and one is a Worker binding that exists or does not. The Settings
 * screen shows them in one list anyway, because "what is Scout connected to"
 * is one question — but the differences decide what each row can offer, so
 * they are typed rather than flattened.
 *
 * **The access lines live here and nowhere else.** A consent screen that says
 * one thing and a details panel that says another is worse than either alone,
 * and that drift is exactly what happens when the same sentence is typed in
 * two components. `test/integrations.test.ts` fails if a row loses its plain
 * words, or if a raw scope URL reaches a screen.
 */

import { needsAttention, type CredentialState } from './credentialHealth'

export type IntegrationId =
  | 'calendar'
  | 'calendar.primary'
  | 'tasks'
  | 'gmail.drafts'
  | 'gmail.mailbox'
  | 'email.sending'

/**
 * How the connection is made, which is what decides the row's affordance.
 *
 * - `grant` — the artist presses a button and approves it. Connectable and
 *   disconnectable from this screen.
 * - `secret` — somebody set a value on the server. Nothing the screen can do
 *   about it beyond saying whether it works.
 * - `binding` — declared in `wrangler.toml`. It exists or it does not, and it
 *   cannot be tested without using it.
 */
export type IntegrationKind = 'grant' | 'secret' | 'binding'

export interface IntegrationSpec {
  id: IntegrationId
  /** What it is called on screen. Never a variable name. */
  name: string
  /** What it does for the artist, in one line. */
  purpose: string
  kind: IntegrationKind
  /** What the connection can reach. Plain words, never a scope URL. */
  access: string[]
  /**
   * What it deliberately cannot do, and why that is guaranteed rather than
   * promised. Empty where there is no such guarantee to make — saying nothing
   * is better than implying a limit that does not exist.
   */
  cannot: string[]
  /** What stops working when this is not connected. */
  breaks: string
  /**
   * A row that is not offered unless the deployment says so, and the sentence
   * explaining why anybody would want it.
   *
   * Only the primary-calendar grant has one. It is hidden rather than shown
   * disabled, because a row you cannot use is a row that reads as broken —
   * and because on a deployment that has not declared the scope, pressing it
   * would end at a Google error page rather than at a consent screen.
   */
  gated?: { reason: string }
}

export const INTEGRATIONS: IntegrationSpec[] = [
  {
    id: 'calendar',
    name: 'Google Calendar',
    purpose: 'Puts the shows you have been booked for in your calendar.',
    kind: 'grant',
    access: [
      'Create a calendar in your account, called Sun Dogs Music Scout.',
      'Add, change and remove events on that one calendar.',
    ],
    cannot: [
      'Read the rest of your calendar — Google does not give it the permission, so this holds even if the code is wrong.',
      'Touch an event it did not create.',
    ],
    breaks: 'Booked shows go nowhere near your calendar.',
  },
  {
    id: 'calendar.primary',
    name: 'Your own calendar',
    purpose: 'Writes shows straight into your main calendar instead of a separate one.',
    kind: 'grant',
    // No softening. This is the one grant in the list where Google enforces
    // nothing about which of the artist's calendars Scout touches, and the
    // screen has to say that before the consent rather than after it.
    access: [
      'See, create, change and delete events on every calendar you own — not only the ones Scout made.',
      'Write Scout entries into your main calendar, which is the reason to turn it on.',
    ],
    // Deliberately empty. There is no guarantee to make here, and inventing a
    // reassuring line would be exactly the thing the Gmail row exists to warn
    // against: a permission that protects less than the reader assumes.
    cannot: [],
    breaks: 'Shows go on the separate Scout calendar instead, which is the default.',
    gated: {
      reason:
        'Off unless this deployment has been set up for it. The permission it needs covers every calendar you own, so it has to be reviewed by Google before it can be offered.',
    },
  },
  {
    id: 'tasks',
    name: 'Google Tasks',
    purpose: 'Puts deadlines, opening windows and replies you owe on your task list.',
    kind: 'grant',
    access: [
      'Create a task list in your account, called Sun Dogs Music Scout.',
      'Add, change and remove tasks on that one list.',
      // The `gmail.compose` disclosure again, because it is the same trade.
      // Google offers read-only or everything and nothing in between, so the
      // limit above is kept by this code rather than by the permission.
      'Read and change every other task list you have — Google includes that in the same permission. Scout never does: it only ever names the one list it made.',
    ],
    cannot: [],
    breaks: 'Deadlines and replies you owe are only visible inside Scout.',
  },
  {
    id: 'gmail.drafts',
    name: 'Gmail drafting',
    purpose: 'Writes sync pitches into your Gmail drafts, for you to read and send.',
    kind: 'grant',
    access: [
      'Create drafts in your mailbox.',
      // Said out loud rather than implied. The narrowest scope Google offers
      // for creating a draft also permits sending, so the limit here is this
      // code rather than the permission — and a permission that protects less
      // than the reader assumes is the thing to write down.
      'Send mail — Google includes that in the same permission. Scout never does: there is no send call in it, and a test fails if a Send button ever appears.',
    ],
    cannot: [],
    breaks: 'Pitches have to be copied into a compose window by hand.',
  },
  {
    id: 'gmail.mailbox',
    name: 'Gmail mailbox',
    purpose: 'Reads replies from organisers so they can be matched to the right gig.',
    kind: 'secret',
    access: ['Read mail in the mailbox the server credential belongs to.'],
    cannot: ['Send, delete or change anything — the credential is read-only.'],
    breaks: 'Organiser replies are never noticed, and sent pitches are never reconciled.',
  },
  {
    id: 'email.sending',
    name: 'Email sending',
    purpose: 'Delivers the weekly digest and sign-in codes.',
    kind: 'binding',
    access: ['Send to one allowlisted address.'],
    cannot: [
      'Mail anybody else — the allowlist is enforced outside this code, so a bug cannot widen it.',
    ],
    breaks: 'No digest, and no way back in if you lose every passkey.',
  },
]

/**
 * The sentence under the status pill, which depends on the row's *kind* and
 * not only on its state.
 *
 * `STATE_NOTES` was written for the credential probe, where every state is
 * about a secret somebody set on the server. On a grant row that makes
 * `unconfigured` say "the secrets for this connection are not set", which is
 * wrong in a way that matters: it sends somebody looking for a Worker secret
 * when the thing to do is press Connect. Same defect as the panel that once
 * showed "the secrets are not set" beside Google's own `invalid_client` — two
 * claims in one box, and the reader believes the specific one.
 *
 * Only the two states that can differ are overridden. Everything else already
 * means the same thing on both kinds of row, and a second copy of a sentence
 * is a second place for it to drift.
 */
const GRANT_NOTES: Partial<Record<string, string>> = {
  unconfigured: 'Not connected yet. Nothing is written until you connect it.',
  rejected: 'Google refused the permission, or it was withdrawn. Connect it again to fix that.',
}

export function stateNote(spec: IntegrationSpec, state: string, fallback: string): string {
  if (spec.kind !== 'grant') return fallback
  return GRANT_NOTES[state] ?? fallback
}

/**
 * Whether a row is actually *wrong*, as opposed to merely unconnected.
 *
 * `needsAttention` answers this for a credential, where `unconfigured` means a
 * value the deployment needs is missing — a fault somebody has to go and fix.
 * On a grant row it means nobody has pressed Connect yet, which is a choice
 * not yet made and not a problem with anything. Counting those under "need
 * attention" tells a new account that three things are broken on the day it
 * is set up correctly, which is how a summary line stops being read.
 *
 * Same split `stateNote` makes, for the same reason: a grant and a secret are
 * different kinds of thing wearing the same six states.
 */
export function rowNeedsAttention(spec: IntegrationSpec, state: string): boolean {
  if (spec.kind === 'grant' && state === 'unconfigured') return false
  return needsAttention(state as CredentialState)
}

export function integrationSpec(id: IntegrationId): IntegrationSpec {
  const found = INTEGRATIONS.find((i) => i.id === id)
  if (!found) throw new Error(`No integration spec for ${id}`)
  return found
}

/** Only a grant can be connected or disconnected from the screen. */
export function isConnectable(spec: IntegrationSpec): boolean {
  return spec.kind === 'grant'
}
