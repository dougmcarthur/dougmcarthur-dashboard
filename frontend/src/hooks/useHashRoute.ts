import { useEffect, useState } from 'react'

/**
 * Hash routing with one optional argument: `#review/conflict` is the Review
 * page opened on its Conflicts filter.
 *
 * The argument exists so a count can link to the thing it counts. "3 items
 * contradict themselves" that drops you on an unfiltered queue makes you
 * redo the filtering the number already did.
 */
function parse(hash: string, defaultPage: string): [string, string | null] {
  const [page, arg] = hash.replace(/^#/, '').split('/')
  return [page || defaultPage, arg || null]
}

export function useHashRoute(defaultPage = 'overview') {
  const [[page, arg], setRoute] = useState(() => parse(window.location.hash, defaultPage))

  useEffect(() => {
    const handler = () => setRoute(parse(window.location.hash, defaultPage))
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [defaultPage])

  const navigate = (p: string) => {
    window.location.hash = p
  }

  return [page, navigate, arg] as const
}
