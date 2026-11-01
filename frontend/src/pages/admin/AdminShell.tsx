import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import { needsAttention } from '../../../../shared/sourceControls'
import { AdminSearch } from '../../components/AdminSearch'
import { SidebarShell, type SidebarBadge } from '../../components/ui/SidebarShell'
import { ADMIN_GROUPS, type AdminSectionId } from './sections'

/**
 * What wants the owner's attention, per page, for the sidebar to show.
 *
 * These read the same queries the pages do, under the same keys, so the badge
 * and the page it points at are one request and cannot disagree. Two kinds:
 * *waiting* is something to answer (unread feedback, a request for an
 * invitation) and is plain; *attention* is something that is wrong (a source
 * that has stopped answering) and is tinted. A source the owner has switched
 * off is a decision and is never counted, which is also how a badge on a dead
 * source clears: switch it off.
 */
function useBadges(): Partial<Record<AdminSectionId, SidebarBadge>> {
  const feedback = useQuery({ queryKey: ['admin', 'feedback'], queryFn: api.admin.feedback })
  const requests = useQuery({ queryKey: ['admin', 'invite-requests'], queryFn: api.admin.inviteRequests })
  const sources = useQuery({ queryKey: ['admin', 'catalog', 'sources'], queryFn: api.admin.catalogSources })

  const unread = (feedback.data?.items ?? []).filter((i) => !i.readAt).length
  const open = (requests.data?.items ?? []).filter((r) => r.status === 'new').length
  const failing = (sources.data?.items ?? []).filter((s) => s.enabled && needsAttention(s.state)).length

  return {
    ...(unread > 0 && { feedback: { count: unread, tone: 'waiting', noun: 'unread' } as SidebarBadge }),
    ...(open > 0 && { invitations: { count: open, tone: 'waiting', noun: 'waiting for an answer' } as SidebarBadge }),
    ...(failing > 0 && { sources: { count: failing, tone: 'attention', noun: 'needing attention' } as SidebarBadge }),
  }
}

/** The frame every admin page sits in. The shell itself is `SidebarShell`, shared with Settings. */
export function AdminShell({ section, children }: { section: AdminSectionId | null; children: ReactNode }) {
  const badges = useBadges()

  return (
    <SidebarShell
      label="Admin pages"
      title="Admin"
      groups={ADMIN_GROUPS}
      current={section}
      hrefFor={(id) => `#admin/${id}`}
      indexHref="#admin"
      badges={badges}
      top={<AdminSearch />}
    >
      {children}
    </SidebarShell>
  )
}
