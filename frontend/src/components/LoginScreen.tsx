import { useState } from 'react'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { api, type SessionState } from '../api'
import { Button } from './ui/Button'
import { FIELD } from './ui/Field'
import { Card } from './ui/Surface'

/**
 * The front door.
 *
 * It replaced Cloudflare Access, which authenticated by emailing a six-digit
 * code and also offered "Sign in with Cloudflare" — a button that signed you
 * into the Cloudflare *account* and dropped you at `dash.cloudflare.com`
 * rather than here. Neither is offered any more.
 *
 * Email has not disappeared entirely, and the distinction is the whole design
 * of this screen: a code no longer signs you in, it lets you **add a
 * passkey**. That matters because a passkey lives on a device, and a lost
 * device would otherwise be a locked door with the key inside it. So there
 * are two paths and they are not equals — one is how you sign in, the other
 * is how you get a way to sign in.
 *
 * The address box is a **lookup key, not a destination**. The code goes to
 * the address already on file for the account it matches, and the screen says
 * the same thing whether or not anything matched — so typing somebody else's
 * address mails them, not you, and tells you nothing about whether they have
 * an account.
 */
type Mode = 'signin' | 'setup'

export function LoginScreen({ session, onSignedIn }: { session: SessionState; onSignedIn: () => void }) {
  // A deployment with no passkey yet has nothing to sign in with, so the
  // screen opens on set-up rather than on a button that can only fail.
  const [mode, setMode] = useState<Mode>(session.enrolled ? 'signin' : 'setup')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<string | null>(null)

  async function run(work: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (err) {
      // A cancelled prompt is not a failure worth a red box — you closed it
      // on purpose. Everything else is reported as it arrived.
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(/NotAllowedError|abort|cancel/i.test(message) ? null : message)
    } finally {
      setBusy(false)
    }
  }

  const signIn = () =>
    run(async () => {
      const { ceremony, options } = await api.auth.loginOptions()
      const response = await startAuthentication({
        optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
      })
      await api.auth.loginVerify({ ceremony, response })
      onSignedIn()
    })

  const sendCode = () =>
    run(async () => {
      const result = await api.auth.requestCode({ email: email.trim() })
      setSent(result.message)
    })

  const addPasskey = () =>
    run(async () => {
      const trimmed = code.trim()
      const address = email.trim()
      const { ceremony, options } = await api.auth.registerOptions({ code: trimmed, email: address })
      const response = await startRegistration({
        optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
      })
      await api.auth.registerVerify({ ceremony, response, code: trimmed, email: address })
      onSignedIn()
    })

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          {/* House mark above, product name as the heading — the same
              structure the name itself has: Scout, by Sun Dogs Music. */}
          <p className="text-xs font-medium tracking-[0.14em] uppercase text-faint">Sun Dogs Music</p>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">Scout</h1>
          <p className="text-sm text-muted">
            {mode === 'signin'
              ? 'Sign in with the passkey on this device.'
              : session.enrolled
                ? 'Add this device with a code sent to your email.'
                : 'Set up the first passkey with a code sent to your email.'}
          </p>
        </div>

        <Card pad="md" className="space-y-4">
          {mode === 'signin' ? (
            <>
              <Button variant="primary" size="md" className="w-full py-2" disabled={busy} onClick={signIn}>
                {busy ? 'Waiting for your device…' : 'Sign in with a passkey'}
              </Button>
              <p className="text-xs text-muted">
                Your device asks for Touch ID, Face ID or your screen lock. Nothing is typed and
                nothing is emailed.
              </p>
            </>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-body" htmlFor="setup-email">
                  Your account&rsquo;s email
                </label>
                <input
                  id="setup-email"
                  className={FIELD}
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button
                  variant={sent ? 'quiet' : 'primary'}
                  size="md"
                  className="w-full py-2"
                  disabled={busy || !session.recoveryAvailable || !email.includes('@')}
                  onClick={sendCode}
                >
                  {sent ? 'Send another code' : 'Email me a setup code'}
                </Button>
                {sent && <p className="text-xs text-muted">{sent}</p>}
                {!session.recoveryAvailable && (
                  <p className="text-xs text-warn-fg">
                    No email binding is configured, so a setup code cannot be sent.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-body" htmlFor="setup-code">
                  Setup code
                </label>
                <input
                  id="setup-code"
                  className={`${FIELD} tracking-[0.3em] text-center font-mono`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
                <Button
                  variant="primary"
                  size="md"
                  className="w-full py-2"
                  disabled={busy || code.trim().length !== 6 || !email.includes('@')}
                  onClick={addPasskey}
                >
                  {busy ? 'Waiting for your device…' : 'Add a passkey'}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-danger-fg bg-danger-bg rounded-md px-3 py-2">{error}</p>
          )}
        </Card>

        {/* The other path, always reachable and never the loud one. A device
            with no passkey needs the code route; a device with one should
            never be nudged towards email. */}
        <button
          className="text-xs text-muted hover:text-ink transition-colors underline underline-offset-2"
          onClick={() => {
            setMode(mode === 'signin' ? 'setup' : 'signin')
            setError(null)
          }}
        >
          {mode === 'signin'
            ? 'New device? Add a passkey with an emailed code'
            : session.enrolled
              ? 'Back to signing in with a passkey'
              : 'I already have a passkey'}
        </button>
      </div>
    </div>
  )
}
