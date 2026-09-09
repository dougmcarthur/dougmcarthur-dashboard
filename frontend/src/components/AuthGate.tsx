import { useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, UNAUTHENTICATED_EVENT } from '../api'
import { LoginScreen } from './LoginScreen'

/**
 * Nothing renders until the Worker says who is asking.
 *
 * This is a courtesy, not the lock. The lock is the middleware in
 * `src/index.ts`: every `/api` route outside `/api/auth` answers 401 without a
 * session, so a browser that skipped this component would render a dashboard
 * of failed requests rather than anyone's data. What the gate adds is that
 * the failure is a sign-in screen instead of eleven error panels.
 *
 * It listens for the 401 any screen might hit, because a session can expire
 * while the page is open and the first request to notice is arbitrary.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const session = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: api.auth.session,
    // Never served stale: this is the answer that decides whether anything
    // else on screen is worth showing.
    staleTime: 0,
    retry: false,
  })

  useEffect(() => {
    const onUnauthenticated = () => {
      qc.invalidateQueries({ queryKey: ['auth', 'session'] })
    }
    window.addEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated)
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated)
  }, [qc])

  // A blank canvas rather than a spinner or a flash of the login screen. The
  // check is one request against a cookie the browser already has, so the
  // gap is a frame or two — long enough to paint the wrong thing, too short
  // to be worth announcing.
  if (session.isLoading) return <div className="min-h-screen bg-canvas" />

  if (!session.data?.authenticated) {
    return (
      <LoginScreen
        session={
          session.data ?? {
            authenticated: false,
            label: null,
            enrolled: false,
            recoveryAvailable: false,
          }
        }
        onSignedIn={() => {
          // A reload rather than a cache invalidation, and it is not laziness.
          // Everything cached at this point was fetched as nobody — a page of
          // requests that 401'd — so the cache has to go either way, and
          // clearing it out from under the observer that decides which branch
          // renders left the screen blank: the query it was watching no longer
          // existed, so it reported "still loading" forever. Signing in is
          // once per month and a fresh document is unambiguous.
          window.location.reload()
        }}
      />
    )
  }

  return <>{children}</>
}
