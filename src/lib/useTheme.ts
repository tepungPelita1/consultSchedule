import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem('theme') as Theme | null
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Tema global — sync dengan <html data-theme> dan localStorage.
 * Klik ikon kucing toggles light ↔ dark.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('theme', theme)
  }, [theme])

  const TRANSITION_CLASS = 'theme-switching'
  const TRANSITION_DURATION = 460

  const toggle = () => {
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light'
      if (typeof document !== 'undefined') {
        document.documentElement.classList.add(TRANSITION_CLASS)
        window.setTimeout(() => {
          document.documentElement.classList.remove(TRANSITION_CLASS)
        }, TRANSITION_DURATION)
      }
      return next
    })
  }

  return { theme, toggle, isDark: theme === 'dark' }
}
