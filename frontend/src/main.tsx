import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AuthGate } from './components/AuthGate'
import { AppearanceProvider } from './hooks/useAppearance'
import { applyAppearance, loadAppearance } from './appearance'
import './fonts'
import './themes.css'
import './index.css'

// Applied before React mounts. Doing it in an effect instead would paint one
// frame of the default theme first, which reads as a flash of white on a dark
// screen — the thing dark mode is most often turned on to avoid.
applyAppearance(loadAppearance())

const queryClient: QueryClient = new QueryClient({
  // Any successful write may change what the admin sidebar counts, and it is
  // cheaper to ask again than to know which writes can. Nothing happens when the
  // badges are not on screen: an inactive query is only marked stale.
  mutationCache: new MutationCache({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'badges'] })
    },
  }),
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppearanceProvider>
      <QueryClientProvider client={queryClient}>
        {/* Outside App, not inside it: the login screen has no navigation,
            no page chrome and nothing to route to. */}
        <AuthGate>
          <App />
        </AuthGate>
      </QueryClientProvider>
    </AppearanceProvider>
  </StrictMode>,
)
