import type { GigOpportunity, SyncTarget, PromoDraft } from '../../api'
import type { ReviewItem } from '../../../../shared/reviewQueue'
import { normaliseGigStatus } from '../../../../shared/gigStatus'
import { Button, type ButtonVariant } from '../../components/ui/Button'

/** The actions for whichever kind of thing is selected. */
export function DecisionBar({
  item,
  onGig,
  onSync,
  onPromo,
  isSaving,
}: {
  item: ReviewItem
  onGig: (body: Partial<GigOpportunity>) => void
  onSync: (body: Partial<SyncTarget>) => void
  onPromo: (body: Partial<PromoDraft>) => void
  isSaving: boolean
}) {
  // A variant, not a class string: this list was already a variant table
  // written out longhand, and the "pass" styling had drifted from the one on
  // the Gigs table.
  const buttons: Array<{ label: string; variant: ButtonVariant; run: () => void }> = []

  if (item.source.kind === 'gig') {
    // "Will apply", not "Approve". The old label read as a booking, and the
    // app agreed with it by putting the deadline on your calendar as a gig.
    const status = normaliseGigStatus(item.source.row.status)
    if (status !== 'shortlisted') {
      buttons.push({ label: 'Will apply', variant: 'primary' as const, run: () => onGig({ status: 'shortlisted' }) })
    }
    if (status !== 'submitted') {
      buttons.push({ label: 'Applied', variant: 'neutral' as const, run: () => onGig({ status: 'submitted' }) })
    }
    if (status !== 'passed') {
      buttons.push({ label: 'Pass', variant: 'danger' as const, run: () => onGig({ status: 'passed' }) })
    }
    buttons.push({ label: 'Archive', variant: 'neutral' as const, run: () => onGig({ status: 'archived' }) })
  }

  if (item.source.kind === 'sync') {
    const { status } = item.source.row
    if (status !== 'pitched') {
      buttons.push({ label: 'Mark pitched', variant: 'neutral' as const, run: () => onSync({ status: 'pitched' }) })
    }
    buttons.push({ label: 'Confirmed', variant: 'primary' as const, run: () => onSync({ status: 'confirmed' }) })
    buttons.push({ label: 'Declined', variant: 'danger' as const, run: () => onSync({ status: 'declined' }) })
    buttons.push({ label: 'Archive', variant: 'neutral' as const, run: () => onSync({ status: 'archived' }) })
  }

  if (item.source.kind === 'promo') {
    buttons.push({ label: 'Approve', variant: 'primary' as const, run: () => onPromo({ status: 'approved' }) })
    buttons.push({ label: 'Mark published', variant: 'neutral' as const, run: () => onPromo({ status: 'published' }) })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((b) => (
        <Button key={b.label} variant={b.variant} onClick={b.run} disabled={isSaving}>
          {b.label}
        </Button>
      ))}
    </div>
  )
}
