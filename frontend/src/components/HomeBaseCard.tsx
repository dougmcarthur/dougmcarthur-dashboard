import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { FIELD } from './ui/Field'
import { Button } from './ui/Button'
import { Explainer } from './ui/Explainer'
import { Card } from './ui/Surface'

/**
 * Where the artist travels from — what every trip distance is measured from.
 *
 * No default. Scout used to assume Winnipeg in a list of place names, which
 * was right for one artist and wrong for every other; a distance from a home
 * nobody set is a guess dressed as a measurement. Unset, trip costs keep
 * guessing from place names, and the cost panel says that is why.
 *
 * Saved by a button, never as you type: the lookup behind it allows one
 * request a second, and search-as-you-type is exactly what its rules forbid.
 */
export function HomeBaseCard() {
  const qc = useQueryClient()
  const home = useQuery({ queryKey: ['travel-home'], queryFn: api.travel.home })
  const [place, setPlace] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (home.data) setPlace(home.data.home?.place ?? '')
  }, [home.data])

  const save = useMutation({
    mutationFn: async (): Promise<void> => {
      if (place.trim()) await api.travel.setHome(place.trim())
      else await api.travel.clearHome()
    },
    onSuccess: () => {
      setSaved(true)
      qc.invalidateQueries({ queryKey: ['travel-home'] })
      qc.invalidateQueries({ queryKey: ['gigs'] })
    },
  })

  const current = home.data?.home?.place ?? ''
  const dirty = place.trim() !== current

  return (
    <Card className="space-y-3">
      <Explainer title="Where you travel from">
        Trip costs measure the drive to each gig from here, using OpenStreetMap, so a two-hour
        drive is priced as one rather than guessed from the town&rsquo;s name. Town and province is
        enough.
      </Explainer>

      <label className="block">
        <span className="sr-only">Home base</span>
        <input
          className={FIELD}
          value={place}
          placeholder="Winnipeg, MB"
          maxLength={120}
          onChange={(e) => {
            setPlace(e.target.value)
            setSaved(false)
          }}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="neutral" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? 'Finding it…' : 'Save'}
        </Button>
        {saved && !dirty && (
          <span className="text-xs text-muted">
            {current ? 'Saved. Gigs are being measured from here — it takes a few minutes.' : 'Cleared.'}
          </span>
        )}
        {save.error && (
          <span className="text-xs text-danger-fg">
            {save.error instanceof Error ? save.error.message : 'Could not save'}
          </span>
        )}
      </div>
    </Card>
  )
}
