import { startAuthentication } from '@simplewebauthn/browser'
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { api, ElevationRequired } from './api'

/**
 * Run an action, and if the server asks for the passkey first, ask and retry.
 *
 * The shape is try-then-elevate rather than elevate-then-try on purpose. A
 * session stays confirmed for a quarter of an hour, so the common case —
 * removing two stale credentials in a row — costs one touch, not one per
 * action. Asking up front would spend a prompt to discover something the
 * server already knows.
 *
 * Exactly one retry. If the second attempt still comes back asking, something
 * is wrong that another prompt will not fix, and a loop of authenticator
 * dialogs is how a person is trained to approve them without reading.
 */
export async function withConfirmation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (!(err instanceof ElevationRequired)) throw err
    await confirmIdentity()
    return run()
  }
}

/** The login assertion, run again, against the passkeys already enrolled. */
export async function confirmIdentity(): Promise<void> {
  const { ceremony, options } = await api.auth.elevateOptions()
  const response = await startAuthentication({
    optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
  })
  await api.auth.elevateVerify({ ceremony, response })
}
