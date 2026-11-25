// components/OrgStructureModal.tsx
//
// Org-structure panel opened from the sidebar's org-structure icon (admins only).
//
// It answers "what does the structure under me look like?" for the *logged-in*
// user: /api/tree is already rooted at the caller's own org unit, so the panel
// shows
//   1. the chain from the user's own scope root down to the unit that was
//      clicked (where this branch sits inside their scope), then
//   2. that unit's descendants, each with its rolled-up asset count.
//
// Every unit in the panel is also a filter: clicking "Filter" applies the same
// `?org=<id>` contract the sidebar rows, /dashboard, /dashboard/assets and the
// scoped APIs (/api/assets, /api/assets/analytics) already use, so the org
// structure works as a filtering mechanism everywhere the org filter is involved.
"use client"

import { useEffect, useMemo, useState } from "react"
import { Network, X, Filter, ChevronDown, ChevronRight } from "lucide-react"
import { buildPathMap } from "@/lib/formatOrg"
import { ORG_TYPE_COLOR as SHARED_TYPE_COLOR, ORG_TYPE_LABEL } from "@/lib/orgStructure"

// Same org-unit palette the dashboard cards use, so a unit keeps one colour.
// Sourced from lib/orgStructure so the dashboard, the admin editor and this
// panel can never drift apart. ROOT is synthetic (pre-COUNTRY), so it reuses
// COUNTRY's colour.
const TYPE_COLOR: Record<string, string> = {
  ...SHARED_TYPE_COLOR,
  ROOT: SHARED_TYPE_COLOR.COUNTRY,
}

/** Plain-words label for the type chip — SECTION reads as "Field Operations". */
function typeLabel(type?: string): string {
  if (!type) return ""
  return ORG_TYPE_LABEL[type as keyof typeof ORG_TYPE_LABEL] ?? type
}

interface OrgStructureModalProps {
  /** Unit whose sub-structure is shown (the icon that was clicked). */
  node: any
  /** Whole tree for this user — its root is the user's own org unit. */
  scopeRoot: any
  /** Currently applied org filter (`?org=`), if any. */
  activeOrgId: string | null
  /** Apply the org filter, or clear it with `null`. */
  onFilter: (id: string | null) => void
  onClose: () => void
  /**
   * Footer hint describing what the filter narrows. Overridden by the surfaces
   * that reuse this panel for something other than the dashboard/assets/analytics
   * trio, so the copy doesn't promise a narrowing that doesn't happen there.
   */
  filterHint?: string
  /**
   * DIRECT counts per org-unit id for the data this page is filtering (work
   * orders, users, audit entries, assets). When supplied, the badge on each row
   * shows that metric rolled up over the unit's subtree, so the org structure
   * reflects the page it is filtering. When omitted, the panel falls back to the
   * asset counts /api/tree already carries on every node.
   */
  countsByOrg?: Record<string, number>
  /** What `countsByOrg` counts — used in the row tooltip. Defaults to "Assets". */
  countLabel?: string
}

