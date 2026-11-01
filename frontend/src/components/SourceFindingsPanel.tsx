import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, type CandidateView, type CatalogCandidateItem } from '../api'
import { PUBLIC_CATEGORIES } from '../../../shared/opportunityCatalog'
import { orderSources } from '../../../shared/sourceControls'
import { shortDate } from '../format'
import { Select } from './ui/Field'
import { Pager, useFitPage, usePaging } from './ui/Pager'
import { Banner, Card, EmptyState } from './ui/Surface'
import { Tabs } from './ui/Tabs'
import { SectionHeader } from './ui/SectionHeader'

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(PUBLIC_CATEGORIES.map((c) => [c.id, c.label]))

const VIEWS: ReadonlyArray<{ id: CandidateView; label: string }> = [
  { id: 'calls', label: 'Calls' },
  { id: 'unclear', label: 'Unclear' },
  { id: 'ignored', label: 'Ignored' },
  { id: 'past', label: 'Closed or old' },
]

const VIEW_HINT: Record<CandidateView, string> = {
  calls: 'Items whose words say something is open. This is what the next step will follow to the programme’s own page.',
  unclear: 'Mentions a grant or a showcase without saying anything is open, or is for somebody other than an artist.',
  ignored: 'What it threw away. Read this one: a rule that is missing real calls only shows up from here.',
  past: 'A deadline that has gone, or an item first seen long after it was posted.',
}

/**
 * What the external data sources turned up, a screenful at a time.
 *
 * Nothing shown is in the shared catalog. Each item is a candidate with the
 * sentence that decided its verdict, and the *Ignored* tab is there so a rule
 * that is missing real calls can be found from the side it fails on.
 *
 * The list used to stop at eighty with nothing to say there were more. The
 * count now comes from the Worker, so "of 212" is true of the database, and the
 * source filter exists because a wrong verdict is usually wrong for one site:
 * looking at what a single source threw away is how the rule gets found.
 */
export function SourceFindingsPanel() {
  const [view, setView] = useState<CandidateView>('calls')
  const [source, setSource] = useState<number | null>(null)
  const paging = usePaging()

  // The same query the sources page and the sidebar badge use.
  const sources = useQuery({ queryKey: ['admin', 'catalog', 'sources'], queryFn: api.admin.catalogSources })
  const candidates = useQuery({
    queryKey: ['admin', 'catalog', 'candidates', view, source, paging.page, paging.size],
    queryFn: () =>
      api.admin.catalogCandidates({
        view,
        limit: paging.size,
        offset: (paging.page - 1) * paging.size,
        source: source ?? undefined,
      }),
    // Keeps the rows on screen while the next page loads, so paging does not
    // blink the list away and back.
    placeholderData: keepPreviousData,
  })
  useFitPage(paging, candidates.data?.total)

  const last = sources.data?.lastPoll ?? null
  const items = candidates.data?.items ?? []
  const total = candidates.data?.total ?? 0

  return (
    <section className="space-y-4">
      <SectionHeader title="Source findings">
        What Scout found on the external data sources. These are candidates only: none of it is in the shared catalog
        until the next step has followed it to the programme’s own page.
      </SectionHeader>

      <div className="space-y-3">
        <Tabs
          label="What was found"
          tabs={VIEWS}
          active={view}
          onSelect={(next) => {
            setView(next)
            paging.setPage(1)
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="text-xs text-muted max-w-prose">{VIEW_HINT[view]}</p>
          <label className="flex items-center gap-2 text-xs text-muted">
            From
            <Select
              filter
              value={source ?? ''}
              onChange={(e) => {
                setSource(e.target.value ? Number(e.target.value) : null)
                paging.setPage(1)
              }}
              className="!py-1 !text-xs max-w-[16rem]"
            >
              <option value="">All sources</option>
              {orderSources(sources.data?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {candidates.isLoading ? (
          <div className="h-16 bg-sunken rounded-xl animate-pulse" />
        ) : candidates.error ? (
          <Banner>Could not load them: {(candidates.error as Error).message}</Banner>
        ) : items.length === 0 ? (
          <EmptyState>
            {last || source ? (
              'Nothing here.'
            ) : (
              <>
                Nothing has been read yet. Read some on the <a className="underline" href="#admin/sources">External data sources</a>{' '}
                page, or wait for tonight.
              </>
            )}
          </EmptyState>
        ) : (
          <>
            <Card pad="none" clip>
              <ul className="divide-y divide-line">
                {items.map((c) => (
                  <CandidateRow key={c.id} item={c} />
                ))}
              </ul>
            </Card>
            <Pager total={total} page={paging.page} size={paging.size} onPage={paging.setPage} onSize={paging.setSize} noun="findings" />
          </>
        )}
      </div>
    </section>
  )
}

function CandidateRow({ item: c }: { item: CatalogCandidateItem }) {
  const category = c.category ? CATEGORY_LABEL[c.category] ?? 'Other' : null
  const closes = c.deadline ? `closes ${shortDate(c.deadline)}` : c.deadlineNote ? `deadline “${c.deadlineNote}”` : null
  return (
    <li className="px-4 py-2.5 space-y-0.5">
      <p className="text-sm text-ink">
        {c.url ? (
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {c.title}
          </a>
        ) : (
          c.title
        )}
      </p>
      <p className="text-xs text-muted">
        {[c.source, category, closes, c.placeText, `found ${shortDate(c.firstSeenAt)}`].filter(Boolean).join(' · ')}
      </p>
      <p className="text-xs text-muted">{c.reason}</p>
    </li>
  )
}
