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
  | 'drive'
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
    id: 'drive',
    name: 'Google Drive',
    purpose: 'Keeps your EPK files in one folder you can share with juries and organisers.',
    kind: 'grant',
    access: [
      'Create a folder in your Drive for your EPK, with a subfolder for each kind of file.',
      'Open files you pick for it in Google’s own file picker, and copy them into that folder.',
    ],
    cannot: [
      'See anything else in your Drive — Google does not give it the permission, so this holds even if the code is wrong.',
    ],
    breaks: 'EPK files have to be attached by hand each time somebody asks.',
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
    purpose: 'Delivers the weekly digest, setup codes and invitations.',
    kind: 'binding',
    access: [
      'Send the digest to the owner, a setup code to an address already on an account, and an invitation to the address it was issued to.',
    ],
    cannot: [
      'Mail anybody else — every send is checked against the addresses on file before it goes. That check is in this code, so it is tested rather than guaranteed by Cloudflare.',
      'Send from any address but the two it is configured with — that limit is enforced by Cloudflare.',
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

/**
 * The Google side of each row: which grant purpose it is, and what one press
 * of "Connect Google account" covers. `calendar.primary` is a grant but not
 * in the bundle — it is an opt-in with its own warning.
 */
export type GooglePurpose = 'calendar' | 'calendar.primary' | 'tasks' | 'gmail.compose' | 'drive'

export const GOOGLE_PURPOSE_OF: Partial<Record<IntegrationId, GooglePurpose>> = {
  calendar: 'calendar',
  'calendar.primary': 'calendar.primary',
  tasks: 'tasks',
  'gmail.drafts': 'gmail.compose',
  drive: 'drive',
}

/** Short names, for "Connected for Calendar, Tasks and Gmail drafts". */
export const GOOGLE_SERVICE_LABEL: Record<GooglePurpose, string> = {
  calendar: 'Calendar',
  'calendar.primary': 'your own calendar',
  tasks: 'Tasks',
  'gmail.compose': 'Gmail drafts',
  drive: 'Drive',
}

/** "Calendar, Tasks and Drive". */
export function listServices(purposes: string[]): string {
  const names = purposes.map((p) => GOOGLE_SERVICE_LABEL[p as GooglePurpose] ?? p)
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export interface ConnectNotice {
  tone: 'success' | 'warn' | 'danger'
  lines: string[]
}

/**
 * What to say when Google's consent round trip lands back on Settings.
 *
 * The callback always reported how it went — `#settings?calendar=failed` —
 * and nothing read it, so a connection that failed after Google's screen said
 * yes looked exactly like one that had never been tried. That is how a
 * calendar was "successfully connected" with nothing stored. Each outcome
 * says what happened and what to do; a partial one names every service it
 * could not connect and why, since "connected three of four" without saying
 * which is the worse answer.
 */
export function connectNotice(query: URLSearchParams): ConnectNotice | null {
  const google = query.get('google')
  const split = (key: string) => (query.get(key) ?? '').split(',').filter(Boolean)
  const PER_SERVICE: Record<string, GooglePurpose> = { calendar: 'calendar', tasks: 'tasks', gmail: 'gmail.compose' }

  const common = (outcome: string, what: string): ConnectNotice | null => {
    switch (outcome) {
      case 'access_denied':
        return { tone: 'warn', lines: ['Cancelled on Google’s screen. Nothing was connected.'] }
      case 'state_mismatch':
        return {
          tone: 'warn',
          lines: ['That connection expired or was started in another tab. Nothing was connected — try again.'],
        }
      case 'failed':
        return {
          tone: 'danger',
          lines: [
            `Google said yes, but Scout could not finish connecting ${what}, so nothing was saved.`,
            'The usual cause is the Google API for that service not being enabled in the Google Cloud project. Try again; if it keeps failing, the Worker log names the reason.',
          ],
        }
      case 'missing_scope':
        return {
          tone: 'warn',
          lines: [`${what} was left unticked on Google’s screen, so it is connected without permission to do anything. Connect it again and leave it ticked.`],
        }
      default:
        return null
    }
  }

  if (google) {
    if (google === 'connected') return { tone: 'success', lines: ['Google account connected.'] }
    if (google === 'partial') {
      const lines = ['Google account connected, with gaps:']
      const declined = split('declined')
      const failed = split('failed')
      const kept = split('kept')
      if (declined.length) lines.push(`${listServices(declined)} ${declined.length === 1 ? 'was' : 'were'} left unticked on Google’s screen. Connect again to add ${declined.length === 1 ? 'it' : 'them'}.`)
      if (failed.length) lines.push(`${listServices(failed)} could not be set up. The usual cause is its Google API not being enabled in the Google Cloud project.`)
      if (kept.length) lines.push(`${listServices(kept)} stayed on the other Google account ${kept.length === 1 ? 'it was' : 'they were'} already connected to.`)
      return { tone: failed.length ? 'danger' : 'warn', lines }
    }
    return common(google, 'your Google account')
  }

  for (const [key, purpose] of Object.entries(PER_SERVICE)) {
    const outcome = query.get(key)
    if (!outcome) continue
    if (outcome === 'connected') return { tone: 'success', lines: [`${GOOGLE_SERVICE_LABEL[purpose]} connected.`] }
    return common(outcome, GOOGLE_SERVICE_LABEL[purpose])
  }
  return null
}
