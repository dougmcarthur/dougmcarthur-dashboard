/**
 * Turning a pitch into something Gmail will accept as a draft.
 *
 * Gmail's drafts endpoint takes a whole RFC 2822 message, base64url encoded —
 * not a subject and a body as fields. So the message has to be assembled by
 * hand, and two parts of that are easy to get wrong in a way that only shows
 * up on the drafts that matter.
 *
 * **Headers are ASCII.** A subject line here reads `Sync licensing — Magic`,
 * with an em dash, because that is how everything in this repo is written.
 * Put that byte in a header raw and the header is malformed; most clients
 * render mojibake and some reject the message. RFC 2047 encoded-words are the
 * fix and they are only needed when the line is not already ASCII.
 *
 * **Bodies are not.** The body is base64 with an explicit UTF-8 charset,
 * which sidesteps line-length limits and the question of what a bare newline
 * means inside a transfer encoding.
 */

export interface DraftMessage {
  to: string
  from?: string | null
  subject: string
  body: string
}

const ASCII_ONLY = /^[\x20-\x7E]*$/

/** Base64, standard alphabet, for message bodies and encoded-words. */
function base64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/** Base64url, no padding, which is what the Gmail API wants for `raw`. */
export function base64url(input: string): string {
  const bytes = new TextEncoder().encode(input)
  return base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * A header value Gmail will accept.
 *
 * Left alone when it is already ASCII — an encoded-word around a plain
 * subject is legal but renders as gibberish in clients that do not decode it,
 * and there is no reason to spend that risk on `Sync licensing`.
 */
export function encodeHeader(value: string): string {
  const clean = value.replace(/[\r\n]+/g, ' ').trim()
  if (ASCII_ONLY.test(clean)) return clean
  return `=?UTF-8?B?${base64(new TextEncoder().encode(clean))}?=`
}

/** The message itself, ready to be base64url'd into a `raw` field. */
export function buildRawMessage(draft: DraftMessage): string {
  const headers = [
    `To: ${encodeHeader(draft.to)}`,
    ...(draft.from ? [`From: ${encodeHeader(draft.from)}`] : []),
    `Subject: ${encodeHeader(draft.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ]
  // 76-character lines, as base64 in a message body is required to be.
  const encoded = base64(new TextEncoder().encode(draft.body)).replace(/(.{76})/g, '$1\r\n')
  return `${headers.join('\r\n')}\r\n\r\n${encoded}`
}

export function encodeDraft(draft: DraftMessage): string {
  return base64url(buildRawMessage(draft))
}

/* --------------------------------------------------------------------- */

/** The shape the bulk panel needs from a sync target. Deliberately minimal. */
export interface PitchCandidate {
  id: number
  name: string
  contactEmail?: string | null
  pitchDraft?: string | null
  status?: string | null
}

export type SkipReason = 'no pitch drafted' | 'no contact address' | 'already pitched'

export interface DraftPlan {
  ready: Array<{ id: number; name: string; to: string; subject: string; body: string }>
  skipped: Array<{ id: number; name: string; reason: SkipReason }>
}

/** The subject a pitch goes out under, in one place so the plan and the write agree. */
export function subjectFor(name: string): string {
  return `Sync licensing — ${name}`
}

/**
 * Which targets can become drafts, and why the rest cannot.
 *
 * The skipped list is the point. A bulk action that silently drafts four of
 * seven leaves you wondering which three and why, and the answers — no
 * address, no pitch, already sent — each want a different thing done about
 * them. This is what the preview renders before anything is written.
 *
 * `pitched` is excluded because drafting a second copy of a pitch already
 * sent is the one outcome here that is actively embarrassing.
 */
export function planDrafts(targets: PitchCandidate[]): DraftPlan {
  const plan: DraftPlan = { ready: [], skipped: [] }

  for (const t of targets) {
    const body = t.pitchDraft?.trim()
    const to = t.contactEmail?.trim()
    if (t.status && t.status !== 'draft_ready') {
      plan.skipped.push({ id: t.id, name: t.name, reason: 'already pitched' })
    } else if (!body) {
      plan.skipped.push({ id: t.id, name: t.name, reason: 'no pitch drafted' })
    } else if (!to) {
      plan.skipped.push({ id: t.id, name: t.name, reason: 'no contact address' })
    } else {
      plan.ready.push({ id: t.id, name: t.name, to, subject: subjectFor(t.name), body })
    }
  }
  return plan
}
