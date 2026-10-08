import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  applyAppearance,
  loadAppearance,
  resolveTheme,
  saveAppearance,
  DEFAULTS,
  type Appearance,
} from '../appearance'
import { api } from '../api'
import type { PaletteId } from '../../../shared/themes'

interface AppearanceContext {
  appearance: Appearance
  /** Patch one or more fields; the rest are left alone. */
  set: (patch: Partial<Appearance>) => void
  reset: () => void
  /**
   * The colour theme follows the account, and only while an account is in
   * view: signed out, or in admin mode, nothing here reads or writes the
   * server. See `AccountAppearance`.
   */
  bindAccount: (on: boolean) => void
  /** Take the account's colour theme as this device's, without sending it back. */
  adoptPalette: (palette: PaletteId) => void
  /** What 'system' actually resolved to, for labelling the control. */
  resolved: 'light' | 'dark'
}

const Ctx = createContext<AppearanceContext | null>(null)

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(loadAppearance)
  const [systemDark, setSystemDark] = useState(false)

  // Applied in an effect as well as before paint (see main.tsx) so that a
  // change made in the settings panel reaches the document immediately.
  useEffect(() => {
    applyAppearance(appearance)
    saveAppearance(appearance)
  }, [appearance])

  // Following the OS means following it as it changes, not only at load.
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      setSystemDark(mq.matches)
      if (appearance.theme === 'system') applyAppearance(appearance)
    }
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [appearance])

  // The same for contrast, while contrast or the colour theme is still following the device.
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    if (appearance.highContrast !== null && appearance.palette !== null) return
    const mq = matchMedia('(prefers-contrast: more)')
    const onChange = () => applyAppearance(appearance)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [appearance])

  // The choice applies on this device at once; the account hears about it in
  // the background, in order, and a failed save costs nothing but the sync.
  const accountBound = useRef(false)
  const pending = useRef<Promise<unknown>>(Promise.resolve())
  const pushPalette = useCallback((palette: PaletteId | null) => {
    if (!accountBound.current) return
    pending.current = pending.current.then(() => api.appearance.save(palette)).catch(() => undefined)
  }, [])

  const set = useCallback(
    (patch: Partial<Appearance>) => {
      setAppearance((prev) => ({ ...prev, ...patch }))
      if ('palette' in patch) pushPalette(patch.palette ?? null)
    },
    [pushPalette],
  )

  const reset = useCallback(() => {
    setAppearance(DEFAULTS)
    pushPalette(null)
  }, [pushPalette])

  const bindAccount = useCallback((on: boolean) => {
    accountBound.current = on
  }, [])

  const adoptPalette = useCallback((palette: PaletteId) => {
    setAppearance((prev) => (prev.palette === palette ? prev : { ...prev, palette }))
  }, [])

  const value = useMemo<AppearanceContext>(
    () => ({ appearance, set, reset, bindAccount, adoptPalette, resolved: resolveTheme(appearance) }),
    // systemDark is not read here, but a change to it changes what
    // resolveTheme() returns, so it belongs in the dependency list.
    [appearance, set, reset, bindAccount, adoptPalette, systemDark],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppearance(): AppearanceContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppearance must be used inside an AppearanceProvider')
  return ctx
}

/**
 * Mount this wherever an artist is signed in and nowhere else.
 *
 * The device's own value is what paints first, so nothing waits on the network.
 * Once, after sign-in, the account's colour theme is read; if it differs it
 * replaces this device's. A failed read changes nothing.
 */
export function AccountAppearance() {
  const { bindAccount, adoptPalette } = useAppearance()
  useEffect(() => {
    bindAccount(true)
    let live = true
    api.appearance
      .read()
      .then(({ palette }) => {
        if (live && palette) adoptPalette(palette)
      })
      .catch(() => undefined)
    return () => {
      live = false
      bindAccount(false)
    }
  }, [bindAccount, adoptPalette])
  return null
}
