import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { withConfirmation } from '../confirmIdentity'
import { Button } from './ui/Button'

/**
 * The way in to the oversight surface, on the Settings screen.
 *
 * Rendered only for an owner, and that is a courtesy rather than the lock —
 * `POST /api/auth/mode` checks the role itself and answers *not found* to
 * anyone else, because whether this deployment has an oversight surface at all
 * is not a fact an artist's session is entitled to confirm. A hidden button is
 * still a URL.
 *
 * Entering costs a passkey touch, which `withConfirmation` supplies when the
 * server asks. That is the one thing a separate owner account would have
 * bought that a mode does not — credential separation — so it is bought here
 * instead: a stolen session cookie cannot reach this surface without the
 * authenticator in somebody's hand.
 *
 * Leaving costs nothing, and is on the header rather than here, because it has
 * to be reachable from the surface you are leaving.
 */
export function AdminModeCard() {
  const [error, setError] = useState<string | null>(null)

  const enter = useMutation({
    mutationFn: () => withConfirmation(() => api.auth.setMode('admin')),
    onSuccess: () => {
      setError(null)
      // A full reload rather than a cache invalidation. Every query in the
      // cache was fetched on the artist surface and every one of them would
      // 403 on the next refetch, which is the app working correctly and
      // looking broken. The surfaces are separate; so is the page load.
      window.location.assign('#admin')
      window.location.reload()
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Could not switch to admin mode'
      setError(/NotAllowedError|abort|cancel/i.test(message) ? null : message)
    },
  })

  return (
    <div className="bg-surface border border-line rounded-xl shadow-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-ink">Admin mode</h3>
        <p className="text-xs text-muted mt-0.5">
          Who is on the platform and what their accounts cost. It is a separate screen, not
          a bigger version of this one — while you are in it, your own gigs, replies and
          drafts are out of reach, and so is everybody else&rsquo;s work.
        </p>
      </div>

      <Button variant="neutral" onClick={() => enter.mutate()} disabled={enter.isPending}>
        {enter.isPending ? 'Confirming…' : 'Switch to admin mode'}
      </Button>

      {error && <p className="text-sm text-danger-fg">{error}</p>}
      <p className="text-xs text-faint">
        Asks for your passkey, and lasts until you switch back.
      </p>
    </div>
  )
}
