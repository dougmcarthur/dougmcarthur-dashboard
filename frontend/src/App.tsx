import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useHashRoute } from './hooks/useHashRoute'
import { useSession } from './hooks/useSession'
import { resolveAdminRoute } from './pages/admin/sections'
import { resolveSettingsRoute } from './pages/settings/sections'
import { useNarrow } from './hooks/useNarrow'
import { OverviewPage } from './pages/OverviewPage'
import { SkeletonList } from './components/Skeleton'
import { lazy, Suspense, useEffect, type ComponentType } from 'react'
import { AccountAppearance } from './hooks/useAppearance'
import { notePage } from './diagnostics'

// Every page but the Overview is its own chunk. The Overview is where a
// signed-in person lands, so it ships with the shell; the rest (admin and
// Settings alone are most of the code) load when they are first opened. It
// was one 950 kB script that every sign-in parsed before drawing anything.
function lazyPage<K extends string, P extends object>(
  load: () => Promise<Record<K, ComponentType<P>>>,
  name: K,
) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}

const AdminPage = lazyPage(() => import('./pages/AdminPage'), 'AdminPage')
const ReviewPage = lazyPage(() => import('./pages/ReviewPage'), 'ReviewPage')
const GigsPage = lazyPage(() => import('./pages/GigsPage'), 'GigsPage')
const ArtistPage = lazyPage(() => import('./pages/ArtistPage'), 'ArtistPage')
const SyncPage = lazyPage(() => import('./pages/SyncPage'), 'SyncPage')
const PromoDraftsPage = lazyPage(() => import('./pages/PromoDraftsPage'), 'PromoDraftsPage')
const SettingsPage = lazyPage(() => import('./pages/SettingsPage'), 'SettingsPage')
const HistoryPage = lazyPage(() => import('./pages/HistoryPage'), 'HistoryPage')
const HelpPage = lazyPage(() => import('./pages/HelpPage'), 'HelpPage')

/** What stands in for a page while its chunk arrives. */
function PageLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true">
      <div className="h-7 bg-sunken rounded w-40" />
      <SkeletonList rows={4} />
    </div>
  )
}

export default function App() {
  const [page, navigate, arg] = useHashRoute('overview')
  const session = useSession()
  const narrow = useNarrow()

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
    // `#admin/sources` names a page. `#admin`, or the artist route a reload
    // left in the address bar, is the first page on a laptop and the list of
    // pages on a phone.
    const section = resolveAdminRoute(page === 'admin' ? arg : null, narrow)
    return (
      <Layout page={section ? `admin/${section}` : 'admin'} onNav={navigate} admin>
        {/* Keyed by page, so one page that fails does not leave every other
            page in the sidebar showing the same error until a reload. */}
        <ErrorBoundary key={section ?? 'list'} label="Page error">
          <Suspense fallback={<PageLoading />}>
            <AdminPage section={section} />
          </Suspense>
        </ErrorBoundary>
      </Layout>
    )
  }

  // Which Settings page, for this person: an old tab id is read as the page
  // that replaced it, an owner's page asked for by an artist is the default,
  // and on a phone a bare `#settings` is the list of pages (`null`).
  const settingsSection = page === 'settings' ? resolveSettingsRoute(arg, session?.role === 'owner', narrow) : null
  const routeKey = page === 'settings' ? `settings/${settingsSection ?? 'list'}` : page

  return (
    <Layout page={page === 'settings' && settingsSection ? `settings/${settingsSection}` : page} onNav={navigate}>
      <AccountAppearance />
      <ErrorBoundary key={routeKey} label="Page error">
        <Suspense fallback={<PageLoading />}>
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
        </Suspense>
      </ErrorBoundary>
    </Layout>
  )
}
