import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type PromoDraft } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { Chevron } from '../components/Chevron'
import { SkeletonList } from '../components/Skeleton'

export function PromoDraftsPage() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['promo'],
    queryFn: api.promo.list,
  })

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<PromoDraft> }) =>
      api.promo.patch(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promo'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.promo.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promo'] }),
  })

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        Failed to load promo drafts — {(error as Error).message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Promo Drafts</h1>

      {isLoading ? (
        <SkeletonList rows={4} />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {data.map((draft) => {
            const isOpen = expanded.has(draft.id)
            return (
              <div key={draft.id}>
                <div
                  onClick={() => toggleExpand(draft.id)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    isOpen ? 'bg-yellow-50/40' : 'hover:bg-gray-50'
                  }`}
                >
                  <Chevron open={isOpen} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{draft.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{draft.month}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={draft.status} />
                    {draft.status === 'draft' && (
                      <button
                        disabled={patchMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation()
                          patchMutation.mutate({ id: draft.id, body: { status: 'published' } })
                        }}
                        className="text-xs px-2.5 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-40 transition-colors"
                      >
                        Publish
                      </button>
                    )}
                    <button
                      disabled={deleteMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete "${draft.title}"?`)) deleteMutation.mutate(draft.id)
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="px-6 pb-5 pt-3 bg-yellow-50/40 border-t border-yellow-100">
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {draft.content}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
          {data.length === 0 && (
            <p className="px-4 py-12 text-center text-gray-400 text-sm">No promo drafts.</p>
          )}
        </div>
      )}

      {!isLoading && (
        <p className="text-xs text-gray-400">{data.length} drafts</p>
      )}
    </div>
  )
}
