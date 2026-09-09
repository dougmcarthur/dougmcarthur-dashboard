import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser'
import { api } from '../api'
import { Button } from './ui/Button'
import { relativeTime, shortDate } from '../format'

/**
 * What can sign in, and what it would cost to lose each one.
 *
 * The screen exists for the question a list of passkeys is really asked:
 * *which of these still exists?* A revoked laptop and a phone you traded in
 * are indistinguishable from a row that just says "Passkey", which is why
 * each one is named after the browser that registered it and dated by when it
 * last signed in.
 *
 * `backedUp` is the other half. A passkey synced to a keychain survives the
 * device; one bound to a single machine does not, and the difference is
 * exactly the difference between "I lost my laptop" and "I lost my only way
 * in". Adding a second passkey from here is the answer, and it needs no
 * emailed code — you are already signed in, which is a stronger claim than
 * the code makes.
 */
export function PasskeysCard() {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const passkeys = useQuery({ queryKey: ['auth', 'passkeys'], queryFn: api.auth.passkeys })

  const add = useMutation({
    mutationFn: async () => {
      const { ceremony, options } = await api.auth.registerOptions({})
      const response = await startRegistration({
        optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
      })
      return api.auth.registerVerify({ ceremony, response })
    },
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: ['auth'] })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Could not add a passkey'
      setError(/NotAllowedError|abort|cancel/i.test(message) ? null : message)
    },
  })

  const revoke = useMutation({
    mutationFn: (id: string) => api.auth.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth'] }),
  })

  // Both reload rather than clearing the query cache, because the page you
  // are on was rendered for somebody who is now signed out — and a reload is
  // the one refresh that cannot leave a stale panel behind.
  const signOut = useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => window.location.reload(),
  })

  const signOutEverywhere = useMutation({
    mutationFn: () => api.auth.logoutEverywhere(),
    onSuccess: () => window.location.reload(),
  })

  const items = passkeys.data?.items ?? []
  const onlyOne = items.length === 1

  return (
    <div className="rounded-xl border border-line bg-surface shadow-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Passkeys</h2>
          <p className="text-xs text-muted mt-0.5">
            What can sign in to this dashboard. Cloudflare Access and the emailed login code are
            gone; a code now only ever adds a passkey.
          </p>
        </div>
        <Button variant="primary" className="shrink-0 whitespace-nowrap" disabled={add.isPending} onClick={() => add.mutate()}>
          {add.isPending ? 'Waiting…' : 'Add a passkey'}
        </Button>
      </div>

      {passkeys.isLoading ? (
        <div className="h-16 bg-sunken rounded-lg animate-pulse" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">
          None registered. That leaves the emailed setup code as the only way in.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((key) => (
            <li key={key.id} className="py-2.5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-ink truncate">
                  {key.label}
                  {key.current && <span className="text-xs text-muted"> · this browser</span>}
                </p>
                <p className="text-xs text-muted">
                  Added {shortDate(key.createdAt)}
                  {key.lastUsedAt ? ` · last used ${relativeTime(key.lastUsedAt)}` : ' · never used'}
                  {/* Said out loud rather than left as a badge, because it is
                      the fact that decides whether you need a second one. */}
                  {key.backedUp ? ' · synced to your keychain' : ' · this device only'}
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => {
                  const warning = onlyOne
                    ? 'This is the only passkey. Removing it leaves the emailed setup code as the only way back in. Remove it?'
                    : `Remove "${key.label}"? It will no longer be able to sign in.`
                  if (confirm(warning)) revoke.mutate(key.id)
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-danger-fg bg-danger-bg rounded-md px-3 py-2">{error}</p>}

      <div className="pt-1 border-t border-line flex items-center justify-between gap-4">
        <p className="text-xs text-muted">
          Signing out leaves the passkeys registered — it ends the session, not the enrolment.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="quiet" size="sm" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
            Sign out
          </Button>
          <Button
            variant="quiet"
            size="sm"
            disabled={signOutEverywhere.isPending}
            onClick={() => {
              if (confirm('Sign out of every browser?')) signOutEverywhere.mutate()
            }}
          >
            Everywhere
          </Button>
        </div>
      </div>
    </div>
  )
}
