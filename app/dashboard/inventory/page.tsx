"use client"

import { useEffect, useState, useMemo } from "react"
import { useToast } from "@/components/ToastProvider"
import { getCategoryBadge } from "@/lib/assetCategories"

export default function InventoryCountPage() {
  const { showToast } = useToast()
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [counts, setCounts] = useState<Record<string, "found" | "missing" | "uncertain">>({})
  const [filter, setFilter] = useState<"all" | "found" | "missing" | "uncertain" | "uncounted">("all")

  async function load() {
    try {
      const res = await fetch("/api/inventory-count")
      if (!res.ok) return
      const data = await res.json()
      setAssets(data.assets || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function mark(assetId: string, status: "found" | "missing" | "uncertain") {
    setCounts(prev => ({ ...prev, [assetId]: status }))
    await fetch("/api/inventory-count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, status }),
    })
  }

  const filtered = useMemo(() => {
    let result = assets
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(a =>
        a.tagNumber?.toLowerCase().includes(q) ||
        a.serialNumber?.toLowerCase().includes(q) ||
        a.itemCode?.toLowerCase().includes(q) ||
        a.assetDescription?.toLowerCase().includes(q)
      )
    }
    if (filter !== "all") {
      result = result.filter(a => {
        const status = counts[a.id] || "uncounted"
        return status === filter
      })
    }
    return result
  }, [assets, search, counts, filter])

  const stats = useMemo(() => {
    const found = assets.filter(a => counts[a.id] === "found").length
    const missing = assets.filter(a => counts[a.id] === "missing").length
    const uncertain = assets.filter(a => counts[a.id] === "uncertain").length
    const uncounted = assets.length - found - missing - uncertain
    return { total: assets.length, found, missing, uncertain, uncounted }
  }, [assets, counts])

  if (loading) return <div className="p-6 text-gray-400">Loading inventory...</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Inventory Count</h1>
        <div className="flex gap-2">
          {stats.found > 0 && (
            <button
              onClick={() => showToast(`Inventory report: ${stats.found} found, ${stats.missing} missing, ${stats.uncounted} uncounted`, "success")}
              className="px-3 py-1.5 bg-gray-800 text-white rounded text-sm font-medium"
            >
              Summary
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Total", value: stats.total, color: "#2563eb", bg: "#eff6ff" },
          { label: "Found", value: stats.found, color: "#059669", bg: "#ecfdf5" },
          { label: "Missing", value: stats.missing, color: "#dc2626", bg: "#fef2f2" },
          { label: "Uncertain", value: stats.uncertain, color: "#d97706", bg: "#fffbeb" },
          { label: "Uncounted", value: stats.uncounted, color: "#6b7280", bg: "#f9fafb" },
        ].map(s => (
          <div key={s.label} className="p-3 rounded shadow" style={{ background: s.bg, border: `1px solid ${s.color}22` }}>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs font-semibold text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by tag, serial, item code..."
          className="px-3 py-2 border rounded text-sm flex-1 min-w-200"
        />
        <select value={filter} onChange={e => setFilter(e.target.value as any)} className="px-3 py-2 border rounded text-sm">
          <option value="all">All ({stats.total})</option>
          <option value="found">Found ({stats.found})</option>
          <option value="missing">Missing ({stats.missing})</option>
          <option value="uncertain">Uncertain ({stats.uncertain})</option>
          <option value="uncounted">Uncounted ({stats.uncounted})</option>
        </select>
      </div>

      {/* Asset list */}
      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left p-3 text-xs font-bold text-gray-500 uppercase">Tag #</th>
              <th className="text-left p-3 text-xs font-bold text-gray-500 uppercase">Serial #</th>
              <th className="text-left p-3 text-xs font-bold text-gray-500 uppercase">Description</th>
              <th className="text-left p-3 text-xs font-bold text-gray-500 uppercase">Category</th>
              <th className="text-left p-3 text-xs font-bold text-gray-500 uppercase">Org Unit</th>
              <th className="text-center p-3 text-xs font-bold text-gray-500 uppercase">Count Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-gray-400">No assets match the filter.</td></tr>
            ) : (
              filtered.slice(0, 200).map(a => {
                const status = counts[a.id] || "uncounted"
                const badge = getCategoryBadge(a.category)
                return (
                  <tr key={a.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs font-semibold">{a.tagNumber || "—"}</td>
                    <td className="p-3 font-mono text-xs">{a.serialNumber}</td>
                    <td className="p-3 text-xs">{a.assetDescription || a.itemCode || "—"}</td>
                    <td className="p-3">
                      <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: badge.bg, color: badge.color }}>
                        {badge.icon} {a.category || "—"}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-500">{a.orgUnit?.name || "—"}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => mark(a.id, "found")}
                          className="px-2 py-1 text-xs rounded font-medium"
                          style={{
                            background: status === "found" ? "#059669" : "#f0fdf4",
                            color: status === "found" ? "#fff" : "#059669",
                            border: "1px solid #bbf7d0",
                          }}
                        >
                          ✓ Found
                        </button>
                        <button
                          onClick={() => mark(a.id, "missing")}
                          className="px-2 py-1 text-xs rounded font-medium"
                          style={{
                            background: status === "missing" ? "#dc2626" : "#fef2f2",
                            color: status === "missing" ? "#fff" : "#dc2626",
                            border: "1px solid #fecaca",
                          }}
                        >
                          ✗ Missing
                        </button>
                        <button
                          onClick={() => mark(a.id, "uncertain")}
                          className="px-2 py-1 text-xs rounded font-medium"
                          style={{
                            background: status === "uncertain" ? "#d97706" : "#fffbeb",
                            color: status === "uncertain" ? "#fff" : "#d97706",
                            border: "1px solid #fde68a",
                          }}
                        >
                          ? Uncertain
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <div className="p-3 text-center text-xs text-gray-400">
            Showing first 200 of {filtered.length} assets. Use search to narrow down.
          </div>
        )}
      </div>
    </div>
  )
}
