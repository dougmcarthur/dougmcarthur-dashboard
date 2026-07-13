import { describe, it, expect } from 'vitest'
import { decodeBase64, extractPlainText } from '../src/lib/gmail'

// Gmail returns bodies as URL-safe base64.
function b64url(s: string): string {
  return Buffer.from(s, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

describe('decodeBase64', () => {
  it('decodes URL-safe base64 with UTF-8 characters', () => {
    const input = 'Hello — café ☕ and a URL-safe payload_+/'
    expect(decodeBase64(b64url(input))).toBe(input)
  })
})

describe('extractPlainText', () => {
  it('reads a single-part text body', () => {
    const payload = { headers: [], body: { data: b64url('plain body') } }
    expect(extractPlainText(payload as never)).toBe('plain body')
  })

  it('prefers the text/plain part of a multipart payload', () => {
    const payload = {
      headers: [],
      parts: [
        { mimeType: 'text/html', body: { data: b64url('<p>html</p>') } },
        { mimeType: 'text/plain', body: { data: b64url('the plain part') } },
      ],
    }
    expect(extractPlainText(payload as never)).toBe('the plain part')
  })

  it('recurses into nested multipart parts', () => {
    const payload = {
      headers: [],
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [{ mimeType: 'text/plain', body: { data: b64url('nested plain') } }],
        },
      ],
    }
    expect(extractPlainText(payload as never)).toBe('nested plain')
  })

  it('returns empty string when no text/plain part exists', () => {
    const payload = {
      headers: [],
      parts: [{ mimeType: 'text/html', body: { data: b64url('<p>only html</p>') } }],
    }
    expect(extractPlainText(payload as never)).toBe('')
  })
})
