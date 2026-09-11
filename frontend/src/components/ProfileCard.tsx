import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { FIELD } from './ui/Field'
import { Button } from './ui/Button'

/**
 * The one field the oversight surface reads, filled in by the person it is
 * about.
 *
 * Nothing else on this screen is a fact about *you* rather than about the app,
 * which is why it is a card of its own and a short one. The reason it exists is
 * the admin screen's name column: before this there was no way to fill it, and
 * a blank identifying column is not a gap you can explain to somebody looking
 * at a list of accounts.
 *
 * Blank saves as "nobody has said", which is a real state and reads as
 * *Unnamed* rather than as an empty row.
 */
export function ProfileCard() {
  const qc = useQueryClient()
  const profile = useQuery({ queryKey: ['profile'], queryFn: api.profile.read })
  const [name, setName] = useState('')
  const [saved, setSaved] = useState(false)

  // Seeded once the server answers, not on every render — otherwise typing
  // would be overwritten by the value being edited.
  useEffect(() => {
    if (profile.data) setName(profile.data.displayName ?? '')
  }, [profile.data])

  const save = useMutation({
    mutationFn: () => api.profile.save(name.trim() || null),
    onSuccess: () => {
      setSaved(true)
      qc.invalidateQueries({ queryKey: ['profile'] })
    },
  })

  const current = profile.data?.displayName ?? ''
  const dirty = name.trim() !== current

  return (
    <div className="bg-surface border border-line rounded-xl shadow-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-ink">Your name</h3>
        <p className="text-xs text-muted mt-0.5">
          What this account is called. It is not printed on anything you send — drafts and
          applications use the artist database — only on the account itself.
        </p>
      </div>

      <label className="block">
        <span className="sr-only">Display name</span>
        <input
          className={FIELD}
          value={name}
          placeholder="Unnamed"
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value)
            setSaved(false)
          }}
        />
      </label>

      <div className="flex items-center gap-3">
        <Button
          variant="neutral"
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        {saved && !dirty && <span className="text-xs text-muted">Saved.</span>}
        {save.error && (
          <span className="text-xs text-danger-fg">
            {save.error instanceof Error ? save.error.message : 'Could not save'}
          </span>
        )}
      </div>
    </div>
  )
}