export default function OrgStructureModal({
  node,
  scopeRoot,
  activeOrgId,
  onFilter,
  onClose,
  filterHint = "Filtering narrows the dashboard, assets and analytics views to the selected unit.",
  countsByOrg,
  countLabel = "Assets",
}: OrgStructureModalProps) {

  // Branch of the logged-in user's own scope that leads to the clicked unit.
  const path = useMemo(() => {
    if (!scopeRoot || !node) return []
    const map = buildPathMap(scopeRoot)
    return map[node.id] ?? [scopeRoot]
  }, [scopeRoot, node])

  // Roll the per-unit counts up the tree so a parent shows its whole subtree —
  // mirrors how /api/tree pre-rolls the asset counts. Returns null when no
  // metric was supplied, so rows fall back to `node.totalAssets`.
  const rolledCounts = useMemo(() => {
    if (!countsByOrg || !scopeRoot) return null
    const out: Record<string, number> = {}
    type Node = { id: string; children?: Node[] }
    function walk(n: Node): number {
      let total = countsByOrg![n.id] || 0
      for (const c of n.children ?? []) total += walk(c)
      out[n.id] = total
      return total
    }
    walk(scopeRoot)
    return out
  }, [scopeRoot, countsByOrg])

  // Esc closes the panel — same convention as the mobile drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  if (!node) return null

  const nodeIsFiltered = activeOrgId === node.id

  return (
    <div
      className="fixed inset-0 bg-black/40"
      style={{ zIndex: 9998, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24 }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Organizational structure"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded shadow-2xl"
        style={{
          width: "min(560px, 100%)", maxHeight: "82vh",
          display: "flex", flexDirection: "column",
          border: "1px solid #e2e8f0", overflow: "hidden",
        }}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-2 p-3" style={{ borderBottom: "1px solid #e2e8f0" }}>
          <div className="flex items-center gap-2">
            <Network size={16} color="#2563eb" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>Organizational Structure</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                Under {scopeRoot?.name ?? "your org unit"} — your scope
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close organizational structure"
            className="px-2 py-1 rounded hover:bg-gray-200 text-gray-500"
            style={{ border: "none", background: "transparent", cursor: "pointer" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Path inside the logged-in user's scope (each unit is a filter) ── */}
        <div
          className="flex flex-wrap items-center gap-1 px-3 py-2"
          style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}
        >
          {path.map((p: any, i: number) => {
            const isActive = activeOrgId === p.id
            return (
              <span key={p.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={11} color="#94a3b8" />}
                <button
                  type="button"
                  onClick={() => onFilter(isActive ? null : p.id)}
                  title={isActive ? "Clear this filter" : `Filter to ${p.name}`}
                  style={{
                    fontSize: 11, padding: "1px 6px", borderRadius: 999, cursor: "pointer",
                    border: `1px solid ${isActive ? "#2563eb" : "#e2e8f0"}`,
                    background: isActive ? "#dbeafe" : "#fff",
                    color: isActive ? "#1d4ed8" : "#475569",
                    fontWeight: i === path.length - 1 ? 600 : 400,
                  }}
                >
                  {p.name}
                </button>
              </span>
            )
          })}
        </div>

        {/* ── Structure under the clicked unit ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <StructureRow n={node} level={0} activeOrgId={activeOrgId} onFilter={onFilter} counts={rolledCounts} countLabel={countLabel} />
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between gap-2 p-3"
          style={{ borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}
        >
          <span style={{ fontSize: 11, color: "#64748b" }}>
            {filterHint}
          </span>
          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
            {activeOrgId && (
              <button
                type="button"
                onClick={() => onFilter(null)}
                style={{
                  fontSize: 12, padding: "5px 10px", borderRadius: 6, cursor: "pointer",
                  border: "1px solid #cbd5e1", background: "#fff", color: "#475569",
                }}
              >
                Clear filter
              </button>
            )}
            <button
              type="button"
              onClick={() => onFilter(nodeIsFiltered ? null : node.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 6,
                cursor: "pointer", border: "none",
                background: nodeIsFiltered ? "#e2e8f0" : "#2563eb",
                color: nodeIsFiltered ? "#334155" : "#fff",
              }}
            >
              <Filter size={12} />
              {nodeIsFiltered ? "Filtered" : "Filter this unit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── One row of the structure (recursive) ─────────────────────────────────────
function StructureRow({
  n,
  level,
  activeOrgId,
  onFilter,
  counts,
  countLabel,
}: {
  n: any
  level: number
  activeOrgId: string | null
  onFilter: (id: string | null) => void
  counts: Record<string, number> | null
  countLabel: string
}) {
  const kids = n.children ?? []
  // Top two levels open by default so the shape is visible at a glance.
  const [open, setOpen] = useState(level < 1)
  const active = activeOrgId === n.id
  const color = TYPE_COLOR[n.type] ?? "#64748b"
  // Page-relevant metric when the surface supplied one, else the asset counts
  // /api/tree already carries on the node.
  const count = counts ? (counts[n.id] ?? 0) : (n.totalAssets || 0)

  return (
    <div>
      <div
        className={`flex items-center gap-2 rounded ${active ? "bg-blue-50" : "hover:bg-gray-50"}`}
        style={{ padding: "4px 6px", paddingLeft: 6 + level * 14 }}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-label={open ? "Collapse" : "Expand"}
            style={{
              width: 14, flexShrink: 0, padding: 0, border: "none",
              background: "transparent", color: "#94a3b8", cursor: "pointer",
            }}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span style={{ width: 14, flexShrink: 0 }} />
        )}

        {n.type && (
          <span
            style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 0.4, flexShrink: 0,
              padding: "1px 5px", borderRadius: 3, color, background: `${color}1a`,
            }}
          >
            {n.type}
          </span>
        )}

        <span
          className="flex-1 text-sm truncate"
          style={{ color: "#334155", fontWeight: active ? 600 : 400 }}
        >
          {n.name}
        </span>

        <span
          className="text-[10px] bg-green-100 px-2 rounded"
          title={`${countLabel} in this unit, including sub-units`}
          style={{ flexShrink: 0 }}
        >
          {count}
        </span>

        <button
          type="button"
          onClick={() => onFilter(active ? null : n.id)}
          title={active ? "Clear this filter" : `Filter to ${n.name}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
            fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
            cursor: "pointer",
            border: `1px solid ${active ? "#2563eb" : "#cbd5e1"}`,
            background: active ? "#dbeafe" : "#fff",
            color: active ? "#1d4ed8" : "#475569",
          }}
        >
          <Filter size={10} />
          {active ? "Filtered" : "Filter"}
        </button>
      </div>

      {open && kids.map((c: any) => (
        <StructureRow key={c.id} n={c} level={level + 1} activeOrgId={activeOrgId} onFilter={onFilter} counts={counts} countLabel={countLabel} />
      ))}
    </div>
  )
}
