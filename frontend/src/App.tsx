import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useHashRoute } from './hooks/useHashRoute'
import { useSession } from './hooks/useSession'
import { AdminPage } from './pages/AdminPage'
import { OverviewPage } from './pages/OverviewPage'
import { ReviewPage } from './pages/ReviewPage'
import { GigsPage } from './pages/GigsPage'
import { ArtistPage } from './pages/ArtistPage'
import { SyncPage } from './pages/SyncPage'
import { PromoDraftsPage } from './pages/PromoDraftsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TaskRunsPage } from './pages/TaskRunsPage'

export default function App() {
  const [page, navigate, arg] = useHashRoute('overview')
  const session = useSession()

  /**
   * Two surfaces, and the app renders one of them.
   *
   * Not a route among the others: an admin-mode session is refused every
   * `/api` route outside `/api/admin`, so an artist page mounted here would be
   * a screen of failed requests. The server's refusal is the lock; this is
   * what keeps it from looking like a bug. See docs/multi-tenant-plan.md.
   */
  if (session?.mode === 'admin') {
    return (
      <Layout page="admin" onNav={navigate} admin>
        <ErrorBoundary label="Page error">
          <AdminPage />
        </ErrorBoundary>
      </Layout>
    )
  }

  return (
    <Layout page={page} onNav={navigate}>
      <ErrorBoundary label="Page error">
        {page === 'overview' && <OverviewPage onNav={navigate} />}
        {page === 'review' && <ReviewPage initialFilter={arg} />}
        {page === 'gigs' && <GigsPage />}
        {page === 'artist' && <ArtistPage />}
        {page === 'sync' && <SyncPage />}
        {page === 'promo' && <PromoDraftsPage />}
        {page === 'runs' && <TaskRunsPage />}
        {page === 'settings' && <SettingsPage />}
      </ErrorBoundary>
    </Layout>
  )
}
