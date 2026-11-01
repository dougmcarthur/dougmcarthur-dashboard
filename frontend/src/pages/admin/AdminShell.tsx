import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import { AdminSearch } from '../../components/AdminSearch'
import { SidebarShell, type SidebarBadge } from '../../components/ui/SidebarShell'
import { ADMIN_GROUPS, type AdminSectionId } from './sections'

/**
 * What wants the owner's attention, per page, for the sidebar to show.
 *
 * One small request (`/admin/badges`: two counts and the source rows) and not
 * the three lists the pages read, which are not cheap and would run on every
 * admin page. It is kept current by the query client's mutation cache, which
 * invalidates `['admin', 'badges']` after any write (`main.tsx`), so marking a
 * message read or switching a source off changes its badge at once without this
 * file knowing which pages can write.
 *
 * Two kinds: *waiting* is something to answer (unread feedback, a request for an
 * invitation) and is plain; *attention* is something that is wrong (a source
 * that has stopped answering) and is tinted. A source the owner has switched
 * off is a decision and is never counted, which is also how a badge on a dead
 * source clears: switch it off.
 */
function useBadges(): Partial<Record<AdminSectionId, SidebarBadge>> {
  const counts = useQuery({ queryKey: ['admin', 'badges'], queryFn: api.admin.badges, staleTime: 60_000 }).data

  return {
    ...(counts && counts.feedbackUnread > 0 && {
      feedback: { count: counts.feedbackUnread, tone: 'waiting', noun: 'unread' } as SidebarBadge,
    }),
    ...(counts && counts.requestsOpen > 0 && {
      invitations: { count: counts.requestsOpen, tone: 'waiting', noun: 'waiting for an answer' } as SidebarBadge,
    }),
    ...(counts && counts.sourcesFailing > 0 && {
      sources: { count: counts.sourcesFailing, tone: 'attention', noun: 'needing attention' } as SidebarBadge,
    }),
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
