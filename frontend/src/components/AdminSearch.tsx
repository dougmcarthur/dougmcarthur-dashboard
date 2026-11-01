import { useEffect, useId, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { useAppearance } from '../hooks/useAppearance'
import { InfoToggle } from './ui/Explainer'
import { Input } from './ui/Field'

/**
 * Search, as the field at the top of the admin pages and not a page of its own.
 *
 * It was a row in the list of pages that opened a page with a box on it, which
 * made you go somewhere to find something. It is the box now, above the pages
 * the way a search field sits above the list in the iOS Settings app, and what it
 * finds appears under it. One box over artists, requests, feedback, external
 * data sources and landing page listings, and each hit links to the page it
 * lives on.
 *
 * Results float under the field rather than replace what is below, because
 * beside the sidebar the pages are still the thing you are looking at, and the
 * panel closes on Escape, on a click elsewhere and on choosing a hit. What the
 * search covers is the field's own note behind the info icon, as every
 * explanation here is.
 */
export function AdminSearch() {
  const [typed, setTyped] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(true)
  const [noteOpen, setNoteOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const noteId = useId()
  const { appearance } = useAppearance()

  useEffect(() => {
    const t = window.setTimeout(() => setQ(typed.trim()), 300)
    return () => window.clearTimeout(t)
  }, [typed])

  // A click anywhere else puts the results away without losing the words, so
  // coming back to the field shows them again.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const found = useQuery({
    queryKey: ['admin', 'search', q],
    queryFn: () => api.admin.search(q),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  })
  const groups = q.length >= 2 ? (found.data?.groups ?? []) : []
  const showing = open && typed.trim().length >= 2 && q.length >= 2

  const clear = () => {
    setTyped('')
    setQ('')
  }

  return (
    <div ref={box} className="relative">
      <div className="flex items-center gap-3">
        <label className="sr-only" htmlFor="admin-search">
          Search the admin
        </label>
        <Input
          id="admin-search"
          type="search"
          autoComplete="off"
          placeholder="Search"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') clear()
          }}
        />
        {appearance.showHints && (
          <InfoToggle open={noteOpen} onClick={() => setNoteOpen((o) => !o)} controls={noteId} name="search" className="ml-1" />
        )}
      </div>

      {appearance.showHints && noteOpen && (
        <p id={noteId} className="mt-2 text-xs leading-relaxed text-muted">
          Looks in artist names, requests to join, feedback, external data sources and landing page listings. It finds
          names and wording, never anybody&rsquo;s work.
        </p>
      )}

      {showing && (
        <div
          role="region"
          aria-label="Search results"
          aria-live="polite"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-pop lg:right-auto lg:w-[26rem]"
        >
          {found.error ? (
            <p className="px-4 py-3 text-sm text-danger-fg">Could not search: {(found.error as Error).message}</p>
          ) : found.isLoading ? (
            <p className="px-4 py-3 text-sm text-muted">Searching…</p>
          ) : groups.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Nothing matches that.</p>
          ) : (
            groups.map((g) => (
              <div key={g.section} className="py-1">
                <p className="px-4 pb-1 pt-2 text-xs font-semibold text-muted">{g.label}</p>
                {g.hits.map((h) => (
                  <a
                    key={h.id}
                    href={`#admin/${g.section}`}
                    onClick={clear}
                    className="block truncate px-4 py-2 text-sm text-ink transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                  >
                    {h.text}
                  </a>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
