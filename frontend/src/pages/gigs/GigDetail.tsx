import {  type GigOpportunity, type GigStatus } from '../../api'
import {  normaliseGigStatus } from '../../../../shared/gigStatus'
import { Button } from '../../components/ui/Button'

/** The read-only expansion under a table row. */
export function GigDetail({
  gig,
  onEdit,
  onStatusChange,
  isPatching,
}: {
  gig: GigOpportunity
  onEdit: () => void
  onStatusChange: (status: GigStatus) => void
  isPatching: boolean
}) {
  return (
    <div className="space-y-4 max-w-3xl">
      {(gig.fitRationale || gig.fitNotes) && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Why it fits</p>
          <p className="text-sm text-body leading-relaxed">{gig.fitRationale ?? gig.fitNotes}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        {gig.submissionMethod && (
          <span className="bg-surface px-2.5 py-1 rounded-md border border-line text-body">Submit via {gig.submissionMethod}</span>
        )}
        {gig.audienceSize && (
          <span className="bg-surface px-2.5 py-1 rounded-md border border-line text-body">~{gig.audienceSize.toLocaleString()} audience</span>
        )}
        {gig.googleEventId && (
          <span className="bg-surface px-2.5 py-1 rounded-md border border-success-line text-success-fg">📅 Calendar synced</span>
        )}
        {gig.url && (
          <a href={gig.url} target="_blank" rel="noreferrer" className="bg-surface px-2.5 py-1 rounded-md border border-line text-info-fg hover:bg-info-bg transition-colors">
            Open link ↗
          </a>
        )}
      </div>
      <div className="flex gap-2 flex-wrap pt-1">
        {normaliseGigStatus(gig.status) === 'shortlisted' && (
          <button disabled={isPatching} onClick={() => onStatusChange('submitted')}
            className="text-xs px-3 py-1.5 rounded-md bg-info-fg text-accent-fg hover:brightness-110 disabled:opacity-40 transition-colors">
            Applied
          </button>
        )}
        {normaliseGigStatus(gig.status) === 'shortlisted' && (
          <Button variant="neutral" disabled={isPatching} onClick={() => onStatusChange('archived')}>
            Archive
          </Button>
        )}
        <Button variant="neutral" onClick={onEdit}
          >
          Edit details
        </Button>
      </div>
    </div>
  )
}
