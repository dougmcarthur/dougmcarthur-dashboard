import type { ReactNode } from 'react'
import { Explainer } from './Explainer'
import { PAGE_TITLE } from './Surface'

/**
 * The top of an admin page: its name, what it is for behind the info button,
 * and the one or two actions that belong to the whole page.
 *
 * Each admin section is a page of its own with a single `h1`, so what the tab
 * says, what the sidebar highlights and what a screen reader announces are the
 * same words. A page with several parts gives each part an `h2` of its own.
 */
export function SectionHeader({
  title,
  actions,
  children,
}: {
  title: string
  /** Controls for the whole page: a "read now" button, a status line. */
  actions?: ReactNode
  /** What the page is for, tucked behind the info button. */
  children?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <Explainer as="h1" title={title} titleClassName={PAGE_TITLE}>
        {children}
      </Explainer>
      {actions && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{actions}</div>}
    </header>
  )
}
