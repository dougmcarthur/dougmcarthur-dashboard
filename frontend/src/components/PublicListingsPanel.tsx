import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { PUBLIC_CATEGORIES } from '../../../shared/opportunityCatalog'
import { shortDate } from '../format'
import { Input } from './ui/Field'
import { Pager, useFitPage, usePaging } from './ui/Pager'
import { Banner, Card, EmptyState } from './ui/Surface'
import { Toggle } from './ui/Toggle'
import { SectionHeader } from './ui/SectionHeader'

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(PUBLIC_CATEGORIES.map((c) => [c.id, c.label]))

/** Waits for typing to pause, so a search is one request and not one per letter. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return settled
}

/**
 * What the public landing page may show, with the switch that takes an entry
 * off it.
 *
 * The catalog publishes by rule — a public listing URL in one of the four
 * categories — and this is the owner's override. It reads the catalog only,
 * which holds listing facts and nothing any artist decided.
 *
 * It is called *Landing page listings* because that is the thing it controls.
 * "Public listings" said the same thing about the data and nothing about where
 * it appears.
 *
 * An entry that is hidden stays where it is and is drawn quietly. Moving it to
 * the bottom would make a row jump to another page the moment its switch was
 * pressed, and the point of a switch is that you can see what you did.
 */
export function PublicListingsPanel() {
  const qc = useQueryClient()
  const [typed, setTyped] = useState('')
  const q = useDebounced(typed.trim(), 300)
  const paging = usePaging()

  // A new search is a new list.
  const { setPage } = paging
  useEffect(() => setPage(1), [q, setPage])

  const listings = useQuery({
    queryKey: ['admin', 'listings', q, paging.page, paging.size],
    queryFn: () => api.admin.listings({ limit: paging.size, offset: (paging.page - 1) * paging.size, q: q || undefined }),
    placeholderData: keepPreviousData,
  })
  useFitPage(paging, listings.data?.total)

  const set = useMutation({
    mutationFn: ({ id, isPublic }: { id: number; isPublic: boolean }) => api.admin.setListingPublic(id, isPublic),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'listings'] }),
  })

  const items = listings.data?.items ?? []
  const total = listings.data?.total ?? 0

  return (
    <section className="space-y-4">
      <SectionHeader title="Landing page listings">
        The shared catalog, newest first. Entries with a public listing page in a shown category go on the landing page
        by default; switch off anything that should not. The landing page shows only open calls, ten per category.
      </SectionHeader>

      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="listing-search">
          Search listings by name or organiser
        </label>
        <Input
          id="listing-search"
          type="search"
          value={typed}
          placeholder="Search by name or organiser"
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
          className="max-w-xs"
        />
        {set.error && <Banner size="sm">{set.error instanceof Error ? set.error.message : 'Could not change that listing.'}</Banner>}
      </div>

      {listings.isLoading ? (
        <div className="h-16 bg-sunken rounded-xl animate-pulse" />
      ) : listings.error ? (
        <Banner>Could not load the listings: {(listings.error as Error).message}</Banner>
      ) : items.length === 0 ? (
        <EmptyState>{q ? 'Nothing matches that search.' : 'Nothing catalogued yet.'}</EmptyState>
      ) : (
        <div className="space-y-3">
          <Card pad="none" clip>
            <ul className="divide-y divide-line">
              {items.map((l) => {
                const category = CATEGORY_LABEL[l.category]
                const hidden = !category || !l.public
                return (
                  <li
                    key={l.id}
                    className={`px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 ${hidden ? 'bg-sunken/60' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className={`text-sm truncate ${hidden ? 'text-muted' : 'text-ink'}`}>
                        {l.url ? (
                          <a href={l.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {l.name}
                          </a>
                        ) : (
                          l.name
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        {category ? category : 'Other, never shown publicly'}
                        {l.location ? ` · ${l.location}` : ''}
                        {l.deadline ? ` · closes ${shortDate(l.deadline)}` : ''} · found {shortDate(l.firstSeenAt)}
                      </p>
                    </div>
                    {category ? (
                      <Toggle
                        checked={l.public}
                        disabled={set.isPending && set.variables?.id === l.id}
                        label={`Show ${l.name} on the landing page`}
                        stateText={{ on: 'Shown', off: 'Hidden' }}
                        onChange={(isPublic) => set.mutate({ id: l.id, isPublic })}
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </Card>
          <Pager total={total} page={paging.page} size={paging.size} onPage={paging.setPage} onSize={paging.setSize} noun="listings" />
        </div>
      )}
    </section>
  )
}
