import { useQuery } from '@tanstack/react-query'
import { api, type SessionState } from '../api'

/**
 * The session, from the cache `AuthGate` already filled.
 *
 * Same query key, so this is a read of what the gate fetched rather than a
 * second request — and it is the answer that decides which *surface* renders,
 * which is a decision the shell has to make before any page mounts.
 */
export function useSession(): SessionState | undefined {
  return useQuery({ queryKey: ['auth', 'session'], queryFn: api.auth.session, staleTime: 0, retry: false })
    .data
}
