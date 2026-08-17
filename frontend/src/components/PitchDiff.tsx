// Line-level diff between a stored draft and the email that was actually sent.
// Shows what Doug changed — the delta is the "learning".

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed'
  text: string
}

function computeDiff(original: string, modified: string): DiffLine[] {
  const origLines = original.split('\n')
  const modLines = modified.split('\n')

  // Build LCS table
  const m = origLines.length
  const n = modLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (origLines[i].trim() === modLines[j].trim()) {
        dp[i][j] = 1 + dp[i + 1][j + 1]
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  // Trace back
  const result: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < m || j < n) {
    if (i < m && j < n && origLines[i].trim() === modLines[j].trim()) {
      result.push({ type: 'unchanged', text: modLines[j] })
      i++
      j++
    } else if (j < n && (i >= m || dp[i + 1][j] <= dp[i][j + 1])) {
      result.push({ type: 'added', text: modLines[j] })
      j++
    } else {
      result.push({ type: 'removed', text: origLines[i] })
      i++
    }
  }
  return result
}

function diffStats(lines: DiffLine[]) {
  return {
    added: lines.filter((l) => l.type === 'added').length,
    removed: lines.filter((l) => l.type === 'removed').length,
    unchanged: lines.filter((l) => l.type === 'unchanged').length,
  }
}

export function PitchDiff({
  draft,
  sent,
  defaultOpen = false,
}: {
  draft: string
  sent: string
  defaultOpen?: boolean
}) {
  const lines = computeDiff(draft, sent)
  const stats = diffStats(lines)
  const hasChanges = stats.added > 0 || stats.removed > 0

  if (!hasChanges) {
    return (
      <p className="text-xs text-ink-subtle italic">
        Sent email matches draft exactly — no changes detected.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-3 text-xs">
        {stats.added > 0 && (
          <span className="text-ready font-medium">+{stats.added} lines added</span>
        )}
        {stats.removed > 0 && (
          <span className="text-danger font-medium">−{stats.removed} lines removed</span>
        )}
        <span className="text-ink-subtle">{stats.unchanged} unchanged</span>
      </div>
      <div className="rounded-md border border-line overflow-hidden text-xs font-mono">
        {lines.map((line, i) => {
          if (line.type === 'unchanged' && line.text.trim() === '') {
            return <div key={i} className="h-3 bg-surface" />
          }
          return (
            <div
              key={i}
              className={`px-3 py-0.5 leading-relaxed whitespace-pre-wrap ${
                line.type === 'added'
                  ? 'bg-ready-soft text-ready border-l-2 border-ready'
                  : line.type === 'removed'
                  ? 'bg-danger-soft text-danger border-l-2 border-danger line-through opacity-60'
                  : 'bg-surface text-ink-muted'
              }`}
            >
              <span className="select-none mr-2 text-ink-subtle">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}
              </span>
              {line.text || ' '}
            </div>
          )
        })}
      </div>
    </div>
  )
}
