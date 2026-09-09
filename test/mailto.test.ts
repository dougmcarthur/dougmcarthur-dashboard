import { describe, it, expect } from 'vitest'
import { HANDLER_BUDGET, buildMailUrl, draftAsText, mailLinks } from '../shared/mailto'

const short = { to: 'music@example.com', subject: 'Sync pitch — Magic', body: 'Hello,\n\nA short note.\n\nDoug' }

describe('buildMailUrl', () => {
  it('puts the recipient, subject and body where each handler wants them', () => {
    expect(buildMailUrl('mailto', short)).toMatch(/^mailto:music%40example\.com\?subject=.+&body=.+$/)
    const gmail = buildMailUrl('gmail', short)
    expect(gmail.startsWith('https://mail.google.com/mail/?view=cm&fs=1&to=')).toBe(true)
  })

  it('encodes a newline as CRLF, not as a bare LF', () => {
    // %0A alone is what encodeURIComponent produces and what some clients
    // render as one run-on paragraph. The RFC wants %0D%0A.
    expect(buildMailUrl('mailto', short)).toContain('%0D%0A')
    expect(buildMailUrl('mailto', short)).not.toMatch(/(?<!%0D)%0A/)
  })

  it("encodes the characters encodeURIComponent leaves behind", () => {
    // !'()* are legal in a URI but some mail clients read them as delimiters,
    // which truncates a pitch at the first apostrophe.
    const url = buildMailUrl('mailto', { ...short, body: "Doug's (new) single!" })
    for (const ch of ["'", '(', ')', '!']) expect(url).not.toContain(ch)
    expect(url).toContain('%27')
  })

  it('tolerates a missing recipient rather than writing "undefined"', () => {
    const url = buildMailUrl('mailto', { subject: 'x', body: 'y' })
    expect(url.startsWith('mailto:?')).toBe(true)
  })
})

describe('mailLinks', () => {
  it('offers both handlers for an ordinary pitch', () => {
    const links = mailLinks(short)
    expect(links.every((l) => l.fits)).toBe(true)
    expect(links.every((l) => typeof l.href === 'string')).toBe(true)
  })

  it('withholds the href when the draft will not fit', () => {
    // The failure this exists for: over the ceiling a mailto click does
    // nothing at all — no client, no error. A button that silently does
    // nothing is worse than no button, so there is no href to click.
    const huge = { ...short, body: 'x'.repeat(HANDLER_BUDGET.gmail + 500) }
    const links = mailLinks(huge)
    for (const link of links) {
      expect(link.fits, link.handler).toBe(false)
      expect(link.href, link.handler).toBeUndefined()
    }
  })

  it('still reports the handler so the screen can say why it is missing', () => {
    // "Too long to open in your mail client" is a useful sentence. A button
    // that quietly vanished is not.
    const huge = { ...short, body: 'x'.repeat(5000) }
    const [mailto] = mailLinks(huge)
    expect(mailto.handler).toBe('mailto')
    expect(mailto.length).toBeGreaterThan(mailto.budget)
  })

  it('lets Gmail carry a pitch that mailto cannot', () => {
    // The reason both are offered: a 2,500-character pitch is ordinary, and
    // it is over the mailto ceiling and under Gmail's.
    const medium = { ...short, body: 'word '.repeat(500) }
    const [mailto, gmail] = mailLinks(medium)
    expect(mailto.fits).toBe(false)
    expect(gmail.fits).toBe(true)
  })

  it('measures the encoded length, not the source length', () => {
    // Every newline triples and every accent multiplies. A body that looks
    // like it fits can be half again as long once encoded.
    const body = 'é\n'.repeat(400)
    const [mailto] = mailLinks({ ...short, body })
    expect(mailto.length).toBeGreaterThan(body.length * 2)
  })
})

describe('draftAsText', () => {
  it('is the fallback that is never withheld', () => {
    expect(draftAsText(short)).toBe('Sync pitch — Magic\n\nHello,\n\nA short note.\n\nDoug')
  })
})
