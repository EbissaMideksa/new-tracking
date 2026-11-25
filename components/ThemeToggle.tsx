// components/ThemeToggle.tsx
// Reusable light/dark toggle. `color` = icon colour; `hoverBg` = hover background.

"use client"

import { useTheme } from "@/context/ThemeContext"
import { Sun, Moon } from "lucide-react"

export default function ThemeToggle({
  color = "#475569",
  hoverBg = "#f1f5f9",
}: {
  color?: string
  hoverBg?: string
}) {
  const { theme, toggle, loaded } = useTheme()
  const isDark = theme === "dark"

  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        borderRadius: 8,
        background: "transparent",
        border: "1px solid transparent",
        color,
        cursor: "pointer",
        transition: "all .15s",
        opacity: loaded ? 1 : 0.5,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = hoverBg
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent"
      }}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
