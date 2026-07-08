import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
})

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem('wc-theme') as Theme | null
    if (stored === 'dark' || stored === 'light') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/**
 * Applies theme by setting both:
 *  - data-theme attribute  → drives CSS variable token system (primary)
 *  - dark class            → retained for any legacy dark: Tailwind utilities
 * Both are set synchronously so CSS and Tailwind respond in the same frame.
 */
function applyTheme(theme: Theme) {
  const html = document.documentElement
  html.dataset.theme = theme
  if (theme === 'dark') {
    html.classList.add('dark')
  } else {
    html.classList.remove('dark')
  }
  try { localStorage.setItem('wc-theme', theme) } catch { /* no-op */ }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  // Keep DOM in sync on state changes (handles HMR, StrictMode double-runs, etc.)
  useEffect(() => { applyTheme(theme) }, [theme])

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)   // synchronous DOM update — same frame as click
    setTheme(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)

