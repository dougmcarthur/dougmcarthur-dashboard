import { useEffect, useState } from 'react'
import { startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser'
import { api, type JoinCheck } from '../api'
import { Button } from './ui/Button'

/**
 * Redeeming an invitation.
 *
 * The third front door, and the only one that creates something. Signing in
 * proves you already have an account; the emailed code adds a device to one;
 * this brings an account into being, and does it in the same breath as the
 * first passkey — an account that exists with no credential is a state to
 * reason about and there is no reason to have one.
 *
 * It checks the invitation *before* offering a button, because the alternative
 * is a person following a month-old link, touching their authenticator, and
 * only then being told the link was dead. The refusals say what happened and
 * that the remedy is asking for another, since "invalid invitation" leaves
 * somebody staring at a screen with no next move.
 *
 * The address is shown masked. Whoever holds this link needs to know it is
 * meant for them; a link can also be forwarded or sit in a history, and a full
 * address on a page anyone with the URL can load is an address they now have.
 */
export function JoinScreen({ token, onJoined }: { token: string; onJoined: () => void }) {
  const [check, setCheck] = useState<JoinCheck | null>(null)
  /** The server's sentence about why this link is dead. Null while it may not be. */
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    api.auth
      .joinCheck(token)
      .then((result) => live && setCheck(result))
      .catch((err: unknown) => {
        if (!live) return
        // Every refusal the server can give already says what happened and
        // that the remedy is asking for another. Printing it verbatim beats
        // re-deriving a message from a status code.
        setRefusal(err instanceof Error ? err.message : 'We do not recognise this invitation.')
      })
    return () => {
      live = false
    }
  }, [token])

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      const { ceremony, options } = await api.auth.joinOptions(token)
      const response = await startRegistration({
        optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
      })
      await api.auth.joinVerify({ token, ceremony, response })
      onJoined()
    } catch (err) {
      // A cancelled prompt is not a failure worth a red box — you closed it on
      // purpose, and the invitation is still good because it is spent only
      // when a credential actually lands.
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(/NotAllowedError|abort|cancel/i.test(message) ? null : message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-[0.14em] uppercase text-faint">Sun Dogs Music</p>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">Scout</h1>
          <p className="text-sm text-muted">
            {refusal
              ? 'This invitation cannot be used.'
              : check === null
                ? 'Checking your invitation…'
                : 'You have been invited. Set up a passkey and your account is live.'}
          </p>
        </div>

        <div className="rounded-xl border border-line bg-surface shadow-card p-5 space-y-4">
          {check === null && !refusal && <div className="h-20 bg-sunken rounded-md animate-pulse" />}

          {refusal && (
            <>
              <p className="text-sm text-body">{refusal}</p>
              <a
                className="text-xs text-muted hover:text-ink transition-colors underline underline-offset-2"
                href="#overview"
              >
                Go to the sign-in screen
              </a>
            </>
          )}

          {check && (
            <>
              <div className="space-y-1">
                {check.displayName && (
                  <p className="text-sm font-semibold text-ink">{check.displayName}</p>
                )}
                <p className="text-xs text-muted">
                  Invited as <span className="text-body">{check.email}</span>
                </p>
              </div>

              <Button
                variant="primary"
                size="md"
                className="w-full py-2"
                disabled={busy}
                onClick={join}
              >
                {busy ? 'Waiting for your device…' : 'Set up a passkey'}
              </Button>

              <p className="text-xs text-muted">
                Your device asks for Touch ID, Face ID or your screen lock. Nothing is typed and
                nothing is emailed. This link works once.
              </p>
            </>
          )}

          {error && (
            <p className="text-xs text-danger-fg bg-danger-bg rounded-md px-3 py-2">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
