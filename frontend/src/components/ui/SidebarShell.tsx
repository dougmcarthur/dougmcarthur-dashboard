import { useEffect, type ReactNode } from 'react'
import { useNarrow } from '../../hooks/useNarrow'
import { Caption, Card, PageTitle } from './Surface'

/**
 * A list of pages and the page, laid out for the screen it is on.
 *
 * Extracted when Settings wanted what the admin pages already had, rather than
 * copied: the admin surface was one column eight panels long and Settings was a
 * row of tabs over a two-column grid of cards, and both want the same thing, a
 * way to any other page that is never further than where you are. One shell
 * means a change to how it looks, or to how it behaves on a phone, is one edit.
 *
 * **Wide: a sidebar beside the page.** The list stays in view while the page
 * scrolls.
 *
 * **Narrow: the list is a page of its own, and each page opens from it** — the
 * way the iOS Settings app works. `#settings` on a phone is the list, a row
 * opens its page, and a link at the top of the page goes back to the list. It
 * was a row of links that scrolled sideways above the page, which hid most of
 * the pages off the edge of the screen and made you swipe to find out what else
 * was there. A list shows everything at once, with room for a badge and a thumb
 * to hit each row.
 *
 * `current` is `null` for the list, and only a narrow screen asks for it. They
 * are plain links either way, so the browser's back button, a bookmark and a
 * link sent to yourself all land on the page they name.
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

function BadgePill({ badge }: { badge: SidebarBadge }) {
  return (
    <span
      className={`rounded-full px-1.5 text-xs font-medium tabular-nums ${
        badge.tone === 'attention' ? 'bg-warn-bg text-warn-fg' : 'bg-sunken text-body'
      }`}
    >
      {badge.count}
      <span className="sr-only"> {badge.noun}</span>
    </span>
  )
}

/** A chevron, drawn in `currentColor` so it follows the theme. Points right, or left for "back". */
function Chevron({ back = false }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d={back ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SidebarShell<T extends string>({
  label,
  title,
  groups,
  current,
  hrefFor,
  indexHref,
  badges = {},
  top,
  children,
}: {
  /** Names the navigation for a screen reader: "Settings pages". */
  label: string
  /** The list's own heading on a phone, and what the way back to it is called: "Settings". */
  title: string
  groups: ReadonlyArray<SidebarGroup<T>>
  /** The page showing, or `null` for the list on a narrow screen. */
  current: T | null
  hrefFor: (id: T) => string
  /** Where "back to the list" goes: `#settings`. */
  indexHref: string
  badges?: Partial<Record<T, SidebarBadge>>
  /**
   * Something above the pages, in the sidebar and in the list a phone opens on:
   * a search field, the way the iOS Settings app has one. Not on a page opened
   * from the list, where it would be a field with nothing to search.
   */
  top?: ReactNode
  children: ReactNode
}) {
  const narrow = useNarrow()

  // A page opened from the list starts at its top, and so does the list when
  // you come back to it, rather than wherever the last one was left.
  useEffect(() => {
    if (narrow) window.scrollTo(0, 0)
  }, [current, narrow])

  if (narrow) {
    if (current === null) {
      return (
        <nav aria-label={label} className="space-y-6">
          <PageTitle>{title}</PageTitle>
          {top}
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="space-y-1.5">
              <Caption className="px-4">{group.label}</Caption>
              <Card pad="none" divided clip>
                {group.sections.map((s) => {
                  const badge = badges[s.id]
                  return (
                    <a
                      key={s.id}
                      href={hrefFor(s.id)}
                      className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 text-sm text-ink transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                    >
                      {s.label}
                      <span className="flex items-center gap-2 text-muted">
                        {badge && <BadgePill badge={badge} />}
                        <Chevron />
                      </span>
                    </a>
                  )
                })}
              </Card>
            </div>
          ))}
        </nav>
      )
    }

    return (
      <div className="space-y-4">
        <a
          href={indexHref}
          aria-label={`Back to ${title}`}
          className="-ml-1 inline-flex min-h-10 items-center gap-0.5 rounded-md pr-3 text-sm font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Chevron back />
          {title}
        </a>
        {children}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[13.5rem_minmax(0,1fr)] items-start gap-x-10">
      <nav aria-label={label} className="sticky top-20 space-y-5">
        {top}
        {groups.map((group) => (
          <div key={group.label} role="group" aria-label={group.label} className="space-y-0.5">
            <Caption className="px-3 pb-1">{group.label}</Caption>
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
                  {badge && <BadgePill badge={badge} />}
                </a>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  )
}
