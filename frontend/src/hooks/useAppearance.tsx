import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

interface AppearanceContext {
  appearance: Appearance
  /** Patch one or more fields; the rest are left alone. */
  set: (patch: Partial<Appearance>) => void
  reset: () => void
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

  const set = useCallback((patch: Partial<Appearance>) => {
    setAppearance((prev) => ({ ...prev, ...patch }))
  }, [])

  const reset = useCallback(() => setAppearance(DEFAULTS), [])

  const value = useMemo<AppearanceContext>(
    () => ({ appearance, set, reset, resolved: resolveTheme(appearance) }),
    // systemDark is not read here, but a change to it changes what
    // resolveTheme() returns, so it belongs in the dependency list.
    [appearance, set, reset, systemDark],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppearance(): AppearanceContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppearance must be used inside an AppearanceProvider')
  return ctx
}
