// app/dashboard/(workorders)/workorders/_components/WorkOrderTable.tsx
"use client"

import { useMemo, useState } from "react"
import { WorkOrder } from "@/hooks/useWorkOrders"
import { STATUS_META, PRIORITY_META, Priority } from "./types"
import { isWoLockedByOther } from "@/lib/woCheckoutClient"
import { computeSLA } from "@/lib/sla"
import { buildPathMap, formatOwningDepartment } from "@/lib/formatOrg"

type Props = {
  orders:      WorkOrder[]
  page:        number
  pageSize:    number
  setPage:     (p: number) => void
  selected:    Set<string>
  setSelected: (s: Set<string>) => void
  onDetail:    (o: WorkOrder) => void
  me:          any
  now:         number
  tree?:       any
  taskMode?:   boolean
  taskTab?:    string
  readOnly?:   boolean
}

const ACTIVITY_LABEL: Record<string, string> = {
  CREATED:     "Awaiting Assignment",
  ASSIGNED:    "Ready for Checkout",
  CHECKED_OUT: "Work In Progress",
  IN_PROGRESS: "Work In Progress",
  COMPLETED:   "Completed — Ready to Check In",
  ARCHIVED:    "Checked In / Closed",
}

const ALL_COLS = [
  { key: "workOrderNo",      l: "Work Order No.",         w: 120, default: true  },
  { key: "title",            l: "Subject",                w: 160, default: true  },
  { key: "tagNumber",        l: "Tag Number",             w: 140, default: true  },
  { key: "serialNumber",     l: "Serial Number",          w: 160, default: true  },
  { key: "owningDept",       l: "Owning Department",      w: 160, default: true  },
  { key: "politicalArea",    l: "Area (Political Admin)", w: 140, default: true  },
  { key: "faCategory",       l: "Fixed Asset Category",   w: 130, default: true  },
  { key: "status",           l: "Work Order State",       w: 110, default: true  },
  { key: "activity",         l: "Activity",               w: 130, default: true  },
  { key: "assignedTo",       l: "Assigned To",            w: 110, default: true  },
  { key: "createdBy",        l: "Created By",             w: 100, default: true  },
  { key: "checkedOutBy",     l: "Checked Out By",         w: 110, default: true  },
  { key: "checkedOutAt",     l: "Checked Out At",         w: 120, default: false },
  { key: "completedBy",      l: "Completed By",           w: 110, default: true  },
  { key: "completedAt",      l: "Completed At",           w: 120, default: true  },
  { key: "priority",         l: "Priority",               w: 80,  default: false },
  { key: "createdAt",        l: "Created At",             w: 120, default: false },
  { key: "duration",         l: "Duration",               w: 70,  default: true  },
]

// Read an asset field from the linked asset, falling back to the snapshot.
function assetField(o: WorkOrder, key: string): string {
  const a = (o.asset as any) ?? (o.assetSnapshot as any)
  return a && a[key] ? String(a[key]) : ""
}

