// context/ThemeContext.tsx
// Light/dark theme provider.
// Resolution order: per-user localStorage override → global default
// (SystemSetting "theme" via /api/settings/theme) → "light".
// Applies a `dark` class on <html> + CSS variables (shell theming).

"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react"

type Theme = "light" | "dark"

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
  loaded: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggle: () => {},
  setTheme: () => {},
  loaded: false,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light")
  const [loaded, setLoaded] = useState(false)

  const apply = useCallback((t: Theme) => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", t === "dark")
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const stored =
      typeof window !== "undefined"
        ? (localStorage.getItem("theme") as Theme | null)
        : null

    if (stored === "light" || stored === "dark") {
      setThemeState(stored)
      apply(stored)
      setLoaded(true)
      return
    }

    // No per-user override → use the org-wide default.
    fetch("/api/settings/theme", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        const t: Theme = d?.theme === "dark" ? "dark" : "light"
        setThemeState(t)
        apply(t)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [apply])

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t)
      if (typeof window !== "undefined") localStorage.setItem("theme", t)
      apply(t)
    },
    [apply],
  )

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme, loaded }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
