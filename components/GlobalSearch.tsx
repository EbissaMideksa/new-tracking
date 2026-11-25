// components/GlobalSearch.tsx
// Global search dropdown in the topbar — searches assets, work orders, users.

"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"

export default function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<any>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) { setResults(null); return }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        if (res.ok) setResults(await res.json())
      } catch {}
      finally { setLoading(false) }
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const hasResults = results && (results.assets?.length || results.workOrders?.length || results.users?.length)

  return (
    <div ref={ref} style={{ position: "relative", flex: 1, maxWidth: 400 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "5px 10px", borderRadius: 8,
        border: "1px solid #e2e8f0", background: "#f8fafc",
        transition: "all 0.15s",
        ...(open && { border: "1px solid #3b82f6", background: "#fff" }),
      }}>
        <Search size={14} color="#94a3b8" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search assets, work orders, users..."
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent",
            fontSize: 12, color: "#334155", fontFamily: "inherit",
          }}
        />
        {loading && <span style={{ fontSize: 10, color: "#94a3b8" }}>...</span>}
      </div>

      {open && hasResults && (
        <div style={{
          position: "absolute", top: 40, left: 0, right: 0,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,0.12)", zIndex: 100,
          maxHeight: 400, overflowY: "auto",
        }}>
          {results.assets?.length > 0 && (
            <div>
              <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", borderBottom: "1px solid #f1f5f9" }}>
                Assets ({results.assets.length})
              </div>
              {results.assets.map((a: any) => (
                <div
                  key={a.id}
                  onClick={() => { router.push(`/dashboard/assets/${a.id}`); setOpen(false); setQuery("") }}
                  style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f8fafc", display: "flex", gap: 8, alignItems: "center" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f8fafc"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <span style={{ fontSize: 14 }}>📦</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{a.tagNumber || a.serialNumber}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{a.assetDescription || a.itemCode}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {results.workOrders?.length > 0 && (
            <div>
              <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", borderBottom: "1px solid #f1f5f9" }}>
                Work Orders ({results.workOrders.length})
              </div>
              {results.workOrders.map((w: any) => (
                <div
                  key={w.id}
                  onClick={() => { router.push(`/dashboard/workorders`); setOpen(false); setQuery("") }}
                  style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f8fafc", display: "flex", gap: 8, alignItems: "center" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f8fafc"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <span style={{ fontSize: 14 }}>🔧</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{w.workOrderNo || w.id.slice(0, 8)}: {w.title}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{w.status} · {w.priority}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {results.users?.length > 0 && (
            <div>
              <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", borderBottom: "1px solid #f1f5f9" }}>
                Users ({results.users.length})
              </div>
              {results.users.map((u: any) => (
                <div
                  key={u.id}
                  onClick={() => { router.push(`/dashboard/users`); setOpen(false); setQuery("") }}
                  style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f8fafc", display: "flex", gap: 8, alignItems: "center" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f8fafc"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <span style={{ fontSize: 14 }}>👤</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{u.name}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{u.email} · {u.role}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {open && !loading && query.trim().length >= 2 && !hasResults && (
        <div style={{
          position: "absolute", top: 40, left: 0, right: 0,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,0.12)", zIndex: 100,
          padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 12,
        }}>
          No results found for "{query}"
        </div>
      )}
    </div>
  )
}
