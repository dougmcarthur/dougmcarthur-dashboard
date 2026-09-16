/**
 * What each integration is, in words a person reads.
 *
 * Four of them, and they are not the same kind of thing: two are grants the
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

export type IntegrationId = 'calendar' | 'gmail.drafts' | 'gmail.mailbox' | 'email.sending'

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
}

export const INTEGRATIONS: IntegrationSpec[] = [
  {
    id: 'calendar',
    name: 'Google Calendar',
    purpose: 'Puts deadlines, opening dates and booked shows in your calendar.',
    kind: 'grant',
    access: [
      'Create a calendar in your account, called Sun Dogs Music Scout.',
      'Add, change and remove events on that one calendar.',
    ],
    cannot: [
      'Read the rest of your calendar — Google does not give it the permission, so this holds even if the code is wrong.',
      'Touch an event it did not create.',
    ],
    breaks: 'Booked gigs and deadlines go nowhere near your calendar.',
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

export function integrationSpec(id: IntegrationId): IntegrationSpec {
  const found = INTEGRATIONS.find((i) => i.id === id)
  if (!found) throw new Error(`No integration spec for ${id}`)
  return found
}

/** Only a grant can be connected or disconnected from the screen. */
export function isConnectable(spec: IntegrationSpec): boolean {
  return spec.kind === 'grant'
}
