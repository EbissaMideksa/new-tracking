
// app/dashboard/(workorders)/workorders/_components/modals/DetailModal.tsx
//This modal shows the details of a work order, including its lifecycle actions and assignment options. 
// It uses the OrgTree component to allow users to select an organizational unit for assignment. 
// The modal also displays various details about the work order, such as its status, priority, 
// assigned user, and timestamps for creation, scheduling, starting, and completion.

"use client"

import { useState, useMemo, useEffect } from "react"
import OrgTree from "../OrgTree"
import { STATUS_META, LifecyclePerms, ActAction, findOrgName, WorkOrder, WorkOrderAsset } from "../types"
import { buildPathMap, formatOwningDepartment, getPoliticalAreaFromPath } from "@/lib/formatOrg"

type Props = {
  o:              WorkOrder
  onClose:        () => void
  me:             any
  tree:           any
  lifecyclePerms: LifecyclePerms
  canAssign?:     boolean
  lockedByOther?: boolean
  checkedOutByName?: string | null
  act:            (id: string, a: ActAction, payload?: any) => void
  onDelete?:      () => Promise<void>
  now:            number
}

function fmtDuration(ms: number): string {
  if (ms < 0) return "—"
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${m}m`
}

// ── Tiny helpers ─────────────────────────────────────────────────────────────
const ROW: React.CSSProperties = {
  display: "flex", alignItems: "baseline", gap: 10,
  padding: "5px 0", borderBottom: "1px solid #f1f5f9", minWidth: 0,
}
const LBL: React.CSSProperties = {
  minWidth: 180, fontSize: 11, color: "#6b7280", flexShrink: 0,
}
function Val({ v, mono }: { v: any; mono?: boolean }) {
  if (v === null || v === undefined || v === "") return <span style={{ color: "#cbd5e1" }}>—</span>
  return <span style={{ fontSize: 11, color: "#111827", fontFamily: mono ? "monospace" : undefined, wordBreak: "break-word" }}>{String(v)}</span>
}
function BoolVal({ v }: { v: boolean | null | undefined }) {
  if (v === true)  return <span style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 3, padding: "1px 7px" }}>Yes</span>
  if (v === false) return <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 3, padding: "1px 7px" }}>No</span>
  return <span style={{ color: "#cbd5e1" }}>—</span>
}
function ChipVal({ v, color = "purple" }: { v: any; color?: "purple" | "criticality" }) {
  if (!v) return <span style={{ color: "#cbd5e1" }}>—</span>
  if (color === "criticality") {
    const map: Record<string, [string, string, string]> = {
      HIGH:   ["#ef4444", "#fef2f2", "#fca5a5"],
      MEDIUM: ["#f59e0b", "#fffbeb", "#fcd34d"],
      LOW:    ["#22c55e", "#f0fdf4", "#bbf7d0"],
    }
    const [c, bg, border] = map[String(v)] ?? ["#94a3b8", "#f8fafc", "#e2e8f0"]
    return <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 3, padding: "1px 7px", color: c, background: bg, border: `1px solid ${border}` }}>{String(v)}</span>
  }
  return <span style={{ fontSize: 10, fontWeight: 600, background: "#f3f0ff", color: "#7c3aed", border: "1px solid #ddd6fe", borderRadius: 3, padding: "1px 7px" }}>{String(v)}</span>
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DetailModal({
  o, onClose, me, tree, lifecyclePerms, canAssign, lockedByOther, checkedOutByName, act, onDelete, now,
}: Props) {
  // ── Collapsible sections ──────────────────────────────────────────────────
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  function toggleSection(id: string) {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function SectionToggle({ id, label, color, badge }: { id: string; label: string; color: string; badge?: string }) {
    const isOpen = expandedSections.has(id)
    return (
      <div
        onClick={() => toggleSection(id)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: isOpen ? color : "#f9fafb", borderRadius: 6, cursor: "pointer", border: `1px solid ${isOpen ? color : "#e5e7eb"}`, marginBottom: isOpen ? 0 : 8, transition: "all 0.15s" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: isOpen ? "#fff" : "#6b7280" }}>{isOpen ? "▼" : "▶"}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: isOpen ? "#fff" : "#374151", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</span>
          {badge && <span style={{ fontSize: 9, background: isOpen ? "rgba(255,255,255,.25)" : "#e5e7eb", color: isOpen ? "#fff" : "#6b7280", padding: "1px 6px", borderRadius: 3 }}>{badge}</span>}
        </div>
      </div>
    )
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState("")
  const [postingComment, setPostingComment] = useState(false)

  // ── Time tracking ─────────────────────────────────────────────────────────
  const [laborHours, setLaborHours] = useState<string>("")
  const [elapsedHours, setElapsedHours] = useState<number | null>(null)
  const [savingTime, setSavingTime] = useState(false)

  // ── Cost tracking ─────────────────────────────────────────────────────────
  const [estimatedCost, setEstimatedCost] = useState("")
  const [actualCost, setActualCost] = useState("")
  const [partsCost, setPartsCost] = useState("")
  const [savingCost, setSavingCost] = useState(false)

  useEffect(() => {
    fetch(`/api/workorders/${o.id}/comments`)
      .then(r => r.ok ? r.json() : [])
      .then(setComments)
      .catch(() => {})
    fetch(`/api/workorders/${o.id}/time-log`)
      .then(r => r.ok ? r.json() : ({} as any))
      .then((d: any) => {
        if (d.laborHours != null) setLaborHours(d.laborHours.toString())
        if (d.elapsedHours != null) setElapsedHours(d.elapsedHours)
      })
      .catch(() => {})
    fetch(`/api/workorders/${o.id}/cost`)
      .then(r => r.ok ? r.json() : ({} as any))
      .then((d: any) => {
        if (d.estimatedCost != null) setEstimatedCost(d.estimatedCost.toString())
        if (d.actualCost != null) setActualCost(d.actualCost.toString())
        if (d.partsCost != null) setPartsCost(d.partsCost.toString())
      })
      .catch(() => {})
      .catch(() => {})
  }, [o.id])

  async function saveLaborHours() {
    if (!laborHours) return
    setSavingTime(true)
    try {
      await fetch(`/api/workorders/${o.id}/time-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: parseFloat(laborHours) }),
      })
    } catch {}
    finally { setSavingTime(false) }
  }

  async function saveCosts() {
    setSavingCost(true)
    try {
      await fetch(`/api/workorders/${o.id}/cost`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimatedCost: estimatedCost ? parseFloat(estimatedCost) : null,
          actualCost: actualCost ? parseFloat(actualCost) : null,
          partsCost: partsCost ? parseFloat(partsCost) : null,
        }),
      })
    } catch {}
    finally { setSavingCost(false) }
  }

  async function postComment() {
    if (!newComment.trim()) return
    setPostingComment(true)
    try {
      const res = await fetch(`/api/workorders/${o.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newComment }),
      })
      const data = await res.json()
      if (res.ok) {
        setComments([...comments, data])
        setNewComment("")
      }
    } catch {}
    finally { setPostingComment(false) }
  }
  const sm = STATUS_META[o.status] ?? STATUS_META.CREATED
  const [assigning,        setAssigning]        = useState(false)
  const [assignError,      setAssignError]       = useState<string | null>(null)
  const [targetOrgUnitId,  setTargetOrgUnitId]   = useState("")
  const [targetOrgName,    setTargetOrgName]      = useState("")
  const [activeTab,        setActiveTab]          = useState<"wo" | "asset">("wo")

  // ── Build path map from tree once ──────────────────────────────────────
  const pathMap = useMemo(() => tree ? buildPathMap(tree) : {}, [tree])

  // ── Asset: prefer linked asset, fall back to snapshot ──────────────────
  const asset: WorkOrderAsset | null =
    (o.asset && Object.keys(o.asset).length > 1 ? o.asset : null) ??
    (o.assetSnapshot as WorkOrderAsset | null) ??
    null

  // ── Owning dept from asset's orgUnit path (or WO orgUnit path) ─────────
  const owningDept = useMemo(() => {
    const orgId = asset?.orgUnit?.id || o.orgUnitId
    const nodes  = pathMap[orgId]
    return nodes ? formatOwningDepartment(nodes) : (asset?.owningDepartment || "—")
  }, [asset, o.orgUnitId, pathMap])

  const politicalArea = useMemo(() => {
    const orgId = asset?.orgUnit?.id || o.orgUnitId
    const nodes  = pathMap[orgId]
    return nodes ? getPoliticalAreaFromPath(nodes) : (asset?.politicalArea || "—")
  }, [asset, o.orgUnitId, pathMap])

  // ── Duration calc ───────────────────────────────────────────────────────
  const dur = o.status === "ARCHIVED"
    ? (new Date(o.archivedAt || o.completedAt || o.createdAt).getTime() - new Date(o.createdAt).getTime())
    : (o.startedAt
        ? ((o.completedAt ? new Date(o.completedAt).getTime() : now) - new Date(o.startedAt).getTime())
        : -1)

  async function handleAssign() {
    if (!targetOrgUnitId)                { setAssignError("Select a target org unit"); return }
    if (o.orgUnit?.id === targetOrgUnitId) { setAssignError("Work order is already in this org unit"); return }
    setAssignError(null)
    setAssigning(true)
    try { await act(o.id, "assign", { targetOrgUnitId }) }
    catch (e: any) { setAssignError(e.message || "Failed to assign") }
    finally { setAssigning(false) }
  }

  const lifecycleBtns: { label: string; bg: string; action: ActAction }[] = [
    lifecyclePerms.canCheckout     && { label: "Check Out",        bg: "#7c3aed", action: "checkout" as ActAction },
    lifecyclePerms.canStart        && { label: "Start",            bg: "#d97706", action: "start"    as ActAction },
    lifecyclePerms.canComplete     && { label: "Complete",         bg: "#15803d", action: "complete" as ActAction },
    lifecyclePerms.canCheckin      && { label: "Check In",         bg: "#374151", action: "checkin"  as ActAction },
    lifecyclePerms.canForceArchive && { label: "Force Archive ⚠",  bg: "#991b1b", action: "checkin"  as ActAction },
  ].filter(Boolean) as { label: string; bg: string; action: ActAction }[]

  // For non-admins: only show Check Out and Check In (Start, Complete, Force Archive suspended)
  // Admins see all actions for future activation

  const showActionFooter = lifecycleBtns.length > 0 || canAssign

  // ── Asset field rows ────────────────────────────────────────────────────
  const assetRows = asset ? [
    { l: "Asset ID",               v: asset.id,                  mono: true },
    { l: "Asset Group (Item Code)",v: asset.itemCode,             mono: true },
    { l: "Item Code Description",  v: asset.itemCodeDescription              },
    { l: "Tag Number",             v: asset.tagNumber,            mono: true },
    { l: "Serial Number",          v: asset.serialNumber,         mono: true },
    { l: "Asset Description",      v: asset.assetDescription                 },
    { l: "Category",               v: asset.category,             chip: "purple" as const },
    { l: "Owning Department",      v: owningDept,                 mono: true },
    { l: "Criticality",            v: asset.criticality,          chip: "criticality" as const },
    { l: "WIP Acct Class",         v: asset.wipClass                         },
    { l: "Area (Political Admin)", v: politicalArea,              mono: true },
    { l: "Maintainable",           v: asset.maintainable,         bool: true },
    { l: "Active",                 v: asset.active,               bool: true },
    { l: "Production Org",         v: asset.productionOrg                    },
    { l: "Equipment Item",         v: asset.equipmentItem                    },
    { l: "EQP Serial Number",      v: asset.eqpSerial,            mono: true },
    { l: "Fixed Asset Category",   v: asset.faCategory                       },
    { l: "Fixed Asset Number",     v: asset.faNumber,             mono: true },
    { l: "Parent Asset Number",    v: asset.parentAsset,          mono: true },
    { l: "Parent Asset Serial",    v: asset.parentSerial,         mono: true },
    { l: "Property Location Name", v: asset.locationName                     },
    { l: "Property Location Code", v: asset.locationCode,         mono: true },
    { l: "Address",                v: asset.address                          },
    { l: "Warranty Expiration",    v: asset.warrantyExpiration               },
    { l: "Checked Out",            v: asset.checkedOut,           bool: true },
    { l: "FA Synchronized",        v: asset.faSynced,             bool: true },
    { l: "Operational Flag",       v: asset.operational,          bool: true },
    { l: "[ ] Custom Flag",        v: asset.customFlag,           bool: true },
    { l: "Wireless Site ID",       v: asset.wirelessSiteId,       mono: true },
  ] : []

  // ── Work Order field rows ───────────────────────────────────────────────
  const woRows = [
    { l: "WO Number",   v: o.workOrderNo || "—",                     mono: true },
    { l: "Status",      v: <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 2, color: sm.color, background: sm.bg }}>{sm.label}</span> },
    { l: "Priority",    v: o.priority || "—" },
    { l: "Org Unit",    v: o.orgUnit?.name || "—" },
    { l: "Assigned To", v: o.assignedTo?.name || (o.orgUnit?.name ? `${o.orgUnit.name} (unit)` : "—") },
    { l: "Created By",  v: (o as any).createdBy?.name || "—" },
    { l: "Description", v: o.description || "—" },
    { l: "Tag Number",             v: asset?.tagNumber || "—",        mono: true },
    { l: "Serial Number",          v: asset?.serialNumber || "—",     mono: true },
    { l: "Owning Department",      v: owningDept,                     mono: true },
    { l: "Area (Political Admin)", v: politicalArea,                  mono: true },
    { l: "Fixed Asset Category",   v: asset?.faCategory || "—" },
    { l: "Scheduled",   v: o.scheduledAt  ? new Date(o.scheduledAt).toLocaleString()  : "—" },
    { l: "Started",     v: o.startedAt    ? new Date(o.startedAt).toLocaleString()    : "—" },
    { l: "Completed",   v: o.completedAt  ? new Date(o.completedAt).toLocaleString()  : "—" },
    { l: "Archived",    v: o.archivedAt   ? new Date(o.archivedAt).toLocaleString()   : "—" },
    { l: "Duration",    v: fmtDuration(dur),                                         mono: true },
    { l: "Created",     v: new Date(o.createdAt).toLocaleString() },
  ]

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "8px" }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 6,
          width: "100vw", maxWidth: "100vw", height: "100vh", maxHeight: "100vh",
          overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: "0 12px 48px rgba(0,0,0,.28)",
        }}
      >
        {/* ── Header ── */}
        <div style={{ background: "linear-gradient(90deg,#2d7d32,#388e3c)", color: "#fff", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ minWidth: 0, overflow: "hidden" }}>
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.title}</div>
            <div style={{ fontSize: 10, opacity: .8, fontFamily: "monospace", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.workOrderNo || o.id}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Lifecycle action buttons — same as Task Center bulk actions */}
            {lifecycleBtns.map(b => (
              <button
                key={b.action + b.label}
                onClick={() => act(o.id, b.action)}
                style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, background: b.bg, color: "#fff", border: "none", borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {b.label}
              </button>
            ))}
            {/* Delete button — after lifecycle actions */}
            {lifecyclePerms.canDelete && onDelete && (
              <button
                onClick={onDelete}
                style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, background: "rgba(239,68,68,.15)", color: "#fecaca", border: "1px solid rgba(239,68,68,.4)", borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                🗑 Delete
              </button>
            )}
            <button onClick={onClose} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 2, color: "#fff", cursor: "pointer", fontSize: 20, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        </div>

        {lockedByOther && (
          <div style={{ background: "#fef2f2", borderBottom: "1px solid #fca5a5", padding: "9px 20px", fontSize: 11, color: "#b91c1c", fontWeight: 600, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>🔒</span>
            <span>This work order is checked out by <strong>{checkedOutByName || "another user"}</strong> and is locked. Only that user (or an admin) can act on it.</span>
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: "flex", borderBottom: "2px solid #e5e7eb", background: "#f9fafb", flexShrink: 0, overflowX: "auto" }}>
          {([["wo", "📋 Work Order Details"], ["asset", "🖥 Asset Details"]] as [string,string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as "wo" | "asset")}
              style={{
                padding: "10px 24px", fontSize: 12, fontWeight: activeTab === key ? 700 : 400,
                color: activeTab === key ? "#2d7d32" : "#6b7280",
                background: "transparent", border: "none",
                borderBottom: activeTab === key ? "2px solid #2d7d32" : "2px solid transparent",
                marginBottom: -2, cursor: "pointer", transition: "all .12s",
                flexShrink: 0, whiteSpace: "nowrap",
              }}
            >
              {label}
              {key === "asset" && !asset && (
                <span style={{ marginLeft: 6, fontSize: 9, color: "#f59e0b", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 3, padding: "1px 5px" }}>no asset</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Body (scrollable) ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }} className="detail-body">

          {/* ─── WO DETAILS tab ─── */}
          {activeTab === "wo" && (
            <div className="detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
              {woRows.map(({ l, v, mono }: any) => (
                <div key={l} style={ROW}>
                  <span className="detail-lbl" style={LBL}>{l}</span>
                  {typeof v === "string"
                    ? <span style={{ fontSize: 11, color: "#111827", fontFamily: mono ? "monospace" : undefined }}>{v}</span>
                    : v}
                </div>
              ))}
            </div>
          )}

          {/* ─── ASSET DETAILS tab ─── */}
          {activeTab === "asset" && (
            asset ? (
              <div className="detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
                {assetRows.map(({ l, v, mono, bool, chip }: any) => (
                  <div key={l} style={ROW}>
                    <span className="detail-lbl" style={LBL}>{l}</span>
                    {bool ? <BoolVal v={v as boolean | null} />
                      : chip ? <ChipVal v={v} color={chip} />
                      : <Val v={v} mono={mono} />}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", gap: 10 }}>
                <div style={{ fontSize: 36 }}>📦</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>No asset linked to this work order</div>
                <div style={{ fontSize: 11 }}>Asset fields will appear here for work orders created via the Upload action.</div>
              </div>
            )
          )}
        </div>

        {/* ── Collapsible lower sections ── */}
        <div style={{ flexShrink: 0, padding: "10px 20px", background: "#fff", borderTop: "1px solid #e5e7eb", overflowY: "auto", maxHeight: "50vh" }}>

          {/* Assign to Org Unit */}
          {showActionFooter && (
            <>
              <SectionToggle id="assign" label="Assign to Org Unit" color="#1d4ed8" badge={canAssign ? "Action" : undefined} />
              {expandedSections.has("assign") && (
                <div style={{ marginBottom: 12, padding: "10px 12px", background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb" }}>
                  {canAssign && (
                    <div>
                      {assignError && (
                        <div style={{ marginBottom: 7, padding: "5px 10px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 3, fontSize: 11, color: "#dc2626" }}>⚠ {assignError}</div>
                      )}
                      <div style={{ border: "1px solid #d1d5db", borderRadius: 3, maxHeight: 140, overflowY: "auto", background: "#fff", padding: "3px 2px", marginBottom: 8 }}>
                        {tree && (
                          <OrgTree
                            node={tree}
                            selected={targetOrgUnitId}
                            onSelect={id => { setTargetOrgUnitId(id); setTargetOrgName(findOrgName(tree, id)) }}
                          />
                        )}
                      </div>
                      <button
                        onClick={handleAssign}
                        disabled={assigning || !targetOrgUnitId}
                        style={{ width: "100%", padding: "7px 14px", fontSize: 11, fontWeight: 600, background: assigning || !targetOrgUnitId ? "#93c5fd" : "#1d4ed8", color: "#fff", border: "none", borderRadius: 3, cursor: assigning || !targetOrgUnitId ? "not-allowed" : "pointer" }}
                      >
                        {assigning ? "Assigning..." : "Assign Work Order"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Labor Time */}
          <SectionToggle id="labor" label="Labor Time" color="#0284c7" badge={elapsedHours != null ? `${elapsedHours}h` : undefined} />
          {expandedSections.has("labor") && (
            <div style={{ marginBottom: 12, padding: "10px 12px", background: "#f0f9ff", borderRadius: 6, border: "1px solid #bae6fd" }}>
              {elapsedHours != null && (
                <div style={{ fontSize: 10, color: "#0369a1", fontWeight: 600, marginBottom: 6 }}>⏱ {elapsedHours}h elapsed (auto)</div>
              )}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={laborHours}
                  onChange={e => setLaborHours(e.target.value)}
                  placeholder="0"
                  style={{ width: 80, fontSize: 12, padding: "4px 8px", border: "1px solid #bae6fd", borderRadius: 4, outline: "none" }}
                />
                <span style={{ fontSize: 11, color: "#64748b" }}>hours</span>
                <button
                  onClick={saveLaborHours}
                  disabled={savingTime || !laborHours}
                  style={{ fontSize: 10, padding: "4px 10px", background: savingTime ? "#94a3b8" : "#0284c7", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
                >
                  {savingTime ? "..." : "Save"}
                </button>
              </div>
            </div>
          )}

          {/* Cost Tracking */}
          <SectionToggle id="cost" label="Cost Tracking" color="#16a34a" badge={actualCost ? `${actualCost} ETB` : undefined} />
          {expandedSections.has("cost") && (
            <div style={{ marginBottom: 12, padding: "10px 12px", background: "#f0fdf4", borderRadius: 6, border: "1px solid #bbf7d0" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <div>
                  <label style={{ fontSize: 9, color: "#64748b", display: "block", marginBottom: 2 }}>Estimated (ETB)</label>
                  <input type="number" step="0.01" min="0" value={estimatedCost} onChange={e => setEstimatedCost(e.target.value)} placeholder="0" style={{ width: 100, fontSize: 11, padding: "4px 6px", border: "1px solid #bbf7d0", borderRadius: 4, outline: "none" }} />
                </div>
                <div>
                  <label style={{ fontSize: 9, color: "#64748b", display: "block", marginBottom: 2 }}>Parts (ETB)</label>
                  <input type="number" step="0.01" min="0" value={partsCost} onChange={e => setPartsCost(e.target.value)} placeholder="0" style={{ width: 100, fontSize: 11, padding: "4px 6px", border: "1px solid #bbf7d0", borderRadius: 4, outline: "none" }} />
                </div>
                <div>
                  <label style={{ fontSize: 9, color: "#64748b", display: "block", marginBottom: 2 }}>Actual Total (ETB)</label>
                  <input type="number" step="0.01" min="0" value={actualCost} onChange={e => setActualCost(e.target.value)} placeholder="0" style={{ width: 100, fontSize: 11, padding: "4px 6px", border: "1px solid #bbf7d0", borderRadius: 4, outline: "none" }} />
                </div>
              </div>
              <button onClick={saveCosts} disabled={savingCost} style={{ fontSize: 10, padding: "4px 12px", background: savingCost ? "#94a3b8" : "#16a34a", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
                {savingCost ? "..." : "Save Costs"}
              </button>
            </div>
          )}

          {/* Comments & Notes */}
          <SectionToggle id="comments" label="Comments & Notes" color="#475569" badge={comments.length > 0 ? `${comments.length}` : undefined} />
          {expandedSections.has("comments") && (
            <div style={{ marginBottom: 12, padding: "10px 12px", background: "#f8fafc", borderRadius: 6 }}>
              <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 8 }}>
                {comments.length === 0 ? (
                  <p style={{ fontSize: 11, color: "#94a3b8", padding: "8px 0" }}>No comments yet.</p>
                ) : (
                  comments.map(c => (
                    <div key={c.id} style={{ marginBottom: 8, padding: "8px 10px", background: "#fff", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#334155" }}>{c.user?.name || "Unknown"}</span>
                        <span style={{ fontSize: 9, color: "#94a3b8" }}>{new Date(c.createdAt).toLocaleString()}</span>
                      </div>
                      <p style={{ fontSize: 11, color: "#475569", margin: 0, whiteSpace: "pre-wrap" }}>{c.text}</p>
                    </div>
                  ))
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment() } }}
                  placeholder="Add a comment... (Enter to send)"
                  style={{ flex: 1, fontSize: 11, padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, outline: "none" }}
                />
                <button
                  onClick={postComment}
                  disabled={postingComment || !newComment.trim()}
                  style={{ fontSize: 11, padding: "6px 12px", background: postingComment || !newComment.trim() ? "#94a3b8" : "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
                >
                  {postingComment ? "..." : "Send"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @media (max-width: 640px) {
          .detail-grid { grid-template-columns: 1fr !important; gap: 0 !important; }
          .detail-lbl { min-width: 110px !important; }
          .detail-body { padding: 10px 12px !important; }
        }
      `}</style>
    </div>
  )
}

