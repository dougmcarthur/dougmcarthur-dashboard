import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useAppearance } from '../hooks/useAppearance'
import { PAGE_HINTS, type HintPage } from '../../../shared/pageHints'
import { Button } from './ui/Button'
import { Explainer } from './ui/Explainer'
import { PAGE_TITLE } from './ui/Surface'

/**
 * A page's heading, and the one line that says what the page is for.
 *
 * On the first visit that line is shown outright, once, under the title, with a
 * button that puts it away. After that it is the note behind the title's info
 * icon, as every other explanation in the app is. Dismissal belongs to the
 * account, not the browser, so a line put away on a phone stays away on a
 * laptop.
 *
 * Nothing shows until the account's answer has arrived, and nothing if the
 * answer cannot be read: a hint that flashed up and vanished on every visit
 * would be worse than one a person has to ask for. Switching explanations off
 * in Appearance hides the first-visit line as it hides every icon.
 */
export function PageHeading({ page, title }: { page: HintPage; title: string }) {
  const qc = useQueryClient()
  const { appearance } = useAppearance()
  const read = useQuery({ queryKey: ['page-hints'], queryFn: api.pageHints.read, staleTime: Infinity, retry: false })
  const dismiss = useMutation({
    mutationFn: () => api.pageHints.dismiss(page),
    // Put away at once. The request follows, and a failure leaves it away for
    // this visit and back on the next, which costs one more click.
    onMutate: () => qc.setQueryData(['page-hints'], (old: { dismissed: HintPage[] } | undefined) => ({
      dismissed: [...new Set([...(old?.dismissed ?? []), page])],
    })),
  })

  const text = PAGE_HINTS[page]
  const firstVisit = appearance.showHints && read.data !== undefined && !read.data.dismissed.includes(page)

  if (firstVisit) {
    return (
      <div>
        <h1 className={PAGE_TITLE}>{title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-muted">{text}</p>
          <Button variant="quiet" size="sm" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
            Got it
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Explainer as="h1" title={title} titleClassName={PAGE_TITLE}>
      {text}
    </Explainer>
  )
}
