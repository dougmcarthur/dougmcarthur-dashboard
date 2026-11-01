/**
 * The pages of the admin surface, and the names they go by.
 *
 * The admin screen was one column eight panels long. It is a sidebar of pages
 * now, and this list is the only place their names live: the sidebar, the tab
 * title and the router all read it, so a page cannot be called one thing in the
 * menu and another in the tab.
 *
 * Names say what a page holds in the owner's words. "Pages Scout reads" became
 * *External data sources*, because the thing being managed is a source of data
 * that lives outside the app, and the pages were only ever its address.
 *
 * Plain data, no React, so the tab-title code can read it without importing a
 * screen.
 */

export type AdminSectionId =
  | 'artists'
  | 'invitations'
  | 'feedback'
  | 'sources'
  | 'findings'
  | 'listings'
  | 'survey'
  | 'drive'
  | 'search'
  | 'changes'

export interface AdminSectionDef {
  id: AdminSectionId
  label: string
}

export interface AdminGroupDef {
  label: string
  sections: readonly AdminSectionDef[]
}

export const ADMIN_GROUPS: readonly AdminGroupDef[] = [
  {
    label: 'Find',
    sections: [{ id: 'search', label: 'Search' }],
  },
  {
    label: 'People',
    sections: [
      { id: 'artists', label: 'Artists' },
      { id: 'invitations', label: 'Invitations' },
      { id: 'feedback', label: 'Feedback' },
    ],
  },
  {
    label: 'Catalog',
    sections: [
      { id: 'sources', label: 'External data sources' },
      { id: 'findings', label: 'Source findings' },
      { id: 'listings', label: 'Landing page listings' },
    ],
  },
  {
    label: 'Research',
    sections: [{ id: 'survey', label: 'Artist survey' }],
  },
  {
    label: 'Integrations',
    sections: [{ id: 'drive', label: 'Google Drive picker' }],
  },
  {
    label: 'Record',
    sections: [{ id: 'changes', label: 'Change log' }],
  },
]

export const DEFAULT_ADMIN_SECTION: AdminSectionId = 'artists'

const ALL: readonly AdminSectionDef[] = ADMIN_GROUPS.flatMap((g) => g.sections)

export function isAdminSection(value: string | null | undefined): value is AdminSectionId {
  return ALL.some((s) => s.id === value)
}

/** The section a route argument names; anything else is the first page, so a stale link still lands somewhere. */
export function adminSectionFromArg(arg: string | null | undefined): AdminSectionId {
  return isAdminSection(arg) ? arg : DEFAULT_ADMIN_SECTION
}

export function adminSectionLabel(id: string): string | null {
  return ALL.find((s) => s.id === id)?.label ?? null
}
