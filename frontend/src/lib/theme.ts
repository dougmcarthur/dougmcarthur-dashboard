import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const KEY = 'musichq-theme'

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function applyTheme(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

/** Reads the stored choice before first paint — set from index.html. */
export function storedTheme(): Theme {
  const value = localStorage.getItem(KEY)
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => storedTheme())

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
    applyTheme(next)
  }, [])

  // Follow the OS while the choice is "system".
  useEffect(() => {
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [theme])

  return { theme, setTheme }
}
