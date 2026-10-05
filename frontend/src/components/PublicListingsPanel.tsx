import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { PUBLIC_CATEGORIES } from '../../../shared/opportunityCatalog'
import { shortDate } from '../format'
import { Button } from './ui/Button'
import { Explainer } from './ui/Explainer'
import { Card } from './ui/Surface'

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(PUBLIC_CATEGORIES.map((c) => [c.id, c.label]))

/**
 * What the public page may show, with the switch that takes an entry off it.
 *
 * The catalog publishes by rule — a public listing URL in one of the four
 * categories — and this is the owner's override. It reads the catalog only,
 * which holds listing facts and nothing any artist decided.
 */
export function PublicListingsPanel() {
  const qc = useQueryClient()
  const listings = useQuery({ queryKey: ['admin', 'listings'], queryFn: api.admin.listings })
  const set = useMutation({
    mutationFn: ({ id, isPublic }: { id: number; isPublic: boolean }) => api.admin.setListingPublic(id, isPublic),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'listings'] }),
  })

  const items = listings.data?.items ?? []

  return (
    <section className="space-y-4">
      <header>
        <Explainer as="h2" title="Public listings">
          The shared catalog, newest first. Entries with a public listing page in a shown category go on the
          landing page by default; hide anything that should not. The page shows only open calls, ten per category.
        </Explainer>
      </header>

      {listings.isLoading ? (
        <div className="h-16 bg-sunken rounded-xl animate-pulse" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">Nothing catalogued yet.</p>
      ) : (
        <Card pad="none" clip>
          <ul className="divide-y divide-line">
            {items.map((l) => (
              <li key={l.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">
                    {l.url ? (
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {l.name}
                      </a>
                    ) : (
                      l.name
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {CATEGORY_LABEL[l.category]
                      ? `${CATEGORY_LABEL[l.category]} · ${l.public ? 'shown' : 'hidden'}`
                      : 'Other — never shown publicly'}
                    {l.location ? ` · ${l.location}` : ''}
                    {l.deadline ? ` · closes ${shortDate(l.deadline)}` : ''} · found {shortDate(l.firstSeenAt)}
                  </p>
                </div>
                {CATEGORY_LABEL[l.category] ? (
                  <Button
                    variant={l.public ? 'quiet' : 'neutral'}
                    size="sm"
                    disabled={set.isPending}
                    onClick={() => set.mutate({ id: l.id, isPublic: !l.public })}
                  >
                    {l.public ? 'Hide' : 'Show'}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}
