// components/workorders/WorkOrderTable.tsx
"use client"

import { STATUS_META, PRIORITY_META, ACTIVITY_LABEL, type WorkOrder, type Priority } from "./types"

const COLS = [
  { l: "Work Order No.",   w: "14%" },
  { l: "Subject",          w: "20%" },
  { l: "Work Order State", w: "13%" },
  { l: "Activity",         w: "14%" },
  { l: "Assigned To",      w: "11%" },
  { l: "Created By",       w: "11%" },
  { l: "Duration",         w: "7%"  },
  { l: "Action",           w: "10%" },
]

function formatDuration(ms: number): string {
  if (ms < 0) return "—"
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

interface WorkOrderTableProps {
  orders    : WorkOrder[]
  page      : number
  pageSize  : number
  setPage   : (p: number) => void
  selected  : Set<string>
  setSelected: (s: Set<string>) => void
  onDetail  : (o: WorkOrder) => void
  now       : number
  taskMode? : boolean
  readOnly? : boolean
}

export default function WorkOrderTable({
  orders, page, pageSize, setPage,
  selected, setSelected, onDetail,
  now, taskMode = false, readOnly = false,
}: WorkOrderTableProps) {
  const totalPages = Math.max(1, Math.ceil(orders.length / pageSize))
  const paginated  = orders.slice((page - 1) * pageSize, page * pageSize)

  function elapsed(o: WorkOrder): number {
    if (o.status === "ARCHIVED")
      return new Date(o.archivedAt || o.completedAt || o.createdAt).getTime()
             - new Date(o.createdAt).getTime()
    return now - new Date(o.createdAt).getTime()
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "auto" }}>
        {orders.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>◇</div>
            <div style={{ fontSize: 12 }}>
              {taskMode ? "No work orders in your org unit queue" : "No work orders found"}
            </div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
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
                {COLS.map(h => (
                  <th key={h.l} style={{
                    width: h.w, padding: "8px 10px", textAlign: "left",
                    fontSize: 10, fontWeight: 700, color: "#6b7280",
                    textTransform: "uppercase", letterSpacing: ".05em",
                    borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {h.l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((o, idx) => {
                const sm  = STATUS_META[o.status] ?? STATUS_META.CREATED
                const pm  = o.priority ? PRIORITY_META[o.priority as Priority] : null
                const sel = selected.has(o.id)
                const isProc = o.status === "CHECKED_OUT" || o.status === "IN_PROGRESS"
                const dur    = elapsed(o)
                const base   = sel
                  ? "#fef3c7"
                  : isProc && idx % 2 === 0 ? "#fdf4ff"
                  : isProc ? "#faf5ff"
                  : idx % 2 === 0 ? "#fff" : "#f9fafb"

                return (
                  <tr
                    key={o.id}
                    style={{
                      background: base, borderBottom: "1px solid #f3f4f6",
                      borderLeft: isProc ? "3px solid #7c3aed" : "3px solid transparent",
                      transition: "background .1s",
                    }}
                    onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = "#f0fdf4" }}
                    onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = base }}
                  >
                    {!readOnly && (
                      <td style={{ padding: "7px 8px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={sel}
                          style={{ width: 11, height: 11 }}
                          onChange={() => {
                            const next = new Set(selected)
                            if (next.has(o.id)) next.delete(o.id)
                            else next.add(o.id)
                            setSelected(next)
                          }}
                        />
                      </td>
                    )}
                    <td style={{ padding: "7px 10px", overflow: "hidden" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 600, color: "#1d4ed8", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.workOrderNo || o.id.slice(0, 12)}
                      </span>
                      {pm && <span style={{ fontSize: 9, color: pm.color, fontWeight: 700 }}>● {o.priority}</span>}
                    </td>
                    <td style={{ padding: "7px 10px", overflow: "hidden" }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827", fontWeight: 500 }}>
                        {o.title || "—"}
                      </span>
                    </td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 2, color: sm.color, background: sm.bg, border: `1px solid ${sm.border}`, whiteSpace: "nowrap" }}>
                        {sm.label}
                      </span>
                    </td>
                    <td style={{ padding: "7px 10px", overflow: "hidden" }}>
                      <span style={{ fontSize: 10, color: "#374151", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ACTIVITY_LABEL[o.status] ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "7px 10px", overflow: "hidden" }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>
                        {o.assignedTo?.name || o.orgUnit?.name || "—"}
                      </span>
                    </td>
                    <td style={{ padding: "7px 10px", overflow: "hidden" }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>
                        {(o as any).createdBy?.name || "—"}
                      </span>
                    </td>
                    <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: 10, color: "#6b7280" }}>
                      {dur >= 0 ? formatDuration(dur) : "—"}
                    </td>
                    <td style={{ padding: "7px 8px" }}>
                      <button
                        onClick={() => onDetail(o)}
                        style={{
                          fontSize: 10, padding: "3px 10px", borderRadius: 2,
                          background: taskMode ? "#f0fdf4" : "#f3f4f6",
                          color: taskMode ? "#15803d" : "#374151",
                          border: taskMode ? "1px solid #86efac" : "1px solid #d1d5db",
                          cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap",
                        }}
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

      {/* Pagination */}
      <div style={{ background: "#fff", borderTop: "1px solid #e5e7eb", padding: "5px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, fontSize: 11, color: "#6b7280" }}>
        <span>Total {orders.length.toLocaleString()} Items</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {[{ l: "«", a: () => setPage(1) }, { l: "‹", a: () => setPage(Math.max(1, page - 1)) }].map(({ l, a }) => (
            <button key={l} onClick={a} style={{ width: 24, height: 22, borderRadius: 2, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 11 }}>{l}</button>
          ))}
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
            return p <= totalPages ? (
              <button key={p} onClick={() => setPage(p)} style={{ width: 24, height: 22, borderRadius: 2, border: "1px solid", background: p === page ? "#2d7d32" : "#fff", color: p === page ? "#fff" : "#374151", borderColor: p === page ? "#2d7d32" : "#d1d5db", cursor: "pointer", fontSize: 11, fontWeight: p === page ? 700 : 400 }}>{p}</button>
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

