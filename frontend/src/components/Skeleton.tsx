export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-surface border border-line rounded-lg overflow-hidden animate-pulse">
      <div className="border-b border-line px-4 py-2.5 bg-surface-muted flex gap-6">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-surface-muted rounded" style={{ width: `${60 + (i % 3) * 20}px` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-3 border-b border-line flex gap-6 items-center last:border-0">
          <div className="h-4 bg-surface-muted rounded w-40" />
          <div className="h-3 bg-surface-muted rounded w-20" />
          <div className="h-3 bg-surface-muted rounded w-24" />
          <div className="h-3 bg-surface-muted rounded w-16" />
          <div className="h-5 bg-surface-muted rounded-full w-20" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-surface border border-line rounded-lg divide-y divide-line animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-3 flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-4 bg-surface-muted rounded w-48" />
            <div className="h-3 bg-surface-muted rounded w-32" />
          </div>
          <div className="h-5 bg-surface-muted rounded-full w-20" />
        </div>
      ))}
    </div>
  )
}
