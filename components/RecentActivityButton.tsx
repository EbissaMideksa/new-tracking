// components/RecentActivityButton.tsx
//
// The dashboard's "Recent Activity" feed, moved off the bottom of the page and
// behind a floating button. The feed is fetched lazily the first time the panel
// is opened ("on demand"), so the dashboard no longer pays for the request or
// the vertical space until it is actually asked for.

"use client"

import { useEffect, useState } from "react"
import { Activity, X } from "lucide-react"

type FeedItem = {
  id: string
  type: string
  title: string
  user: string | null
  time: string
}

export default function RecentActivityButton() {
  const [open,    setOpen]    = useState(false)
  const [items,   setItems]   = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded,  setLoaded]  = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/activity-feed")
      const data = res.ok ? await res.json() : { items: [] }
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    // Fetch the first time it is opened, then keep the last result.
    if (next && !loaded) load()
  }

  // Esc closes the panel — same convention as the other dashboard modals.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const icons:  Record<string, string> = { asset: "📦", workorder: "🔧", system: "⚙️" }
  const colors: Record<string, string> = { asset: "#2563eb", workorder: "#7c3aed", system: "#64748b" }

  return (
    <>
      {/* Floating trigger — bottom-right, above the page content. */}
      <button
        type="button"
        onClick={toggle}
        title="Recent activity"
        aria-label="Recent activity"
        aria-expanded={open}
        style={{
          position: "fixed", right: 22, bottom: 22, zIndex: 900,
          display: "flex", alignItems: "center", gap: 7,
          padding: "10px 14px", borderRadius: 999, border: "none",
          background: "#2563eb", color: "#fff", cursor: "pointer",
          fontSize: 12, fontWeight: 700,
          boxShadow: "0 8px 24px rgba(37,99,235,.35)",
          transition: "transform .15s, box-shadow .15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)" }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)" }}
      >
        <Activity size={15} />
        Recent activity
        {loaded && items.length > 0 && (
          <span style={{
            background: "rgba(255,255,255,.25)", borderRadius: 999,
            padding: "0 6px", fontSize: 10, fontWeight: 700,
          }}>
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9998,
            background: "rgba(0,0,0,.4)",
            display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
            padding: 22,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Recent activity"
            onClick={e => e.stopPropagation()}
            style={{
              width: "min(420px, 100%)", maxHeight: "70vh",
              background: "#fff", borderRadius: 14,
              border: "1px solid #e2e8f0",
              boxShadow: "0 24px 60px rgba(0,0,0,.28)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            <div style={{
              padding: "14px 18px", borderBottom: "1px solid #f1f5f9",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Recent Activity</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close recent activity"
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", display: "flex" }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 18px 12px" }}>
              {loading ? (
                <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 12 }}>Loading…</div>
              ) : items.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 12 }}>No recent activity</div>
              ) : items.map((item, i) => (
                <div
                  key={item.id || i}
                  style={{
                    display: "flex", gap: 10, padding: "9px 0",
                    borderBottom: i < items.length - 1 ? "1px solid #f1f5f9" : "none",
                  }}
                >
                  <span style={{ fontSize: 16 }}>{icons[item.type] || "•"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: 0, fontSize: 12, color: "#334155", fontWeight: 500,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {item.title}
                    </p>
                    <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                      {item.user && <span style={{ fontSize: 10, color: "#94a3b8" }}>{item.user}</span>}
                      <span style={{ fontSize: 10, color: colors[item.type] || "#94a3b8" }}>
                        {new Date(item.time).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}


