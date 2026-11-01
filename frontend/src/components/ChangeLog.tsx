import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { relativeTime } from '../format'
import { Pager, useFitPage, usePaging } from './ui/Pager'
import { SectionHeader } from './ui/SectionHeader'
import { Banner, Card, EmptyState } from './ui/Surface'

/** What was changed from admin mode, newest first. A sentence each; nothing typed into a form is kept. */
export function ChangeLog() {
  const paging = usePaging()
  const log = useQuery({
    queryKey: ['admin', 'changes', paging.page, paging.size],
    queryFn: () => api.admin.changes({ limit: paging.size, offset: (paging.page - 1) * paging.size }),
    placeholderData: keepPreviousData,
  })
  useFitPage(paging, log.data?.total)
  const items = log.data?.items ?? []

  return (
    <section className="space-y-4">
      <SectionHeader title="Change log">
        Every change made from admin mode, newest first, kept for a year. It says what was done and when, never what was
        typed, so no address or key is in it.
      </SectionHeader>
      {log.isLoading ? (
        <div className="h-16 bg-sunken rounded-xl animate-pulse" />
      ) : log.error ? (
        <Banner>Could not load the log: {(log.error as Error).message}</Banner>
      ) : items.length === 0 ? (
        <EmptyState>Nothing has been changed yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          <Card pad="none" clip>
            <ul className="divide-y divide-line">
              {items.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-2.5 text-sm">
                  <span className="text-ink">{c.summary}</span>
                  <span className="text-xs text-muted">{relativeTime(c.at)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Pager total={log.data?.total ?? 0} page={paging.page} size={paging.size} onPage={paging.setPage} onSize={paging.setSize} noun="changes" />
        </div>
      )}
    </section>
  )
}
