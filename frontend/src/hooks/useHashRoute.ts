import { useEffect, useState } from 'react'

export function useHashRoute(defaultPage = 'overview') {
  const [page, setPage] = useState(() => {
    const hash = window.location.hash.slice(1)
    return hash || defaultPage
  })

  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.slice(1)
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
