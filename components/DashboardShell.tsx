
// components/DashboardShell.tsx
"use client"

import { useState, useEffect } from "react"
import Topbar from "./Topbar"
import AdvancedSidebar from "./AdvancedSidebar"
import AssetCommandPalette from "./asset-assign/AssetCommandPalette"

export default function DashboardShell({
  user,
  children,
}: {
  user: any
  children: React.ReactNode
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 500) setMobileNavOpen(false)
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mobileNavOpen])

  return (
    <div className="h-screen flex flex-col">
      {/* Topbar spans the full width — the sidebar hangs below it rather than
          beside it, so the header can use the whole viewport instead of only
          the space to the right of a ~220px column. */}
      <Topbar user={user} onMenuClick={() => setMobileNavOpen(true)} />

      <div className="flex flex-1 min-h-0 overflow-hidden max-[500px]:w-full max-[500px]:overflow-x-hidden">
        {/* Desktop sidebar — CSS-hidden on mobile */}
        <div className="max-[500px]:hidden">
          <AdvancedSidebar />
        </div>

        {/* Mobile sidebar drawer — still offset by top-14 to sit under the bar */}
        {mobileNavOpen && (
          <>
            <div
              className="min-[501px]:hidden fixed inset-0 top-14 z-40 bg-black/40"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="min-[501px]:hidden fixed left-0 top-14 bottom-0 z-50 w-46 max-w-[78vw] bg-gray-50 shadow-2xl">
              <AdvancedSidebar
                mobileOpen
                onClose={() => setMobileNavOpen(false)}
              />
            </div>
          </>
        )}

        <AssetCommandPalette />

        <main
          className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-[var(--shell-bg)]"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
