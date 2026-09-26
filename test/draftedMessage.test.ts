import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { depersonalise, splitDraftedMessage } from '../shared/reviewParse'

/**
 * A message the agent drafted is its own element, with a copy button — never a
 * sentence inside "Why it fits".
 *
 * The Review screen already lifted it out; the Gigs row printed the note whole,
 * so the one part you act on was buried in the reasoning. The fixture is the
 * production note that showed it.
 */
const LISTENING_ROOM =
  'Eastern Manitoba listening room in the 117-year-old St. John\'s Heritage Church, ~100km / ~1.25hrs from ' +
  'Winnipeg. Features a new MB/Canadian artist every three weeks in a quiet, seated, acoustic-first room — ' +
  'strong match for solo vocals-and-guitar, easy driving distance. No online application — booking runs through ' +
  'their Facebook page or the Lac du Bonnet & District Historical Society. Submission status: NOT sent. No form ' +
  'to fill — needs a direct message. Drafted outreach message ready for Doug to send via Facebook Messenger: ' +
  '"Hi hi! I\'m Doug McArthur, a Winnipeg singer-songwriter — solo vocals and guitar, no band. Be cool to come ' +
  'play The Listening Room sometime. Here\'s a recent show if you wanna get a feel for it: ' +
  'https://www.youtube.com/watch?v=UQ7XRTWmfyA. Links to everything else here: https://links.dougmcarthur.net. ' +
  'Lemme know if there\'s a date that\'d work!"'

describe('the drafted message, split out of a note', () => {
  const { message, rest } = splitDraftedMessage(LISTENING_ROOM)

  it('lifts the message out verbatim, with the channel it is for', () => {
    expect(message?.body).toMatch(/^Hi hi! I'm Doug McArthur/)
    expect(message?.body).toMatch(/Lemme know if there's a date that'd work!$/)
    expect(message?.channel).toBe('via Facebook Messenger')
  })

  it('leaves the reasoning, without the message or its lead-in', () => {
    expect(rest).toContain('strong match for solo vocals-and-guitar')
    expect(rest).toContain('needs a direct message.')
    expect(rest).not.toContain('Hi hi!')
    expect(rest).not.toMatch(/Drafted outreach message/)
  })

  it('leaves a note with no message alone', () => {
    expect(splitDraftedMessage('A quiet room, easy drive.')).toEqual({ message: null, rest: 'A quiet room, easy drive.' })
  })

  it('keeps the message in the first person — it is what gets sent', () => {
    // The reasoning is rewritten into "you"; the message must never be. This
    // is the hazard, stated: run through depersonalise, the message would ask
    // an organiser to book "you".
    expect(depersonalise(message!.body)).not.toContain("I'm Doug McArthur")
    const component = readFileSync('frontend/src/components/DraftedMessage.tsx', 'utf8')
    expect(component).not.toMatch(/depersonalise\(/)
    const row = readFileSync('frontend/src/pages/gigs/GigDetail.tsx', 'utf8')
    expect(row).toContain('depersonalise(why.rest)')
    expect(row).not.toMatch(/depersonalise\(why\.message/)
  })
})

describe('the Gigs row shows it as its own element', () => {
  const row = readFileSync('frontend/src/pages/gigs/GigDetail.tsx', 'utf8')

  it('splits the note rather than printing it whole', () => {
    expect(row).toContain('splitDraftedMessage(')
    expect(row).toContain('<DraftedMessage ')
    expect(row).not.toMatch(/\{gig\.fitRationale \?\? gig\.fitNotes\}/)
  })

  it('offers a copy button, and no way to send', () => {
    const component = readFileSync('frontend/src/components/DraftedMessage.tsx', 'utf8')
    expect(component).toContain('Copy message')
    expect(component).not.toMatch(/>\s*Send\b/)
  })
})
