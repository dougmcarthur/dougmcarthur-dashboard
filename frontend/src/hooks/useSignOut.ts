import { useMutation } from '@tanstack/react-query'
import { api } from '../api'

/**
 * Ending this browser's session.
 *
 * One mutation for the header menu and the Settings card, so the two cannot
 * come to disagree about what signing out does.
 *
 * It reloads rather than clearing the query cache, because the page you are on
 * was rendered for somebody who is now signed out — and a reload is the one
 * refresh that cannot leave a stale panel behind.
 *
 * Signing out leaves the passkeys registered: it ends the session, not the
 * enrolment. That is why there is no confirmation. Coming back costs one
 * touch, and a prompt in front of a reversible act is one more to click through.
 */
export function useSignOut() {
  return useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => window.location.reload(),
  })
}
