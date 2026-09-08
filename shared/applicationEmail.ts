/**
 * The submission email, for opportunities that take applications by mail.
 *
 * Assembled from the artist database rather than written: every sentence here
 * is a fact already on file, and the one paragraph that cannot be a fact — why
 * *this* festival, in your words — is left as a marked gap rather than filled
 * with something plausible.
 *
 * That is the whole design. A draft that reads as finished is the one that
 * gets sent unfinished, and "we are delighted to submit for your consideration"
 * is exactly the sentence a programmer has read four hundred times this month.
 * So the gaps are visible in the body, listed separately for the screen, and
 * the draft is never described as ready.
 *
 * Pure. `today` is an argument; nothing here reads the clock.
 */

import { pickForLength, type ArtistAsset } from './artistAssets'
import { kindByKey } from './questionKinds'

export interface DraftGap {
  /** Appears verbatim in the body, so an unedited paste looks unfinished. */
  marker: string
  /** What to write there, as an instruction to yourself. */
  prompt: string
}

export interface EmailDraft {
  subject: string
  body: string
  /** Places you must write yourself. Never empty — see `WHY_GAP`. */
  gaps: DraftGap[]
  /** Question kinds the draft wanted and found nothing for. */
  missing: string[]
}

export interface DraftGig {
  name: string
  type?: string | null
  organizer?: string | null
  url?: string | null
}

/** The one paragraph that can never be assembled, and must not be faked. */
const WHY_GAP = (name: string): DraftGap => ({
  marker: '[why this one]',
  prompt: `Two or three sentences on why ${name} specifically. This is the paragraph that is read; nothing on file can write it.`,
})

function answer(assets: ArtistAsset[], questionKind: string, length: number | null): string | null {
  const picked = pickForLength(
    assets.filter((a) => a.questionKind === questionKind),
    length,
  )
  return picked?.value?.trim() || null
}

function labelFor(questionKind: string): string {
  return kindByKey(questionKind)?.label ?? questionKind
}

/**
 * A submission email, and an honest account of what is not in it.
 *
 * `missing` is not a failure — a draft with no Spotify link on file is still
 * the right draft to start from, and saying which line is absent is more use
 * than silently shipping one paragraph short.
 */
export function composeApplicationEmail(input: {
  gig: DraftGig
  assets: ArtistAsset[]
  /** Length to aim the bio at. Email bodies have no field limit, but a
   *  1,200-word biography pasted into a submission is its own kind of no. */
  bioLength?: number
}): EmailDraft {
  const { gig } = input
  const live = input.assets.filter((a) => !a.archived && a.value)
  const gaps: DraftGap[] = []
  const missing: string[] = []

  const want = (kind: string, length: number | null): string | null => {
    const found = answer(live, kind, length)
    if (!found) missing.push(labelFor(kind))
    return found
  }

  const artistName = want('artist_name', 120)
  const oneLiner = want('one_liner', 200)
  const bio = want('bio', input.bioLength ?? 900)
  const hometown = answer(live, 'hometown', 120)
  const genre = answer(live, 'genre', 120)

  const links: string[] = []
  for (const kind of ['website', 'youtube', 'spotify', 'bandcamp', 'epk'] as const) {
    const url = answer(live, kind, null)
    if (url) links.push(`${labelFor(kind).replace(/ link$/, '')}: ${url}`)
  }
  if (links.length === 0) missing.push('Links')

  const contactName = answer(live, 'contact_name', 120)
  const email = answer(live, 'email', 120)
  const phone = answer(live, 'phone', 60)

  const who = artistName ?? '[artist name]'
  if (!artistName) {
    gaps.push({ marker: '[artist name]', prompt: 'No artist name on file — add one to the artist database.' })
  }

  const subject = `${gig.type ? `${titleCase(gig.type)} submission` : 'Submission'} — ${who} — ${gig.name}`

  const greeting = gig.organizer ? `Hello ${gig.organizer},` : 'Hello,'

  const opening = oneLiner
    ? `I'm writing to apply to ${gig.name}. ${who} is ${lowerFirst(oneLiner)}`
    : `I'm writing to apply to ${gig.name}.`
  if (!oneLiner) {
    gaps.push({
      marker: '[one line]',
      prompt: 'No one-line description on file. Add one to the artist database — every application asks for it.',
    })
  }

  const why = WHY_GAP(gig.name)
  gaps.push(why)

  const facts = [hometown && `Based in ${hometown}`, genre && `${titleCase(genre)}`]
    .filter(Boolean)
    .join(' · ')

  const paragraphs = [
    greeting,
    oneLiner ? opening : `${opening} [one line]`,
    why.marker,
    bio ?? '[bio — nothing on file]',
    facts || null,
    links.length ? `Links\n${links.map((l) => `  ${l}`).join('\n')}` : null,
    gig.url ? `Listing: ${gig.url}` : null,
    'Thank you for your time.',
    [contactName, email, phone].filter(Boolean).join('\n') || '[contact details — nothing on file]',
  ].filter((p): p is string => Boolean(p))

  if (!bio) gaps.push({ marker: '[bio — nothing on file]', prompt: 'No bio on file at any length.' })
  if (!contactName && !email) {
    gaps.push({
      marker: '[contact details — nothing on file]',
      prompt: 'No contact name, email or phone on file. An application nobody can answer is not an application.',
    })
  }

  return { subject, body: paragraphs.join('\n\n'), gaps, missing }
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** "A folk duo…" reads wrong mid-sentence; "a folk duo…" reads right. */
function lowerFirst(value: string): string {
  // Left alone when the second character is also upper case — an acronym, or
  // a name, and lower-casing "CBC Radio 2 favourite" would be worse than the
  // capital it is fixing.
  if (/^[A-Z][A-Z]/.test(value)) return value
  return value.charAt(0).toLowerCase() + value.slice(1)
}
