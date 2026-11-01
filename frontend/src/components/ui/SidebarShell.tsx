import { useEffect, useRef, type ReactNode } from 'react'
import { Caption } from './Surface'

/**
 * A list of pages on the left and the page on the right.
 *
 * Extracted when Settings wanted what the admin pages already had, rather than
 * copied: the admin surface was one column eight panels long and Settings was a
 * row of tabs over a two-column grid of cards, and both want the same thing, a
 * way to any other page that is never further than where you are. One shell
 * means a change to how it looks, or to how it behaves on a phone, is one edit.
 *
 * On a wide screen the list stays in view while the page scrolls. On a narrow
 * one there is no room beside the content, so the same links lay out as a row
 * that scrolls sideways above it, without the group names, and the page you are
 * on is scrolled into view. They are plain links, so the browser's back button,
 * a bookmark and a link sent to yourself all land on the page they name.
 */

/**
 * A count beside a page's name. *Waiting* is something to answer and is plain;
 * *attention* is something that is wrong and is tinted. `noun` is said to a
 * screen reader after the number: "3 unread".
 */
export interface SidebarBadge {
  count: number
  tone: 'waiting' | 'attention'
  noun: string
}

export interface SidebarGroup<T extends string> {
  label: string
  sections: ReadonlyArray<{ id: T; label: string }>
}

export function SidebarShell<T extends string>({
  label,
  groups,
  current,
  hrefFor,
  badges = {},
  children,
}: {
  /** Names the navigation for a screen reader: "Admin pages". */
  label: string
  groups: ReadonlyArray<SidebarGroup<T>>
  current: T
  hrefFor: (id: T) => string
  badges?: Partial<Record<T, SidebarBadge>>
  children: ReactNode
}) {
  const strip = useRef<HTMLDivElement>(null)

  // Where the links are a row that scrolls sideways, the page you are on may
  // be off the edge of it, so bring it into view. Not beside the content, where
  // the list is vertical and always whole.
  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) return
    strip.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [current])

  return (
    <div className="space-y-6 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-x-10 lg:space-y-0">
      <nav aria-label={label} className="lg:sticky lg:top-20">
        <div
          ref={strip}
          className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:block lg:space-y-5 lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="flex gap-1 lg:block lg:space-y-0.5">
              <Caption className="hidden px-3 pb-1 lg:block">{group.label}</Caption>
              {group.sections.map((s) => {
                const badge = badges[s.id]
                const here = s.id === current
                return (
                  <a
                    key={s.id}
                    href={hrefFor(s.id)}
                    aria-current={here ? 'page' : undefined}
                    className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      here ? 'bg-raised text-ink shadow-inset' : 'text-muted hover:bg-sunken hover:text-ink'
                    }`}
                  >
                    {s.label}
                    {badge && (
                      <span
                        className={`rounded-full px-1.5 text-xs font-medium tabular-nums ${
                          badge.tone === 'attention' ? 'bg-warn-bg text-warn-fg' : 'bg-sunken text-body'
                        }`}
                      >
                        {badge.count}
                        <span className="sr-only"> {badge.noun}</span>
                      </span>
                    )}
                  </a>
                )
              })}
            </div>
          ))}
        </div>
      </nav>

      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  )
}
