import { useEffect, useState } from 'react'

/**
 * Hash routing with one optional argument: `#review/conflict` is the Review
 * page opened on its Conflicts filter.
 *
 * The argument exists so a count can link to the thing it counts. "3 items
 * contradict themselves" that drops you on an unfiltered queue makes you
 * redo the filtering the number already did.
 */
export function parseHash(hash: string, defaultPage: string): [string, string | null] {
  // The query after `?` is a message for the page — `#settings?calendar=connected`
  // is where Google's consent round trip lands — never part of the route.
  // Splitting on `/` alone read that as a page called
  // "settings?calendar=connected", which matched nothing and drew a blank
  // screen at the end of every connect.
  const [path] = hash.replace(/^#/, '').split('?')
  const [page, arg] = path.split('/')
  return [page || defaultPage, arg || null]
}

export function useHashRoute(defaultPage = 'overview') {
  const [[page, arg], setRoute] = useState(() => parseHash(window.location.hash, defaultPage))

  useEffect(() => {
    const handler = () => setRoute(parseHash(window.location.hash, defaultPage))
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [defaultPage])

  const navigate = (p: string) => {
    window.location.hash = p
  }

  return [page, navigate, arg] as const
}
