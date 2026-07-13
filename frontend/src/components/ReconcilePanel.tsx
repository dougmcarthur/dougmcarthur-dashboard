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
    <div className={`border rounded-lg overflow-hidden ${selected ? 'border-gray-400' : 'border-gray-200'}`}>
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3 bg-white">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="mt-0.5 rounded border-gray-300 cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900">{result.name}</p>
            <span className="text-xs text-gray-400">{result.contactEmail}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
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
              <span className="text-gray-400 text-xs">→</span>
              <StatusBadge status={result.statusChange.to} />
            </div>
          ) : (
            <span className="text-xs text-gray-400">status unchanged</span>
          )}
        </div>
      </div>

      {/* Diff section */}
      {hasDiff && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowDiff((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium">
              {showDiff ? '▾' : '▸'} Draft vs sent — {showDiff ? 'hide diff' : 'show diff'}
            </span>
            {!showDiff && (
              <span className="text-gray-400">see what you changed</span>
            )}
          </button>

          {showDiff && (
            <div className="px-4 pb-4 space-y-3 bg-gray-50">
              <PitchDiff draft={result.pitchDraft!} sent={result.sentEmail.body} />

              {/* Learn toggle */}
              {selected && (
                <div className="flex items-center gap-3 pt-1">
                  <p className="text-xs text-gray-500 font-medium">Learn from this?</p>
                  <div className="flex rounded-md border border-gray-300 overflow-hidden text-xs">
                    <button
                      onClick={() => onLearnChoice('keep')}
                      className={`px-3 py-1.5 transition-colors ${
                        learnChoice === 'keep'
                          ? 'bg-gray-900 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Keep draft as-is
                    </button>
                    <button
                      onClick={() => onLearnChoice('learn')}
                      className={`px-3 py-1.5 border-l border-gray-300 transition-colors ${
                        learnChoice === 'learn'
                          ? 'bg-gray-900 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Update draft → sent version
                    </button>
                  </div>
                  {learnChoice === 'learn' && (
                    <p className="text-xs text-green-700">
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
        <div className="border-t border-gray-100 px-4 py-2 bg-gray-50">
          <p className="text-xs text-gray-400">No stored draft to compare against.</p>
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
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Gmail Reconciliation</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Check sent mail against sync targets — update statuses and learn from your edits.
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>

      <div className="p-5 space-y-5">
        {/* Run button */}
        {!preview && (
          <button
            onClick={runPreview}
            disabled={isLoading}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
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
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error.includes('not configured') ? (
              <span>
                Gmail not configured — add <code className="bg-red-100 px-1 rounded">GMAIL_REFRESH_TOKEN</code> as a
                Worker secret. See{' '}
                <code className="bg-red-100 px-1 rounded">docs/gmail-setup.md</code>.
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
              <p className="text-sm text-gray-500">
                No sent emails found matching your sync target addresses.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-500">
                    {preview.results.length} matched · {preview.unmatched.length} not found in sent mail
                  </p>
                  <button onClick={toggleAll} className="text-xs text-gray-500 hover:text-gray-700 underline">
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
                  <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Not found in sent mail:</p>
                    <div className="flex flex-wrap gap-2">
                      {preview.unmatched.map((u) => (
                        <span key={u.id} className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-600">
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
              <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                <button
                  onClick={() => applyMutation.mutate()}
                  disabled={applyMutation.isPending}
                  className="text-sm px-4 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
                >
                  {applyMutation.isPending
                    ? 'Applying…'
                    : `Apply ${selected.size} update${selected.size !== 1 ? 's' : ''}`}
                </button>
                <p className="text-xs text-gray-400">
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
