/**
 * The side panel: whether the notifications are pinned to the right of the
 * screen, and whether the pinned panel is showing.
 *
 * localStorage, for the reason `appearance.ts` gives: this describes one person
 * on one screen. Pinning a panel on a wide monitor must not pin it on the phone
 * that opens the same account, so it is a preference of the browser and not a
 * setting of the account.
 *
 * Two flags rather than one. `pinned` is the choice (the bell is a panel that
 * stays, not a dropdown); `open` is whether it is out right now. Collapsing a
 * pinned panel to get the width back must not unpin it, or the next click on the
 * bell would open a dropdown where the person expected their panel.
 */

/**
 * What can be in the column, one at a time. The order is the order of the tabs.
 *
 * `notifications` is first because it is the one with a second life as a
 * dropdown: it is what the bell opens. `answers` has no dropdown and no bell, so
 * on a screen too narrow to dock to it opens as a dialog instead.
 */
export const SIDE_PANELS = ['notifications', 'answers'] as const
export type SidePanelId = (typeof SIDE_PANELS)[number]

export const SIDE_PANEL_LABELS: Record<SidePanelId, string> = {
  notifications: 'Notifications',
  answers: 'Answers',
}

export interface SidePanelState {
  pinned: boolean
  open: boolean
  /** Which one the column is showing, or would show the next time it opens. */
  panel: SidePanelId
}

export const DEFAULT_SIDE_PANEL: SidePanelState = { pinned: false, open: true, panel: 'notifications' }

const KEY = 'scout.sidePanel'

/**
 * Tailwind's `xl`, and measured rather than chosen: the Gigs table needs about
 * 830px of page, the panel takes 352 of the screen, and the page's own gutters
 * take 64. At 1100px, which the first version allowed, the table fell behind a
 * horizontal scroll inside its card on every visit. At 1280 it fits, with a
 * little to spare. Below it the bell stays a dropdown, and a pinned panel waits
 * for a wider window instead of squeezing the page.
 */
export const DOCK_MIN_WIDTH_PX = 1280

export function loadSidePanel(): SidePanelState {
  if (typeof localStorage === 'undefined') return DEFAULT_SIDE_PANEL
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SIDE_PANEL
    const parsed = JSON.parse(raw) as Partial<SidePanelState>
    // Each field is checked, not spread: a value from an older shape or a
    // hand-edited key must fall back to the default rather than arrive as a
    // string that happens to be truthy.
    return {
      pinned: typeof parsed.pinned === 'boolean' ? parsed.pinned : DEFAULT_SIDE_PANEL.pinned,
      open: typeof parsed.open === 'boolean' ? parsed.open : DEFAULT_SIDE_PANEL.open,
      // A panel this version has never heard of, from a newer build or a hand
      // edit, opens the first one rather than an empty column.
      panel: (SIDE_PANELS as readonly string[]).includes(parsed.panel as string)
        ? (parsed.panel as SidePanelId)
        : DEFAULT_SIDE_PANEL.panel,
    }
  } catch {
    return DEFAULT_SIDE_PANEL
  }
}

export function saveSidePanel(state: SidePanelState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Private browsing, or storage full. The panel still works this session.
  }
}

/**
 * Whether the panel is drawn beside the page.
 *
 * Pinned, open, and wide enough. A pinned panel on a screen that cannot hold it
 * is not an error and not a lost preference: the bell is a dropdown there, and
 * the panel is back the moment the window is wide again.
 */
export function isDocked(state: SidePanelState, wide: boolean): boolean {
  return state.pinned && state.open && wide
}
