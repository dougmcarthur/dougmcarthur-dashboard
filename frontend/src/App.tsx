import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useHashRoute } from './hooks/useHashRoute'
import { useSession } from './hooks/useSession'
import { AdminPage } from './pages/AdminPage'
import { adminSectionFromArg } from './pages/admin/sections'
import { settingsSectionFromArg } from './pages/settings/sections'
import { OverviewPage } from './pages/OverviewPage'
import { ReviewPage } from './pages/ReviewPage'
import { GigsPage } from './pages/GigsPage'
import { ArtistPage } from './pages/ArtistPage'
import { SyncPage } from './pages/SyncPage'
import { PromoDraftsPage } from './pages/PromoDraftsPage'
import { SettingsPage } from './pages/SettingsPage'
import { HistoryPage } from './pages/HistoryPage'
import { HelpPage } from './pages/HelpPage'
import { useEffect } from 'react'
import { AccountAppearance } from './hooks/useAppearance'
import { notePage } from './diagnostics'

export default function App() {
  const [page, navigate, arg] = useHashRoute('overview')
  const session = useSession()

  // The feedback form's "before that" trail. In memory only; see diagnostics.ts.
  useEffect(() => notePage(window.location.hash), [page, arg])

  // The signed-out routes, opened while signed in, mean the Overview.
  useEffect(() => {
    if (page === 'welcome' || page === 'signin') navigate('overview')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  /**
   * Two surfaces, and the app renders one of them.
   *
   * Not a route among the others: an admin-mode session is refused every
   * `/api` route outside `/api/admin`, so an artist page mounted here would be
   * a screen of failed requests. The server's refusal is the lock; this is
   * what keeps it from looking like a bug. See docs/multi-tenant-plan.md.
   */
  if (session?.mode === 'admin') {
    // `#admin/sources` names a page; `#admin`, or the artist route a reload
    // left in the address bar, is the first one.
    const section = adminSectionFromArg(page === 'admin' ? arg : null)
    return (
      <Layout page={`admin/${section}`} onNav={navigate} admin>
        {/* Keyed by page, so one page that fails does not leave every other
            page in the sidebar showing the same error until a reload. */}
        <ErrorBoundary key={section} label="Page error">
          <AdminPage section={section} />
        </ErrorBoundary>
      </Layout>
    )
  }

  // Which Settings page, for this person: an old tab id is read as the page
  // that replaced it, and an owner's page asked for by an artist is the default.
  const settingsSection = settingsSectionFromArg(arg, session?.role === 'owner')

  return (
    <Layout page={page === 'settings' ? `settings/${settingsSection}` : page} onNav={navigate}>
      <AccountAppearance />
      <ErrorBoundary key={page === 'settings' ? `settings/${settingsSection}` : page} label="Page error">
        {page === 'overview' && <OverviewPage onNav={navigate} />}
        {page === 'review' && <ReviewPage initialFilter={arg} />}
        {page === 'gigs' && <GigsPage initialOpen={arg} />}
        {page === 'artist' && <ArtistPage initialTab={arg} />}
        {page === 'shows' && <ArtistPage initialTab="checklists" />}
        {page === 'epk' && <ArtistPage initialTab="profile" />}
        {page === 'sync' && <SyncPage />}
        {page === 'promo' && <PromoDraftsPage />}
        {page === 'runs' && <HistoryPage key={arg ?? ''} initialKind={arg} onNav={navigate} />}
        {page === 'settings' && <SettingsPage section={settingsSection} />}
        {page === 'help' && <HelpPage />}
      </ErrorBoundary>
    </Layout>
  )
}
