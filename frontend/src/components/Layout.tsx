import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { useAppearance } from '../hooks/useAppearance'
import { NotificationBell } from './NotificationBell'
import { Button } from './ui/Button'

const NAV_LINKS = [
  { id: 'overview', label: 'Overview' },
  { id: 'review', label: 'Review' },
  { id: 'gigs', label: 'Gigs' },
  { id: 'artist', label: 'Artist' },
  { id: 'sync', label: 'Sync' },
  { id: 'promo', label: 'Promo' },
]

/**
 * The drawer. Everything you open occasionally rather than daily.
 *
 * "Log" is "History": a log is what a system writes, history is what you go
 * looking for.
 */
const MORE_LINKS = [
  { id: 'settings', label: 'Settings' },
  { id: 'runs', label: 'History' },
]

/** Sun and moon, inline so the toggle costs no request and follows currentColor. */
function ThemeIcon({ dark }: { dark: boolean }) {
  return dark ? (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12.3 2.6a7.4 7.4 0 1 0 5.1 8.9A6 6 0 0 1 12.3 2.6Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <circle cx="10" cy="10" r="4" />
      <path d="M10 1v2m0 14v2M1 10h2m14 0h2M3.9 3.9l1.4 1.4m9.4 9.4 1.4 1.4m0-12.2-1.4 1.4M5.3 14.7l-1.4 1.4"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  )
}

/**
 * Leaving admin mode, in the header, because it has to be reachable from the
 * surface you are leaving.
 *
 * No confirmation and no passkey: giving up privilege is not a privileged act,
 * and a prompt on the way out is one more prompt to learn to click through.
 */
function LeaveAdminMode() {
  const leave = useMutation({
    mutationFn: () => api.auth.setMode('artist'),
    // A reload for the same reason entering does one: every cached query
    // belongs to the surface being left, and refetching them all against the
    // other one is the app working correctly and looking broken.
    onSuccess: () => {
      window.location.assign('#overview')
      window.location.reload()
    },
  })

  return (
    <Button variant="neutral" onClick={() => leave.mutate()} disabled={leave.isPending}>
      {leave.isPending ? 'Leaving…' : 'Leave admin mode'}
    </Button>
  )
}

export function Layout({
  children,
  page,
  onNav,
  admin = false,
}: {
  children: ReactNode
  page: string
  onNav: (p: string) => void
  /**
   * The oversight surface. Not a variant of the artist one: the primary nav
   * and the bell both point at routes an admin-mode session is refused, so
   * rendering them would be offering what the server would turn down.
   */
  admin?: boolean
}) {
  const { appearance, set, resolved } = useAppearance()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Route changes close the mobile menu; leaving it open over the new page is
  // the classic hamburger bug.
  useEffect(() => setMenuOpen(false), [page])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [menuOpen])

  const toggleTheme = () => set({ theme: resolved === 'dark' ? 'light' : 'dark' })

  const linkClass = (id: string) =>
    `px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
      page === id ? 'bg-raised text-ink shadow-inset' : 'text-muted hover:text-ink hover:bg-sunken'
    }`

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 bg-surface/85 backdrop-blur-md border-b border-line">
        <div className="shell px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 h-14">
            <a
              href={admin ? '#admin' : '#overview'}
              className="font-semibold text-ink text-sm tracking-tight hover:text-body transition-colors shrink-0"
            >
              Scout <span className="text-faint font-normal">— Sun Dogs Music</span>
            </a>

            {admin ? (
              <p className="text-xs font-medium text-warn-fg bg-warn-bg rounded-full px-3 py-1">
                Admin mode — you cannot see anyone&rsquo;s work, including your own
              </p>
            ) : (
            <nav aria-label="Primary" className="hidden md:flex gap-0.5">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.id}
                  href={`#${l.id}`}
                  aria-current={page === l.id ? 'page' : undefined}
                  className={linkClass(l.id)}
                >
                  {l.label}
                </a>
              ))}
            </nav>
            )}

            <div className="flex items-center gap-1">
              {admin ? <LeaveAdminMode /> : <NotificationBell onNav={onNav} />}

              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
                title={
                  appearance.theme === 'system'
                    ? `Following your system (${resolved})`
                    : `${resolved[0].toUpperCase()}${resolved.slice(1)} theme`
                }
                className="p-2 rounded-md text-muted hover:text-ink hover:bg-sunken transition-colors"
              >
                <ThemeIcon dark={resolved === 'dark'} />
              </button>

              <div className={`relative ${admin ? 'hidden' : ''}`} ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-expanded={menuOpen}
                  aria-controls="mobile-nav"
                  aria-label="Menu"
                  className="p-2 rounded-md text-muted hover:text-ink hover:bg-sunken transition-colors"
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
                  </svg>
                </button>
                {menuOpen && (
                  <nav
                    id="mobile-nav"
                    aria-label="More"
                    className="absolute right-0 top-full mt-2 w-48 z-40 rounded-xl border border-line bg-surface shadow-pop p-1"
                  >
                    {/* Below md the main destinations have nowhere else to go. */}
                    <span className="md:hidden">
                      {NAV_LINKS.map((l) => (
                        <a
                          key={l.id}
                          href={`#${l.id}`}
                          aria-current={page === l.id ? 'page' : undefined}
                          className={`block ${linkClass(l.id)}`}
                        >
                          {l.label}
                        </a>
                      ))}
                      <hr className="border-line my-1" />
                    </span>
                    {MORE_LINKS.map((l) => (
                      <a
                        key={l.id}
                        href={`#${l.id}`}
                        aria-current={page === l.id ? 'page' : undefined}
                        className={`block ${linkClass(l.id)}`}
                      >
                        {l.label}
                      </a>
                    ))}
                  </nav>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main id="main" className="shell px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
        {children}
      </main>
    </div>
  )
}
