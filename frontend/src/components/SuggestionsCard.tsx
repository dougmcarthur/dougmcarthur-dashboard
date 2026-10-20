import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { Explainer } from './ui/Explainer'
import { Card } from './ui/Surface'
import { Toggle } from './ui/Toggle'

/**
 * The switch for new matches from the shared catalog.
 *
 * On by default, because finding opportunities is what Scout is for, and a few
 * a day at most: only what is new, only what the artist said they want, within
 * the reach they chose. Turning it off stops the additions and the bell notes.
 * It does not touch anything already on the list.
 */
export function SuggestionsCard() {
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['matching', 'settings'], queryFn: api.matching.settings })
  const set = useMutation({
    mutationFn: (enabled: boolean) => api.matching.setEnabled(enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matching'] }),
  })

  const on = settings.data?.enabled ?? true

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <Explainer as="h2" title="New opportunities for you">
          A few a day at most, only what is new and what you told Scout you want, with a note in the bell. Nothing already
          on your list is touched.
        </Explainer>
        <Toggle
          label="New opportunities for you"
          checked={on}
          disabled={!settings.data || set.isPending}
          onChange={(val) => set.mutate(val)}
        />
      </div>
    </Card>
  )
}
