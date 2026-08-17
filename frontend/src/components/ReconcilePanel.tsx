import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ReconcilePreview, type ReconcileResult } from '../api'
import { StatusBadge } from './StatusBadge'
import { PitchDiff } from './PitchDiff'

type LearnChoice = 'keep' | 'learn'

function ResultRow({
  result,
  selected,
  learnChoice,
  onToggleSelect,
  onLearnChoice,
}: {
  result: ReconcileResult
  selected: boolean
  learnChoice: LearnChoice
  onToggleSelect: () => void
  onLearnChoice: (c: LearnChoice) => void
}) {
  const [showDiff, setShowDiff] = useState(false)
  const hasDiff = !!result.pitchDraft && result.sentEmail.body.trim() !== result.pitchDraft.trim()

  return (
    <div className={`border rounded-lg overflow-hidden ${selected ? 'border-line-strong' : 'border-line'}`}>
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3 bg-surface">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="mt-0.5 rounded border-line-strong cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-ink">{result.name}</p>
            <span className="text-xs text-ink-subtle">{result.contactEmail}</span>
          </div>
          <p className="text-xs text-ink-muted mt-0.5">
            "{result.sentEmail.subject}" ·{' '}
            {new Date(result.sentEmail.date).toLocaleDateString(undefined, {
              month: 'short', day: 'numeric', year: 'numeric',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {result.statusChange ? (
            <div className="flex items-center gap-1.5">
              <StatusBadge status={result.statusChange.from} />
              <span className="text-ink-subtle text-xs">→</span>
              <StatusBadge status={result.statusChange.to} />
            </div>
          ) : (
            <span className="text-xs text-ink-subtle">status unchanged</span>
          )}
        </div>
      </div>

      {/* Diff section */}
      {hasDiff && (
        <div className="border-t border-line">
          <button
            onClick={() => setShowDiff((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-ink-muted hover:bg-surface-muted transition-colors"
          >
            <span className="font-medium">
              {showDiff ? '▾' : '▸'} Draft vs sent — {showDiff ? 'hide diff' : 'show diff'}
            </span>
            {!showDiff && (
              <span className="text-ink-subtle">see what you changed</span>
            )}
          </button>

          {showDiff && (
            <div className="px-4 pb-4 space-y-3 bg-surface-muted">
              <PitchDiff draft={result.pitchDraft!} sent={result.sentEmail.body} />

              {/* Learn toggle */}
              {selected && (
                <div className="flex items-center gap-3 pt-1">
                  <p className="text-xs text-ink-muted font-medium">Learn from this?</p>
                  <div className="flex rounded-md border border-line-strong overflow-hidden text-xs">
                    <button
                      onClick={() => onLearnChoice('keep')}
                      className={`px-3 py-1.5 transition-colors ${
                        learnChoice === 'keep'
                          ? 'bg-ink text-on-accent'
                          : 'bg-surface text-ink-muted hover:bg-surface-muted'
                      }`}
                    >
                      Keep draft as-is
                    </button>
                    <button
                      onClick={() => onLearnChoice('learn')}
                      className={`px-3 py-1.5 border-l border-line-strong transition-colors ${
                        learnChoice === 'learn'
                          ? 'bg-ink text-on-accent'
                          : 'bg-surface text-ink-muted hover:bg-surface-muted'
                      }`}
                    >
                      Update draft → sent version
                    </button>
                  </div>
                  {learnChoice === 'learn' && (
                    <p className="text-xs text-ready">
                      Draft will be replaced with what you actually sent — future pitches inherit this style.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* No draft to compare */}
      {!result.pitchDraft && (
        <div className="border-t border-line px-4 py-2 bg-surface-muted">
          <p className="text-xs text-ink-subtle">No stored draft to compare against.</p>
        </div>
      )}
    </div>
  )
}

export function ReconcilePanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()

  const [preview, setPreview] = useState<ReconcilePreview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Per-result selection + learn choice
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [learnChoices, setLearnChoices] = useState<Record<number, LearnChoice>>({})

  const applyMutation = useMutation({
    mutationFn: () => {
      const updates = Array.from(selected).map((id) => {
        const result = preview!.results.find((r) => r.id === id)!
        return {
          id,
          newStatus: result.statusChange?.to,
          pitchSent: result.sentEmail.body,
          learnFromSent: learnChoices[id] === 'learn',
        }
      })
      return api.sync.reconcile.apply(updates)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      onClose()
    },
  })

  async function runPreview() {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.sync.reconcile.preview()
      setPreview(data)
      // Pre-select all results with a status change
      setSelected(new Set(data.results.filter((r) => r.statusChange).map((r) => r.id)))
      setLearnChoices(Object.fromEntries(data.results.map((r) => [r.id, 'keep' as LearnChoice])))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleAll = () => {
    if (selected.size === preview?.results.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(preview?.results.map((r) => r.id) ?? []))
    }
  }

  return (
    <div className="bg-surface border border-line rounded-lg overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink">Gmail Reconciliation</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Check sent mail against sync targets — update statuses and learn from your edits.
          </p>
        </div>
        <button onClick={onClose} className="text-ink-subtle hover:text-ink-muted text-lg leading-none">×</button>
      </div>

      <div className="p-5 space-y-5">
        {/* Run button */}
        {!preview && (
          <button
            onClick={runPreview}
            disabled={isLoading}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-ink text-on-accent hover:opacity-90 disabled:opacity-40 transition-colors"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Checking Gmail…
              </>
            ) : (
              'Check Gmail sent folder'
            )}
          </button>
        )}

        {error && (
          <div className="rounded-lg bg-danger-soft border border-danger px-4 py-3 text-sm text-danger">
            {error.includes('not configured') ? (
              <span>
                Gmail not configured — add <code className="bg-danger-soft px-1 rounded">GMAIL_REFRESH_TOKEN</code> as a
                Worker secret. See{' '}
                <code className="bg-danger-soft px-1 rounded">docs/gmail-setup.md</code>.
              </span>
            ) : (
              error
            )}
          </div>
        )}

        {/* Results */}
        {preview && (
          <>
            {preview.results.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No sent emails found matching your sync target addresses.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-ink-muted">
                    {preview.results.length} matched · {preview.unmatched.length} not found in sent mail
                  </p>
                  <button onClick={toggleAll} className="text-xs text-ink-muted hover:text-ink-muted underline">
                    {selected.size === preview.results.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                {preview.results.map((result) => (
                  <ResultRow
                    key={result.id}
                    result={result}
                    selected={selected.has(result.id)}
                    learnChoice={learnChoices[result.id] ?? 'keep'}
                    onToggleSelect={() => toggleSelect(result.id)}
                    onLearnChoice={(c) => setLearnChoices((p) => ({ ...p, [result.id]: c }))}
                  />
                ))}

                {preview.unmatched.length > 0 && (
                  <div className="rounded-lg bg-surface-muted border border-line px-4 py-3">
                    <p className="text-xs font-medium text-ink-muted mb-1.5">Not found in sent mail:</p>
                    <div className="flex flex-wrap gap-2">
                      {preview.unmatched.map((u) => (
                        <span key={u.id} className="text-xs bg-surface border border-line rounded px-2 py-0.5 text-ink-muted">
                          {u.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Apply bar */}
            {selected.size > 0 && (
              <div className="flex items-center gap-3 pt-2 border-t border-line">
                <button
                  onClick={() => applyMutation.mutate()}
                  disabled={applyMutation.isPending}
                  className="text-sm px-4 py-1.5 rounded-md bg-ink text-on-accent hover:opacity-90 disabled:opacity-40 transition-colors"
                >
                  {applyMutation.isPending
                    ? 'Applying…'
                    : `Apply ${selected.size} update${selected.size !== 1 ? 's' : ''}`}
                </button>
                <p className="text-xs text-ink-subtle">
                  {Array.from(selected)
                    .filter((id) => learnChoices[id] === 'learn')
                    .length > 0 &&
                    `${Array.from(selected).filter((id) => learnChoices[id] === 'learn').length} draft${
                      Array.from(selected).filter((id) => learnChoices[id] === 'learn').length !== 1 ? 's' : ''
                    } will be updated to sent version`}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
