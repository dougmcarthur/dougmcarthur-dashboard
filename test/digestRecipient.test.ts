import { describe, it, expect } from 'vitest'
import { readDigestSettings, writeSetting, DIGEST_KEYS, DIGEST_DEFAULTS } from '../src/lib/settings'
import { sqliteD1 } from './support/sqliteD1'

/**
 * Where the owner's digest goes when nobody has said.
 *
 * It used to be a person's address written into the defaults, which worked for
 * one deployment and would have mailed a stranger's inbox on any other. The
 * default is configuration now: the deployment's own recovery address, or
 * nothing.
 */
describe('the digest recipient', () => {
  it('is the deployment\'s own address until somebody sets one', async () => {
    const { d1 } = sqliteD1()
    const env = { DB: d1, AUTH_EMAIL: ' owner@example.test ' } as never
    expect((await readDigestSettings(env)).recipient).toBe('owner@example.test')
  })

  it('is what was set, once somebody sets one', async () => {
    const { d1 } = sqliteD1()
    const env = { DB: d1, AUTH_EMAIL: 'owner@example.test' } as never
    await writeSetting(env, DIGEST_KEYS.recipient, 'someone-else@example.test')
    expect((await readDigestSettings(env)).recipient).toBe('someone-else@example.test')
  })

  it('is nobody when the deployment has no address either, rather than a guess', async () => {
    const { d1 } = sqliteD1()
    expect((await readDigestSettings({ DB: d1 } as never)).recipient).toBe('')
    expect(DIGEST_DEFAULTS.recipient).toBe('')
  })
})
