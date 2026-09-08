import { describe, it, expect } from 'vitest'
import { classifyReply, stripQuoted, sentences } from '../shared/replyClassify'

/**
 * Fixtures are real replies from the mailbox this app reads, quoted from the
 * organiser's own prose. That matters more here than anywhere else in the
 * suite: the plan for this phase assumed rejections say "unfortunately" and
 * that a question mark means information is being asked for, and the real mail
 * says otherwise in both cases.
 *
 * Personal details are trimmed — nothing here needs Doug's phone number.
 */

const LIELOW_DECLINED = `Hey there,

Thank you so much for sending your music our way and thinking of LieLow

We spend a lot of time in the LieLow Laboratory listening through submissions, and it's always a privilege to step into the worlds artists are creating.

With a limited number of spots on the lineup each year, we're not able to bring every artist we connect with out to Milo.

While we won't be moving forward with your project for this year's festival, please know this decision is never an easy one and isn't a reflection of the quality of your music.

We'd love to stay connected. LieLow is always evolving, and each year opens up new possibilities to work together

With big love,
LieLow Music Fest

On Jan 26, 2026, at 7:24 PM, Squarespace <form-submission@squarespace.info> wrote:

Form Submission - New Form

*Message:* Hi! I'm a singer songwriter from Manitoba, looking to perform as a solo artist.

Sent via form submission from *LieLow Music Fest*`

const HIGHLANDS_ACK = `Hi there,

Thank you so much for submitting an artist application for Highlands Music Festival 2026.

We've been honestly overwhelmed (in the best way) by the response this year. We received over 1,500 artist submissions for fewer than 19 available spots, and our team is working through everything thoughtfully.

We wanted to send a courtesy update to let you know that if you don't hear from us by June, it means we weren't able to make it work this year.

If you're interested in attending as a guest, feel free to reply to this email and we're happy to share a discount code.

Thanks again for your submission.`

const VOYAGEUR_INVITE = `Hey Doug

Hope you are doing well. Thanks for taking the time to apply.

Wondering if you are available/interested to do an acoustic set on Feb 21 st in our mobile concert trailer at 4 pm for FDV? Budget is below.`

const BOW_DECLINED = `Hi Doug,

Thank you so much for applying for Manitoba Music's Road to BreakOut West Showcase. Your submission was not selected for this opportunity, but we very much appreciate the time and energy that went into it.`

const FOTR_ACK = `Hello,

Thank you so much for applying to play Folk On The Rocks 2026! Please note that only those selected will be contacted, but we thank you for your interest in playing FOTR and hope to see you soon.`

describe('a rejection that never says "unfortunately"', () => {
  it('reads LieLow as declined, not as the thank-you it opens with', () => {
    const c = classifyReply(LIELOW_DECLINED)
    expect(c.kind).toBe('declined')
    expect(c.proposes).toBe('declined')
    expect(c.evidence).toContain("won't be moving forward")
  })

  it('is not thrown by "We’d love to stay connected"', () => {
    // The invite patterns are deliberately "love to have you", never "love to"
    // — a rejection that stays warm is the normal kind.
    expect(classifyReply(LIELOW_DECLINED).scores.invited).toBe(0)
  })

  it('reads the Road to BreakOut West rejection the same way', () => {
    const c = classifyReply(BOW_DECLINED)
    expect(c.kind).toBe('declined')
    expect(c.evidence).toContain('was not selected')
  })
})

describe('an acknowledgement carrying a conditional rejection', () => {
  const c = classifyReply(HIGHLANDS_ACK)

  it('is an acknowledgement, because a condition is not a decision', () => {
    // "if you don't hear from us by June, it means we weren't able to make it
    // work" contains a rejection phrase and is not a rejection.
    expect(c.kind).toBe('acknowledged')
    expect(c.scores.declined).toBe(0)
  })

  it('surfaces the date silence turns into a no', () => {
    expect(c.notes.join(' ')).toContain('June')
    expect(c.notes.join(' ')).toContain('becomes a no')
  })

  it('does not read "feel free to reply" as a request for information', () => {
    expect(c.scores.info_requested).toBe(0)
  })
})

describe('an invitation phrased as a question', () => {
  const c = classifyReply(VOYAGEUR_INVITE)

  it('is an invitation, not a request for information', () => {
    expect(c.kind).toBe('invited')
    expect(c.proposes).toBe('invited')
    expect(c.evidence).toContain('available/interested')
  })
})

describe('a form receipt', () => {
  it('is an acknowledgement and proposes nothing stronger', () => {
    const c = classifyReply(FOTR_ACK)
    expect(c.kind).toBe('acknowledged')
    expect(c.proposes).toBe('acknowledged')
  })
})

describe('quoted material', () => {
  it('is cut before the reply is read', () => {
    const top = stripQuoted(LIELOW_DECLINED)
    expect(top).toContain("won't be moving forward")
    // The artist's own words, quoted back — classifying on them would be
    // reading your own application as the organiser's answer.
    expect(top).not.toContain('singer songwriter from Manitoba')
  })

  it('cuts at a plain > quote too', () => {
    expect(stripQuoted('Yes please.\n> original message here')).toBe('Yes please.')
  })

  it('splits sentences on newlines as well as full stops', () => {
    expect(sentences('One. Two\nThree')).toEqual(['One.', 'Two', 'Three'])
  })
})

describe('when it cannot tell', () => {
  it('says unclear rather than picking, and proposes nothing', () => {
    const c = classifyReply('We regret that the main stage is full, but we would love to have you on the workshop stage.')
    expect(c.kind).toBe('unclear')
    expect(c.proposes).toBeNull()
    expect(c.notes.join(' ')).toContain('worth reading yourself')
  })

  it('says unclear on a message that matches nothing', () => {
    const c = classifyReply('Hi Doug, great to meet you at the conference last week.')
    expect(c.kind).toBe('unclear')
    expect(c.evidence).toBeNull()
  })
})
