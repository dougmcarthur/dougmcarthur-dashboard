import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DOCK_MIN_WIDTH_PX,
  isDocked,
  loadSidePanel,
  saveSidePanel,
  type SidePanelId,
  type SidePanelState,
} from '../sidePanel'

export interface SidePanelControls extends SidePanelState {
  /** The screen is wide enough to hold a docked panel at all. */
  wide: boolean
  /** Pinned, open and wide: the column is beside the page right now. */
  docked: boolean
  /** Whether the column is showing this panel right now. */
  showing: (panel: SidePanelId) => boolean
  /** Pin the notifications, from the dropdown that is giving way to them. */
  pin: () => void
  /** Back to a dropdown. The column goes, and so does whatever was in it. */
  unpin: () => void
  /** Pin the column and show this panel in it. */
  show: (panel: SidePanelId) => void
  /** Put the column away without unpinning it. */
  hide: () => void
  /** Switch panels in a column that stays open. */
  select: (panel: SidePanelId) => void
  /**
   * What the button for a panel does: hide the column if it is showing that
   * panel, and otherwise show it. The bell and the answers button are both this.
   */
  toggle: (panel: SidePanelId) => void
}

function useWide(): boolean {
  const query = `(min-width: ${DOCK_MIN_WIDTH_PX}px)`
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches)

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia(query)
    const onChange = () => setWide(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return wide
}

export function useSidePanel(): SidePanelControls {
  const [state, setState] = useState<SidePanelState>(loadSidePanel)
  const wide = useWide()

  useEffect(() => saveSidePanel(state), [state])

  const show = useCallback((panel: SidePanelId) => setState({ pinned: true, open: true, panel }), [])
  const pin = useCallback(() => show('notifications'), [show])
  const unpin = useCallback(() => setState((s) => ({ ...s, pinned: false, open: true })), [])
  const hide = useCallback(() => setState((s) => ({ ...s, open: false })), [])
  const select = useCallback((panel: SidePanelId) => setState((s) => ({ ...s, panel })), [])
  const toggle = useCallback(
    (panel: SidePanelId) =>
      setState((s) =>
        s.pinned && s.open && s.panel === panel
          ? { ...s, open: false }
          : { pinned: true, open: true, panel },
      ),
    [],
  )

  return useMemo(() => {
    const docked = isDocked(state, wide)
    return {
      ...state,
      wide,
      docked,
      showing: (panel: SidePanelId) => docked && state.panel === panel,
      pin,
      unpin,
      show,
      hide,
      select,
      toggle,
    }
  }, [state, wide, pin, unpin, show, hide, select, toggle])
}
