import { type ReactNode } from 'react'

const NAV_LINKS = [
  { id: 'overview', label: 'Overview' },
  { id: 'gigs', label: 'Gigs' },
  { id: 'sync', label: 'Sync' },
  { id: 'promo', label: 'Promo' },
  { id: 'runs', label: 'Log' },
  { id: 'settings', label: 'Settings' },
]

export function Layout({ children, page }: { children: ReactNode; page: string }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <a
              href="#overview"
              className="font-semibold text-gray-900 text-sm tracking-tight hover:text-gray-600 transition-colors"
            >
              Doug McArthur — Music HQ
            </a>
            <div className="flex gap-0.5">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.id}
                  href={`#${l.id}`}
                  className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    page === l.id
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  )
}
