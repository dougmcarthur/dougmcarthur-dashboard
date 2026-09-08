import type { GigOpportunity, SyncTarget, PromoDraft } from '../../api'
import type { ReviewItem } from '../../../../shared/reviewQueue'
import { normaliseGigStatus, nextGigStatuses, gigStatusMeta } from '../../../../shared/gigStatus'
import { GIG_MOVE_LABEL } from '../../../../shared/decisionCopy'
import { Button, type ButtonVariant } from '../../components/ui/Button'

/**
 * The moves a gig offers, styled by what they mean.
 *
 * `primary` is the move that carries the pipeline forward, `danger` the one
 * that ends it, `neutral` the filing. Anything not listed is a status you
 * cannot reach from anywhere and therefore never renders.
 */
const GIG_VARIANT: Record<string, ButtonVariant> = {
  shortlisted: 'primary',
  preparing: 'primary',
  submitted: 'primary',
  booked: 'primary',
  acknowledged: 'info',
  info_requested: 'info',
  invited: 'good',
  declined: 'danger',
  passed: 'danger',
  withdrawn: 'danger',
  expired: 'neutral',
  archived: 'neutral',
}

/**
 * The actions for whichever kind of thing is selected.
 *
 * Gig buttons are **generated from `nextGigStatuses`**, never listed by hand.
 * They used to be a fixed four — Will apply, Applied, Pass, Archive — offered
 * whatever the row's status was, and the PATCH route validates against the
 * same pipeline: on a submitted gig every one of them returned a 400, and on
 * an invited one there was no way to record a booking at all. A button the API
 * refuses is worse than a missing button, because it looks like it worked.
 */
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
  const buttons: Array<{ label: string; variant: ButtonVariant; title?: string; run: () => void }> = []

  if (item.source.kind === 'gig') {
    const status = normaliseGigStatus(item.source.row.status)
    for (const to of nextGigStatuses(status)) {
      buttons.push({
        // "Will apply", not "Approve". The old label read as a booking, and
        // the app agreed with it by putting the deadline on your calendar as
        // a gig. See shared/gigStatus.ts.
        label: GIG_MOVE_LABEL[to] ?? gigStatusMeta(to).label,
        variant: GIG_VARIANT[to] ?? 'neutral',
        title: gigStatusMeta(to).meaning,
        run: () => onGig({ status: to }),
      })
    }
  }

  if (item.source.kind === 'sync') {
    const { status } = item.source.row
    if (status !== 'pitched') {
      buttons.push({ label: 'Mark pitched', variant: 'neutral', run: () => onSync({ status: 'pitched' }) })
    }
    buttons.push({ label: 'Confirmed', variant: 'primary', run: () => onSync({ status: 'confirmed' }) })
    buttons.push({ label: 'Declined', variant: 'danger', run: () => onSync({ status: 'declined' }) })
    buttons.push({ label: 'Archive', variant: 'neutral', run: () => onSync({ status: 'archived' }) })
  }

  if (item.source.kind === 'promo') {
    buttons.push({ label: 'Approve', variant: 'primary', run: () => onPromo({ status: 'approved' }) })
    buttons.push({ label: 'Mark published', variant: 'neutral', run: () => onPromo({ status: 'published' }) })
  }

  // An archived gig has nowhere left to go, and a row of no buttons under a
  // heading reads as a rendering bug. Say why instead.
  if (buttons.length === 0) {
    return (
      <p className="text-xs text-muted">
        Nothing left to decide — {gigStatusMeta(item.status).meaning.toLowerCase()}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((b) => (
        <Button key={b.label} variant={b.variant} title={b.title} onClick={b.run} disabled={isSaving}>
          {b.label}
        </Button>
      ))}
    </div>
  )
}
