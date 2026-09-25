import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { normaliseAddress, recipientAllowed, type AddressBook } from '../shared/recipients'

/**
 * The boundary that replaced the send allowlist.
 *
 * While `allowed_destination_addresses` held one address, a bug could not
 * widen who Scout mails. Now one can, so the rule is pinned from both sides:
 * what each audience may reach, and that nothing but `sendMail` touches the
 * binding — a second caller would be a send the rule never sees.
 */

const BOOK: AddressBook = {
  owner: ['owner@example.com', null],
  accounts: [null, 'Artist@Example.com '],
  liveInvites: ['invited@example.com'],
}

const allowed = (to: string, audience: 'owner' | 'account' | 'invite') =>
  recipientAllowed({ to, audience, book: BOOK })

describe('recipientAllowed', () => {
  it('sends the digest to the owner and to nobody else on file', () => {
    expect(allowed('owner@example.com', 'owner')).toBe(true)
    // An artist's address is on file, and still not somewhere the owner's
    // digest may go — otherwise an artist could redirect it to themselves.
    expect(allowed('artist@example.com', 'owner')).toBe(false)
    expect(allowed('invited@example.com', 'owner')).toBe(false)
  })

  it('sends a setup code only to an address already on an account', () => {
    expect(allowed('owner@example.com', 'account')).toBe(true)
    expect(allowed('artist@example.com', 'account')).toBe(true)
    // Invited is not an account yet: a code for it would enrol nobody.
    expect(allowed('invited@example.com', 'account')).toBe(false)
    expect(allowed('stranger@example.com', 'account')).toBe(false)
  })

  it('sends an invitation only to a live invitation', () => {
    expect(allowed('invited@example.com', 'invite')).toBe(true)
    expect(allowed('artist@example.com', 'invite')).toBe(false)
  })

  it('compares addresses without regard to case or surrounding space', () => {
    expect(allowed('  ARTIST@example.com', 'account')).toBe(true)
  })

  it('refuses what is not an address, even against a list with blanks in it', () => {
    expect(allowed('', 'account')).toBe(false)
    expect(allowed('   ', 'owner')).toBe(false)
    expect(normaliseAddress(null)).toBeNull()
    expect(normaliseAddress('nobody')).toBeNull()
  })
})

describe('the binding has one caller', () => {
  const SRC = fileURLToPath(new URL('../src', import.meta.url))
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : []
    })

  it('reaches env.EMAIL only from the mailer', () => {
    for (const file of files(SRC)) {
      if (file.endsWith(join('lib', 'mailer.ts'))) continue
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/\.EMAIL\b(?!_)/)
    }
  })

  it('checks the recipient before the binding is called', () => {
    const mailer = readFileSync(join(SRC, 'lib', 'mailer.ts'), 'utf8')
    const body = mailer.slice(mailer.indexOf('export async function sendMail'))
    expect(body.indexOf('recipientAllowed')).toBeGreaterThan(-1)
    expect(body.indexOf('recipientAllowed')).toBeLessThan(body.indexOf('binding.send'))
  })

  it('keeps the sender allowlist, the half Cloudflare still enforces', () => {
    const toml = readFileSync(fileURLToPath(new URL('../wrangler.toml', import.meta.url)), 'utf8')
    expect(toml).toMatch(/allowed_sender_addresses/)
  })
})

describe('code requests are not an account oracle', () => {
  const route = readFileSync(fileURLToPath(new URL('../src/routes/auth.ts', import.meta.url)), 'utf8')
  const start = route.indexOf("auth.post('/enrol/request'")
  const handler = route.slice(start, route.indexOf('/* ----', start))

  it('gives one answer whether or not the address matched', () => {
    // Exactly one JSON success, and the only other exit is the no-binding
    // 503, which is about the deployment rather than any address.
    expect(handler.match(/c\.json\(/g)?.length).toBe(2)
    expect(handler).toContain('CODE_REQUEST_ANSWER')
    expect(handler).not.toMatch(/maskAddress|429/)
  })

  it('mails the address on file, never the one typed', () => {
    expect(handler).toMatch(/to:\s*account\.address/)
  })
})
