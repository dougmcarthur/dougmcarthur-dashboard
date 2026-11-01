/**
 * The pages of Settings, and the names they go by.
 *
 * Settings was four tabs holding a dozen cards, with a two-column grid under
 * each, so "Account" meant your name, where you travel from, your passkeys, the
 * agents' tokens and the way into admin mode. It is a sidebar of pages now, the
 * same shape as the admin surface (`../admin/sections.ts`), and this list is the
 * only place the pages and their names live: the sidebar, the tab title and the
 * router all read it.
 *
 * **Every old address still works.** `#settings/connections` is where Google's
 * consent lands and where the bell's "Calendar disconnected" points, and
 * `#settings/account` is in emails and notifications already sent, so the four
 * ids of the tabs are read as the pages that replaced them (`LEGACY`). That is
 * the same "read both spellings" move `normaliseGigStatus` makes, and for the
 * same reason: a link in somebody's inbox outlives the version it was written for.
 *
 * Plain data, no React, so the tab-title code can read it without importing a screen.
 */

export type SettingsSectionId =
  | 'profile'
  | 'security'
  | 'google'
  | 'services'
  | 'reminders'
  | 'appearance'
  | 'tokens'
  | 'admin'

export interface SettingsSectionDef {
  id: SettingsSectionId
  label: string
}

export interface SettingsGroupDef {
  label: string
  /** Only an owner is shown, or can open, what is in it. */
  ownerOnly?: boolean
  sections: readonly SettingsSectionDef[]
}

export const SETTINGS_GROUPS: readonly SettingsGroupDef[] = [
  {
    label: 'Account',
    sections: [
      { id: 'profile', label: 'Profile' },
      { id: 'security', label: 'Sign-in and security' },
    ],
  },
  {
    label: 'Connections',
    sections: [
      { id: 'google', label: 'Google account' },
      { id: 'services', label: 'Other services' },
    ],
  },
  {
    label: 'Notifications',
    sections: [{ id: 'reminders', label: 'Reminders and digest' }],
  },
  {
    label: 'Display',
    sections: [{ id: 'appearance', label: 'Appearance' }],
  },
  {
    label: 'Owner',
    ownerOnly: true,
    sections: [
      { id: 'tokens', label: 'Agent tokens' },
      { id: 'admin', label: 'Admin mode' },
    ],
  },
]

/** Where somebody lands who has nothing more specific. Google's consent round trip arrives here too. */
export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'google'

/** The tabs this replaced. `connections` and `account` were the two that held several pages' worth. */
export const LEGACY: Readonly<Record<string, SettingsSectionId>> = {
  connections: 'google',
  account: 'profile',
}

const ALL: ReadonlyArray<SettingsSectionDef & { ownerOnly: boolean }> = SETTINGS_GROUPS.flatMap((g) =>
  g.sections.map((s) => ({ ...s, ownerOnly: g.ownerOnly === true })),
)

/** The groups this person is shown: an artist's sidebar has nothing in it that is not theirs. */
export function settingsGroupsFor(owner: boolean): readonly SettingsGroupDef[] {
  return SETTINGS_GROUPS.filter((g) => owner || !g.ownerOnly)
}

/** The page a route argument names for this person, or null. An old tab id is read as its replacement. */
function named(arg: string | null | undefined, owner: boolean): SettingsSectionId | null {
  const id = (arg && LEGACY[arg]) || arg
  const found = ALL.find((s) => s.id === id)
  // The server is the lock on the owner's pages; this is only what is drawn.
  return found && (owner || !found.ownerOnly) ? found.id : null
}

/**
 * Which page to draw: the one the route names, or `null` for the list of pages.
 *
 * Only a narrow screen has a list (the way the iOS Settings app opens), so a
 * bare `#settings` is the list on a phone and the default page on a laptop.
 * That is why the OAuth callback now returns to `#settings/google` and not to
 * `#settings?google=…`: a bare address on a phone is the list, and the notice
 * about how the trip to Google went has to be on the page that shows it.
 */
export function resolveSettingsRoute(
  arg: string | null | undefined,
  owner: boolean,
  narrow: boolean,
): SettingsSectionId | null {
  return named(arg, owner) ?? (narrow ? null : DEFAULT_SETTINGS_SECTION)
}

export function settingsSectionLabel(id: string): string | null {
  return ALL.find((s) => s.id === id)?.label ?? null
}
