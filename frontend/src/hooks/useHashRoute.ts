import { useEffect, useState } from 'react'

export function useHashRoute(defaultPage = 'overview') {
  const [page, setPage] = useState(() => {
    // '#gigs/42' is a deep link into the gigs page — the page is the first segment.
    const hash = window.location.hash.slice(1).split('/')[0]
    return hash || defaultPage
  })

  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.slice(1).split('/')[0]
      setPage(hash || defaultPage)
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [defaultPage])

  const navigate = (p: string) => {
    window.location.hash = p
  }

  return [page, navigate] as const
}
