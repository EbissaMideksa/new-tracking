"use client"

import { useEffect, useState } from "react"
import { getCategoryBadge } from "@/lib/assetCategories"

export default function LocationsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch("/api/assets/locations")
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function toggle(loc: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(loc)) next.delete(loc)
      else next.add(loc)
      return next
    })
  }

  if (loading) return <div className="p-6 text-gray-400">Loading locations...</div>
  if (!data) return <div className="p-6 text-gray-400">Failed to load.</div>

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">Asset Locations</h1>
      <p className="text-sm text-gray-500">
        {data.totalAssets} assets across {data.totalLocations} locations
      </p>

      {data.locations.map((group: any) => {
        const isOpen = expanded.has(group.location)
        return (
          <div key={group.location} className="bg-white rounded shadow overflow-hidden">
            {/* Location header */}
            <div
              onClick={() => toggle(group.location)}
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{isOpen ? "▼" : "▶"}</span>
                <div>
                  <h3 className="font-semibold text-sm">{group.location}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-500">{group.count} assets</span>
                    <span className="text-xs text-green-600">{group.active} active</span>
                    {group.checkedOut > 0 && (
                      <span className="text-xs text-orange-600">{group.checkedOut} checked out</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                {group.categories.slice(0, 5).map((cat: string) => {
                  const badge = getCategoryBadge(cat)
                  return (
                    <span key={cat} style={{
                      fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
                      background: badge.bg, color: badge.color,
                    }}>
                      {badge.icon} {cat}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Expanded asset list */}
            {isOpen && (
              <div className="border-t">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-2 font-bold text-gray-500">Tag #</th>
                      <th className="text-left p-2 font-bold text-gray-500">Serial #</th>
                      <th className="text-left p-2 font-bold text-gray-500">Description</th>
                      <th className="text-left p-2 font-bold text-gray-500">Category</th>
                      <th className="text-left p-2 font-bold text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.assets.map((a: any) => (
                      <tr key={a.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-mono font-semibold">{a.tagNumber || "—"}</td>
                        <td className="p-2 font-mono">{a.serialNumber}</td>
                        <td className="p-2">{a.assetDescription || a.itemCode || "—"}</td>
                        <td className="p-2">
                          {a.category && (
                            <span style={{
                              fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
                              background: getCategoryBadge(a.category).bg,
                              color: getCategoryBadge(a.category).color,
                            }}>
                              {getCategoryBadge(a.category).icon} {a.category}
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          {a.checkedOut
                            ? <span className="text-orange-600 font-medium">🔒 Checked Out</span>
                            : a.active
                              ? <span className="text-green-600">● Active</span>
                              : <span className="text-gray-400">○ Inactive</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
