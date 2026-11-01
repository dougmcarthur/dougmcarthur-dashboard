import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { Input } from './ui/Field'
import { SectionHeader } from './ui/SectionHeader'
import { Banner, Card } from './ui/Surface'

/** One box over artists, requests, feedback, sources and listings. Each group links to the page it lives on. */
export function AdminSearch() {
  const [typed, setTyped] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = window.setTimeout(() => setQ(typed.trim()), 300)
    return () => window.clearTimeout(t)
  }, [typed])

  const found = useQuery({
    queryKey: ['admin', 'search', q],
    queryFn: () => api.admin.search(q),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  })
  const groups = q.length >= 2 ? (found.data?.groups ?? []) : []

  return (
    <section className="space-y-4">
      <SectionHeader title="Search">
        Looks in artist names, requests to join, feedback, external data sources and landing page listings. It finds
        names and wording, never anybody&rsquo;s work.
      </SectionHeader>
      <label className="sr-only" htmlFor="admin-search">
        Search the admin
      </label>
      <Input
        id="admin-search"
        type="search"
        autoFocus
        autoComplete="off"
        placeholder="Search by name, address or wording"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="max-w-md"
      />
      {found.error && <Banner>Could not search: {(found.error as Error).message}</Banner>}
      {q.length >= 2 && !found.isLoading && groups.length === 0 && <p className="text-sm text-muted">Nothing matches that.</p>}
      {groups.map((g) => (
        <Card key={g.section} className="space-y-2">
          <a className="text-sm font-semibold text-ink hover:underline" href={`#admin/${g.section}`}>
            {g.label}
          </a>
          <ul className="space-y-1 text-sm text-body">
            {g.hits.map((h) => (
              <li key={h.id} className="truncate">
                {h.text}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </section>
  )
}
