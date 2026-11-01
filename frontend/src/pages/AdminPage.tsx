import { FeedbackInbox } from '../components/FeedbackInbox'
import { PublicListingsPanel } from '../components/PublicListingsPanel'
import { SurveyPanel } from '../components/SurveyPanel'
import { DrivePickerPanel } from '../components/DrivePickerPanel'
import { ExternalSourcesPanel } from '../components/ExternalSourcesPanel'
import { SourceFindingsPanel } from '../components/SourceFindingsPanel'
import { AdminSearch } from '../components/AdminSearch'
import { ChangeLog } from '../components/ChangeLog'
import { AdminShell } from './admin/AdminShell'
import { ArtistsSection } from './admin/ArtistsSection'
import { InvitationsSection } from './admin/InvitationsSection'
import type { AdminSectionId } from './admin/sections'

/**
 * The owner's side of the product, one page at a time.
 *
 * It was a single column of eight panels, and scrolling past the artists to
 * reach the survey was most of using it. Each panel is a page of its own now,
 * named in the sidebar (`./admin/sections.ts`), and the route says which:
 * `#admin/sources`. Which page is the app's concern (`App.tsx` reads the hash);
 * this only draws it.
 *
 * Nothing here can open an artist's work, and nothing on any of these pages
 * offers what the server would refuse. The rules that keep that true are
 * checked in `test/adminMode.test.ts`, which reads this file and everything in
 * `./admin/`.
 */
export function AdminPage({ section }: { section: AdminSectionId }) {
  return (
    <AdminShell section={section}>
      {/* Keyed, so moving to another page starts it clean rather than carrying
          a half-typed field or a page number across. */}
      <Section key={section} section={section} />
    </AdminShell>
  )
}

function Section({ section }: { section: AdminSectionId }) {
  switch (section) {
    case 'artists':
      return <ArtistsSection />
    case 'invitations':
      return <InvitationsSection />
    case 'feedback':
      return <FeedbackInbox />
    case 'sources':
      return <ExternalSourcesPanel />
    case 'findings':
      return <SourceFindingsPanel />
    case 'listings':
      return <PublicListingsPanel />
    case 'survey':
      return <SurveyPanel />
    case 'drive':
      return <DrivePickerPanel />
    case 'search':
      return <AdminSearch />
    case 'changes':
      return <ChangeLog />
  }
}
