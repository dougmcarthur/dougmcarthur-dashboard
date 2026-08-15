import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useHashRoute } from './hooks/useHashRoute'
import { OverviewPage } from './pages/OverviewPage'
import { GigsPage } from './pages/GigsPage'
import { LibraryPage } from './pages/LibraryPage'
import { SyncPage } from './pages/SyncPage'
import { PromoDraftsPage } from './pages/PromoDraftsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TaskRunsPage } from './pages/TaskRunsPage'

export default function App() {
  const [page, navigate] = useHashRoute('overview')

  return (
    <Layout page={page}>
      <ErrorBoundary label="Page error">
        {page === 'overview' && <OverviewPage onNav={navigate} />}
        {page === 'gigs' && <GigsPage />}
        {page === 'library' && <LibraryPage />}
        {page === 'sync' && <SyncPage />}
        {page === 'promo' && <PromoDraftsPage />}
        {page === 'runs' && <TaskRunsPage />}
        {page === 'settings' && <SettingsPage />}
      </ErrorBoundary>
    </Layout>
  )
}
