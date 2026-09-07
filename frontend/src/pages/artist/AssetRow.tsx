import type { ArtistAssetWithHealth } from '../../api'
import { assetKindMeta, type Freshness } from '../../../../shared/artistAssets'
import { Button } from '../../components/ui/Button'
import { kindByKey } from '../../../../shared/questionKinds'

/**
 * How stale reads on the row. Deliberately not a colour scale from good to bad:
 * `unreviewed` is not "worse than due soon", it is a different sentence —
 * nobody has ever claimed this was checked.
 */
const FRESHNESS: Record<Freshness, { text: string; className: string }> = {
  fresh: { text: '', className: '' },
  due_soon: { text: 'Review soon', className: 'border-line text-muted' },
  overdue: { text: 'Overdue', className: 'border-danger-line text-danger-fg' },
  unreviewed: { text: 'Never reviewed', className: 'border-line text-faint' },
}

export function AssetRow({
  asset,
  onReviewed,
  onEdit,
  onArchive,
  busy,
}: {
  asset: ArtistAssetWithHealth
  onReviewed: () => void
  onEdit: () => void
  onArchive: () => void
  busy: boolean
}) {
  const meta = assetKindMeta(asset.kind)
  const fresh = FRESHNESS[asset.health.freshness]
  const question = asset.questionKind ? kindByKey(asset.questionKind) : undefined
  const length = asset.charCount ?? asset.value?.length ?? 0

  return (
    <div className={`px-4 py-3 ${asset.archived ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{asset.label}</p>
          {asset.value && (
            meta.isLink ? (
              <a href={asset.value} target="_blank" rel="noreferrer"
                className="text-xs text-info-fg hover:underline break-all">
                {asset.value}
              </a>
            ) : (
              <p className="text-sm text-body mt-1 line-clamp-3 whitespace-pre-wrap">{asset.value}</p>
            )
          )}
          {asset.health.problem && (
            <p className="text-xs text-danger-fg mt-1">{asset.health.problem}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {fresh.text && (
            <span className={`text-xs px-2 py-0.5 rounded-md border bg-surface ${fresh.className}`}>
              {fresh.text}
            </span>
          )}
          {asset.reviewBy && (
            <span className="text-xs text-faint tabular-nums">Review by {asset.reviewBy}</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
        {question && (
          // The join to the form parser: this is the question a festival form
          // asks, in the app's own words rather than that form's.
          <span className="px-2 py-0.5 rounded-md border border-line bg-surface text-muted">
            Answers: {question.label}
          </span>
        )}
        {!meta.isLink && length > 0 && (
          <span className="px-2 py-0.5 rounded-md border border-line bg-surface text-muted tabular-nums">
            {length} chars
          </span>
        )}
        {asset.credit && (
          <span className="px-2 py-0.5 rounded-md border border-line bg-surface text-muted">© {asset.credit}</span>
        )}
        {asset.usageRights && (
          <span className="px-2 py-0.5 rounded-md border border-line bg-surface text-muted">{asset.usageRights}</span>
        )}
        <span className="grow" />
        {asset.health.freshness !== 'fresh' && !asset.archived && (
          <Button variant="good" size="sm" disabled={busy} onClick={onReviewed}>
            Still good
          </Button>
        )}
        <Button variant="quiet" size="sm" onClick={onEdit}>Edit</Button>
        <Button variant="quiet" size="sm" disabled={busy} onClick={onArchive}>
          {asset.archived ? 'Restore' : 'Archive'}
        </Button>
      </div>
    </div>
  )
}
