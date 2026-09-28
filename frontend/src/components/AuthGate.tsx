import { useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, UNAUTHENTICATED_EVENT } from '../api'
import { LoginScreen } from './LoginScreen'
import { JoinScreen } from './JoinScreen'
import { useHashRoute } from '../hooks/useHashRoute'
import { PublicEpkPage } from '../pages/epk/PublicEpkPage'
import { LandingPage } from '../pages/LandingPage'

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
  /**
   * The invitation token comes from the hash and nowhere else.
   *
   * A fragment is never sent to the server, never lands in an access log and
   * never appears in a `Referer` header — which is exactly what a credential in
   * a URL needs. The client reads it and POSTs it in a body.
   *
   * Read through the router hook rather than off `location` directly, so that
   * leaving the join screen is a hash change like any other rather than a link
   * that changes the URL and re-renders nothing.
   */
  const [page, , arg] = useHashRoute('overview')
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
  // A shared EPK is for people who will never sign in, so it is answered
  // before the session is — signed in or not, the link shows the same page.
  if (page === 'epk' && arg) return <PublicEpkPage token={arg} />

  if (session.isLoading) return <div className="min-h-screen bg-canvas" />

  if (!session.data?.authenticated) {
    // An invitation is checked before the sign-in screen is offered, because
    // somebody following one has no account to sign in to yet. Only while
    // signed out: a link opened in a browser that is already somebody else's
    // session should not quietly enrol a second account into it.
    if (page === 'join' && arg) {
      return (
        <JoinScreen
          token={arg}
          onJoined={() => {
            // The hash goes first. A reload that kept `#join/…` would land on a
            // route the signed-in app does not have, and the token would sit in
            // the address bar of an account it has already been spent on.
            window.location.assign('#overview')
            window.location.reload()
          }}
        />
      )
    }

    // A stranger sees what Scout is; somebody who has signed in on this
    // browser before sees the sign-in screen, as they always have. Either can
    // reach the other: the landing page has Sign in, and `#welcome` shows the
    // landing page to anybody.
    const showLanding = page === 'welcome' || (page !== 'signin' && !hasSignedInHere())
    if (showLanding) {
      return <LandingPage onSignIn={() => (window.location.hash = 'signin')} />
    }

    return (
      <LoginScreen
        session={
          session.data ?? {
            authenticated: false,
            label: null,
            role: null,
            mode: 'artist',
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
          //
          // `#signin` and `#welcome` are signed-out routes the app does not
          // have, so they are swapped for the Overview first.
          if (page === 'signin' || page === 'welcome') window.location.assign('#overview')
          window.location.reload()
        }}
      />
    )
  }

  rememberSignedInHere()
  return <>{children}</>
}

/**
 * Whether this browser has been signed in before, so an expired session goes
 * back to the sign-in screen rather than to a page explaining the product.
 * A convenience only: storage that is refused or cleared shows the landing
 * page, which has Sign in at the top.
 */
const RETURNING_KEY = 'scout.signedInHere'

function hasSignedInHere(): boolean {
  try {
    return localStorage.getItem(RETURNING_KEY) === '1'
  } catch {
    return false
  }
}

function rememberSignedInHere() {
  try {
    localStorage.setItem(RETURNING_KEY, '1')
  } catch {
    // Nothing to do: see hasSignedInHere.
  }
}
