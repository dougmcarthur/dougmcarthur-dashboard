import { type ReactNode } from 'react'
import { Toaster } from 'sonner'
import { LayoutDashboard, Music, Library, Radio, Megaphone, ScrollText, Settings, Sun, Moon, Monitor } from 'lucide-react'
import { useTheme, type Theme } from '../lib/theme'
import { cn } from '../lib/cn'

const NAV_LINKS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'gigs', label: 'Gigs', icon: Music },
  { id: 'library', label: 'Answers', icon: Library },
  { id: 'sync', label: 'Sync', icon: Radio },
  { id: 'promo', label: 'Promo', icon: Megaphone },
  { id: 'runs', label: 'Log', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const THEMES: Array<{ value: Theme; icon: typeof Sun; label: string }> = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'Match system' },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5"
    >
      {THEMES.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            'flex size-6 items-center justify-center rounded transition-colors',
            theme === value ? 'bg-surface-muted text-ink' : 'text-ink-subtle hover:text-ink',
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  )
}

export function Layout({ children, page }: { children: ReactNode; page: string }) {
  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg"
      >
        Skip to content
      </a>

      <nav className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a
            href="#overview"
            className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight text-ink transition-colors hover:text-brand"
          >
            <span className="grid size-6 place-items-center rounded bg-brand text-xs text-on-accent">M</span>
            <span className="hidden sm:inline">Music HQ</span>
          </a>

          <div className="flex min-w-0 flex-1 justify-center gap-0.5 overflow-x-auto">
            {NAV_LINKS.map((l) => {
              const Icon = l.icon
              const active = page === l.id
              return (
                <a
                  key={l.id}
                  href={`#${l.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-ink text-on-accent'
                      : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                  )}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  <span className="hidden md:inline">{l.label}</span>
                </a>
              )
            })}
          </div>

          <ThemeToggle />
        </div>
      </nav>

      <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>

      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: 'bg-surface border border-line text-ink rounded-card shadow-lg text-sm',
            description: 'text-ink-muted',
          },
        }}
      />
    </div>
  )
}
