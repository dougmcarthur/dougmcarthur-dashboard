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
  /**
   * Whether this row has nothing to report, and so can put its actions away.
   *
   * A row that *is* asking for something keeps them visible, because hiding
   * them is how a screen ends up stating a problem and offering no way to fix
   * it — which is exactly what the first version did to the press photo with
   * no photographer credit: the credit is missing, the row said so, and the
   * Edit button that fixes it was behind a hover.
   */
  const quiet = asset.health.freshness === 'fresh' && !asset.health.problem

  return (
    <div className={`group px-4 py-3 ${asset.archived ? 'opacity-50' : ''}`}>
      {/* Below sm the badges go under the text rather than beside it. Beside
          it they took 111-146px of a 288px row and left the asset itself
          92px, which is a dozen characters of a bio per line. */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
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
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:flex-nowrap sm:items-end sm:gap-1 shrink-0">
          {fresh.text && (
            <span className={`text-xs px-2 py-0.5 rounded-md border bg-surface ${fresh.className}`}>
              {fresh.text}
            </span>
          )}
          {/*
            Only where the date is doing work. `assetHealth` already sorts
            `fresh` from `due_soon`, `overdue` and `unreviewed`, and this
            printed the date whatever it said — so a bio that is fine for
            another eighteen months carried a 2027 date at the same weight as
            the bio itself, on every row. A row with nothing to report says
            nothing, which is the honest rendering of nothing to report.
          */}
          {asset.reviewBy && asset.health.freshness !== 'fresh' && (
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
        {/*
          Plain text rather than a fourth bordered pill. A pill carries the
          weight of a status, and four of them per row is the density problem
          — the count itself is a useful glance at whether a bio is a stub, so
          it stays, at the weight of a footnote.
        */}
        {!meta.isLink && length > 0 && (
          <span className="text-muted tabular-nums">{length} chars</span>
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
        {/*
          Six buttons across three visible rows competed with the content
          before anybody had decided anything. `Still good` is not in here: it
          only renders on a row that is already asking for something, so it is
          the row's point rather than its furniture.
        */}
        <span className={`${quiet ? 'row-actions' : ''} flex items-center gap-2`}>
          <Button variant="quiet" size="sm" onClick={onEdit}>Edit</Button>
          <Button variant="quiet" size="sm" disabled={busy} onClick={onArchive}>
            {asset.archived ? 'Restore' : 'Archive'}
          </Button>
        </span>
      </div>
    </div>
  )
}