function formatDuration(ms: number): string {
  if (ms < 0) return "—"
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function elapsed(o: WorkOrder, now: number): number {
  if (o.status === "ARCHIVED")
    return new Date(o.archivedAt || o.completedAt || o.createdAt).getTime() - new Date(o.createdAt).getTime()
  return now - new Date(o.createdAt).getTime()
}

export default function WorkOrderTable({
  orders, page, pageSize, setPage,
  selected, setSelected,
  onDetail, me, now,
  tree,
  taskMode = false, taskTab,
  readOnly = false,
}: Props) {
  // ── Sorting state ─────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  // ── Column visibility (persisted to localStorage, per view) ──────────────
  const colStorageKey = `wo-visible-cols-${taskMode ? "tc" : taskTab || "om"}`
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(colStorageKey)
      if (saved) return new Set(JSON.parse(saved))
    } catch {}
    return new Set(ALL_COLS.filter(c => c.default).map(c => c.key))
  })
  const [showColSelector, setShowColSelector] = useState(false)

  function toggleCol(colKey: string) {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(colKey)) next.delete(colKey)
      else next.add(colKey)
      localStorage.setItem(colStorageKey, JSON.stringify([...next]))
      return next
    })
  }

  function getSortValue(o: WorkOrder, key: string): string | number {
    switch (key) {
      case "workOrderNo":  return o.workOrderNo || ""
      case "title":        return o.title || ""
      case "tagNumber":    return assetField(o, "tagNumber") || ""
      case "serialNumber": return assetField(o, "serialNumber") || ""
      case "owningDept":   return getOwningDept(o)
      case "politicalArea":return assetField(o, "politicalArea") || ""
      case "faCategory":   return assetField(o, "faCategory") || ""
      case "status":       return o.status
      case "activity":     return ACTIVITY_LABEL[o.status] || ""
      case "assignedTo":   return o.assignedTo?.name || o.orgUnit?.name || ""
      case "createdBy":    return (o as any).createdBy?.name || ""
      case "checkedOutBy": return o.checkedOutBy?.name || ""
      case "checkedOutAt": return o.checkedOutAt || ""
      case "completedBy":  return o.completedBy?.name || ""
      case "completedAt":  return o.completedAt || o.archivedAt || ""
      case "priority":     return o.priority || ""
      case "createdAt":    return o.createdAt
      case "duration":     return elapsed(o, now)
      default:             return ""
    }
  }

  const sortedOrders = useMemo(() => {
    if (!sortKey) return orders
    return [...orders].sort((a, b) => {
      const va = getSortValue(a, sortKey)
      const vb = getSortValue(b, sortKey)
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb))
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [orders, sortKey, sortDir, now])

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / pageSize))
  const paginated  = sortedOrders.slice((page - 1) * pageSize, page * pageSize)
  const visibleColumns = ALL_COLS.filter(c => visibleCols.has(c.key))

  // Build path map from tree for owning department computation
  const pathMap = useMemo(() => tree ? buildPathMap(tree) : {}, [tree])

  function getOwningDept(o: WorkOrder): string {
    // Try from org tree path first
    const orgId = o.orgUnit?.id
    if (orgId && pathMap[orgId]) {
      const formatted = formatOwningDepartment(pathMap[orgId])
      if (formatted && formatted !== "—") return formatted
    }
    // Fallback to asset's owningDepartment field
    return assetField(o, "owningDepartment") || "—"
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Column selector toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 12px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
        <button
          onClick={() => setShowColSelector(v => !v)}
          style={{ fontSize: 10, padding: "3px 10px", border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", cursor: "pointer", color: "#6b7280", fontWeight: 600 }}
        >
          ⚙ Columns ({visibleCols.size})
        </button>
      </div>
      {showColSelector && (
        <div style={{ padding: "8px 12px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0 }}>
          {ALL_COLS.map(c => (
            <label key={c.key} style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "2px 8px", borderRadius: 4, background: visibleCols.has(c.key) ? "#eff6ff" : "#fff", border: "1px solid #e5e7eb" }}>
              <input type="checkbox" checked={visibleCols.has(c.key)} onChange={() => toggleCol(c.key)} style={{ width: 10, height: 10 }} />
              {c.l}
            </label>
          ))}
        </div>
      )}
      <div style={{ flex: 1, overflow: "auto", overscrollBehaviorX: "contain" }}>
        {sortedOrders.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>◇</div>
            <div style={{ fontSize: 12 }}>
              {taskMode ? "No work orders in your org unit queue" : "No work orders found"}
            </div>
          </div>
        ) : (
          <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "auto" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
              <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                {!readOnly && (
                  <th style={{ width: 32, padding: "8px 8px", borderBottom: "1px solid #e5e7eb", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      style={{ width: 11, height: 11 }}
                      checked={selected.size === paginated.length && paginated.length > 0}
                      onChange={() => {
                        if (selected.size === paginated.length) setSelected(new Set())
                        else setSelected(new Set(paginated.map(o => o.id)))
                      }}
                    />
                  </th>
                )}
                {visibleColumns.map(c => (
                  <th
                    key={c.key}
                    onClick={() => handleSort(c.key)}
                    style={{ minWidth: c.w, padding: "8px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: sortKey === c.key ? "#2d7d32" : "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                  >
                    {c.l}
                    {sortKey === c.key && <span style={{ marginLeft: 4 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </th>
                ))}
                <th style={{ width: 80, padding: "8px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", borderBottom: "1px solid #e5e7eb" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((o, idx) => {
                const sm     = STATUS_META[o.status] ?? STATUS_META.CREATED
                const pm     = o.priority ? PRIORITY_META[o.priority as Priority] : null
                const sel    = selected.has(o.id)
                const isProc = o.status === "CHECKED_OUT" || o.status === "IN_PROGRESS"
                const locked = isWoLockedByOther(o, me)
                const dur    = elapsed(o, now)
                const base   = sel
                  ? "#fef3c7"
                  : isProc && idx % 2 === 0 ? "#fdf4ff"
                  : isProc ? "#faf5ff"
                  : idx % 2 === 0 ? "#fff" : "#f9fafb"

                return (
                  <tr
                    key={o.id}
                    style={{ background: base, borderBottom: "1px solid #f3f4f6", borderLeft: isProc ? "3px solid #7c3aed" : "3px solid transparent", transition: "background .1s" }}
                    onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = "#f0fdf4" }}
                    onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = base }}
                  >
                    {!readOnly && (
                      <td style={{ padding: "7px 8px", textAlign: "center" }}>
                        <input
                          type="checkbox" checked={sel} style={{ width: 11, height: 11 }}
                          onChange={() => {
                            const next = new Set(selected)
                            if (next.has(o.id)) next.delete(o.id); else next.add(o.id)
                            setSelected(next)
                          }}
                        />
                      </td>
                    )}
                    {visibleColumns.map(c => {
                      const tdStyle: React.CSSProperties = { padding: "7px 14px", overflow: "hidden", fontSize: 10, color: "#374151" }
                      const monoStyle: React.CSSProperties = { ...tdStyle, fontFamily: "monospace" }
                      const k = c.key
                      if (k === "workOrderNo") return (
                        <td key={k} style={tdStyle}>
                          <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 600, color: "#1d4ed8", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {o.workOrderNo || o.id.slice(0, 12)}
                          </span>
                          {pm && <span style={{ fontSize: 9, color: pm.color, fontWeight: 700 }}>● {o.priority}</span>}
                        </td>
                      )
                      if (k === "title") return (
                        <td key={k} style={tdStyle}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827", fontWeight: 500 }}>
                            {o.title || "—"}
                          </span>
                        </td>
                      )
                      if (k === "tagNumber") return (
                        <td key={k} style={monoStyle}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {assetField(o, "tagNumber") || "—"}
                          </span>
                        </td>
                      )
                      if (k === "serialNumber") return (
                        <td key={k} style={monoStyle}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {assetField(o, "serialNumber") || "—"}
                          </span>
                        </td>
                      )
                      if (k === "owningDept") return (
                        <td key={k} style={tdStyle}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {getOwningDept(o)}
                          </span>
                        </td>
                      )
                      if (k === "politicalArea") return (
                        <td key={k} style={tdStyle}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {assetField(o, "politicalArea") || "—"}
                          </span>
                        </td>
                      )
                      if (k === "faCategory") return (
                        <td key={k} style={tdStyle}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {assetField(o, "faCategory") || "—"}
                          </span>
                        </td>
                      )
                      if (k === "status") return (
                        <td key={k} style={{ padding: "7px 14px" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 2, color: sm.color, background: sm.bg, border: `1px solid ${sm.border}`, whiteSpace: "nowrap" }}>
                              {sm.label}
                            </span>
                            {locked && (
                              <span title={`Checked out by ${o.checkedOutBy?.name || "another user"} — locked`} style={{ fontSize: 12, cursor: "help" }}>🔒</span>
                            )}
                            {(() => {
                              const sla = computeSLA(o.createdAt, o.status, o.completedAt ?? null, 24)
                              if (sla.status === "completed" || sla.status === "no_sla") return null
                              return (
                                <span title={`SLA: ${sla.label} (${sla.hoursElapsed}h elapsed)`}
                                  style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 2, color: sla.color, background: sla.bg, border: `1px solid ${sla.color}33`, whiteSpace: "nowrap" }}>
                                  {sla.status === "breached" ? "⚠ SLA" : sla.status === "warning" ? "⏱ SLA" : "✓ SLA"}
                                </span>
                              )
                            })()}
                          </span>
                        </td>
                      )
                      if (k === "activity") return (
                        <td key={k} style={tdStyle}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ACTIVITY_LABEL[o.status] ?? "—"}
                          </span>
                        </td>
                      )
                      if (k === "assignedTo") return (
                        <td key={k} style={tdStyle}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {o.assignedTo?.name || o.orgUnit?.name || "—"}
                          </span>
                        </td>
                      )
                      if (k === "createdBy") return (
                        <td key={k} style={tdStyle}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {(o as any).createdBy?.name || "—"}
                          </span>
                        </td>
                      )
                      if (k === "checkedOutBy") return (
                        <td key={k} style={tdStyle}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {o.checkedOutBy?.name || "—"}
                          </span>
                        </td>
                      )
                      if (k === "checkedOutAt") return (
                        <td key={k} style={{ ...tdStyle, color: "#6b7280", whiteSpace: "nowrap" }}>
                          {o.checkedOutAt ? new Date(o.checkedOutAt).toLocaleString() : "—"}
                        </td>
                      )
                      if (k === "completedBy") return (
                        <td key={k} style={tdStyle}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {o.completedBy?.name || "—"}
                          </span>
                        </td>
                      )
                      if (k === "completedAt") return (
                        <td key={k} style={{ ...tdStyle, color: "#6b7280", whiteSpace: "nowrap" }}>
                          {o.completedAt ? new Date(o.completedAt).toLocaleString() : (o.archivedAt ? new Date(o.archivedAt).toLocaleString() : "—")}
                        </td>
                      )
                      if (k === "priority") return (
                        <td key={k} style={tdStyle}>
                          {pm && <span style={{ fontSize: 9, color: pm.color, fontWeight: 700 }}>● {o.priority}</span>}
                        </td>
                      )
                      if (k === "createdAt") return (
                        <td key={k} style={{ ...tdStyle, color: "#6b7280", whiteSpace: "nowrap" }}>
                          {new Date(o.createdAt).toLocaleString()}
                        </td>
                      )
                      if (k === "duration") return (
                        <td key={k} style={{ ...monoStyle, color: "#6b7280" }}>
                          {formatDuration(dur)}
                        </td>
                      )
                      return <td key={k} style={tdStyle}>—</td>
                    })}
                    <td style={{ padding: "7px 8px" }}>
                      <button
                        onClick={() => onDetail(o)}
                        style={{ fontSize: 10, padding: "3px 10px", borderRadius: 2, background: taskMode ? "#f0fdf4" : "#f3f4f6", color: taskMode ? "#15803d" : "#374151", border: taskMode ? "1px solid #86efac" : "1px solid #d1d5db", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      <div style={{ background: "#fff", borderTop: "1px solid #e5e7eb", padding: "5px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, fontSize: 11, color: "#6b7280" }}>
        <span>Total {sortedOrders.length.toLocaleString()} Items</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {[{ l: "«", a: () => setPage(1) }, { l: "‹", a: () => setPage(Math.max(1, page - 1)) }].map(({ l, a }) => (
            <button key={l} onClick={a} style={{ width: 24, height: 22, borderRadius: 2, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 11 }}>{l}</button>
          ))}
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
            return p <= totalPages ? (
              <button key={p} onClick={() => setPage(p)}
                style={{ width: 24, height: 22, borderRadius: 2, border: "1px solid", background: p === page ? "#2d7d32" : "#fff", color: p === page ? "#fff" : "#374151", borderColor: p === page ? "#2d7d32" : "#d1d5db", cursor: "pointer", fontSize: 11, fontWeight: p === page ? 700 : 400 }}>
                {p}
              </button>
            ) : null
          })}
          {[{ l: "›", a: () => setPage(Math.min(totalPages, page + 1)) }, { l: "»", a: () => setPage(totalPages) }].map(({ l, a }) => (
            <button key={l} onClick={a} style={{ width: 24, height: 22, borderRadius: 2, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 11 }}>{l}</button>
          ))}
          <span style={{ marginLeft: 6, fontSize: 10 }}>Go to</span>
          <input
            type="number" min={1} max={totalPages} defaultValue={page}
            onBlur={e => { const v = Number(e.target.value); if (v >= 1 && v <= totalPages) setPage(v) }}
            style={{ width: 34, fontSize: 10, border: "1px solid #d1d5db", borderRadius: 2, padding: "2px 4px", textAlign: "center" }}
          />
          <span style={{ fontSize: 10 }}>Page</span>
        </div>
      </div>
    </div>
  )
}
