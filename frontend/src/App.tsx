import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useHashRoute } from './hooks/useHashRoute'
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
