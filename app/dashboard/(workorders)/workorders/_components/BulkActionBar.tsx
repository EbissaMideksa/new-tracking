
// app/dashboard/(workorders)/workorders/_components/BulkActionBar.tsx
"use client"

import { useState } from "react"
import { WorkOrder } from "@/hooks/useWorkOrders"
import { useConfirm } from "@/components/ConfirmProvider"
import OrgTree from "./OrgTree"
import { isWoLockedByOther } from "@/lib/woCheckoutClient"

interface BulkActionBarProps {
  selectedIds:   Set<string>
  orders:        WorkOrder[]       // full filtered list — used to derive statuses
  view:          string            // "ORDER_MONITORING" | "TASK_CENTER" | "ORG_ORDERS"
  me?:           any               // current user — used for the checkout-lock check
  // ── Permission flags (all optional → false) ────────────────────────────
  canDelete?:    boolean
  canAssign?:    boolean
  canReassign?:  boolean
  canCheckout?:  boolean
  canStart?:     boolean
  canComplete?:  boolean
  canCheckin?:   boolean
  // ── Async handlers (only pass what applies) ───────────────────────────
  onDelete?:    (ids: string[]) => Promise<void>
  onAssign?:    (ids: string[], targetOrgUnitId: string) => Promise<void>
  onCheckout?:  (ids: string[]) => Promise<void>
  onStart?:     (ids: string[]) => Promise<void>
  onComplete?:  (ids: string[]) => Promise<void>
  onCheckin?:   (ids: string[]) => Promise<void>
  // ── Misc ──────────────────────────────────────────────────────────────
  tree?:        any
  onRefresh:    () => void
  onClearSelection?: () => void
}

// ── Button spec ───────────────────────────────────────────────────────────────
type BtnSpec = {
  key:       string
  label:     string
  bg:        string
  show:      boolean
  onClick:   () => void
}

// ─────────────────────────────────────────────────────────────────────────────

export default function BulkActionBar({
  selectedIds,
  orders,
  view,
  me,
  canDelete    = false,
  canAssign    = false,
  canReassign  = false,
  canCheckout  = false,
  canStart     = false,
  canComplete  = false,
  canCheckin   = false,
  onDelete,
  onAssign,
  onCheckout,
  onStart,
  onComplete,
  onCheckin,
  tree,
  onRefresh,
  onClearSelection,
}: BulkActionBarProps) {
  const [loading,         setLoading]         = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignTarget,    setAssignTarget]    = useState("")
  const [assignTargetName, setAssignTargetName] = useState("")
  const [error,           setError]           = useState<string | null>(null)
  const confirm = useConfirm()

  const count          = selectedIds.size
  const selectedOrders = orders.filter(o => selectedIds.has(o.id))
  const statuses       = new Set(selectedOrders.map(o => o.status))

  if (count === 0) return null

  // ── Per-action availability ───────────────────────────────────────────────
  const allAre    = (...s: string[]) => selectedOrders.every(o => s.includes(o.status))
  const noneAre   = (...s: string[]) => selectedOrders.every(o => !s.includes(o.status))

  // Checkout lock — if any selected WO is checked out by another user (and the
  // caller can't override), disable all bulk actions and show a lock notice.
  const anyLocked = selectedOrders.some(o => isWoLockedByOther(o, me))

  // Lifecycle gates — only meaningful in TASK_CENTER
  // Start, Complete, Force Archive suspended for non-admins (kept for admins for future activation)
  const isFullAdmin = me && ["ADMIN", "SUPER_ADMIN"].includes(me.role)
  const showCheckout = !!canCheckout && !!onCheckout && view === "TASK_CENTER" && allAre("CREATED", "ASSIGNED") && !anyLocked
  const showStart    = !!canStart    && !!onStart    && view === "TASK_CENTER" && isFullAdmin && allAre("CHECKED_OUT") && !anyLocked
  const showComplete = !!canComplete && !!onComplete && view === "TASK_CENTER" && isFullAdmin && allAre("IN_PROGRESS") && !anyLocked
  const showCheckin  = !!canCheckin  && !!onCheckin  && view === "TASK_CENTER" && allAre("CHECKED_OUT", "IN_PROGRESS", "COMPLETED") && !anyLocked

  // Assign — works in all views; status gate varies
  const assignableStatuses = ["CREATED", "ASSIGNED", "CHECKED_OUT"]
  const allAssignable      = selectedOrders.every(o => assignableStatuses.includes(o.status))
  const needsReassign      = selectedOrders.some(o => o.status === "CHECKED_OUT")
  const showAssign         = !!onAssign && allAssignable && (needsReassign ? canReassign : canAssign) && !anyLocked

  // Delete — blocked only for IN_PROGRESS
  const showDelete = !!canDelete && !!onDelete && noneAre("IN_PROGRESS") && !anyLocked

  const hasAnyAction = showCheckout || showStart || showComplete || showCheckin || showAssign || showDelete
  if (!hasAnyAction && !anyLocked) return null   // nothing to show for this selection

  // ── Generic action runner ────────────────────────────────────────────────
  async function run(
    label:      string,
    handler:    (ids: string[]) => Promise<void>,
    successMsg: string,
  ) {
    setLoading(true)
    setError(null)
    try {
      await handler(Array.from(selectedIds))
      onClearSelection?.()
      onRefresh()
    } catch (e: any) {
      setError(e.message || `${label} failed`)
    } finally {
      setLoading(false)
    }
  }

  // ── Assign modal submit ──────────────────────────────────────────────────
  async function submitAssign() {
    if (!assignTarget || !onAssign) return
    setLoading(true)
    setError(null)
    try {
      await onAssign(Array.from(selectedIds), assignTarget)
      setShowAssignModal(false)
      setAssignTarget("")
      setAssignTargetName("")
      onClearSelection?.()
      onRefresh()
    } catch (e: any) {
      setError(e.message || "Assign failed")
    } finally {
      setLoading(false)
    }
  }

  // ── Ordered button list ──────────────────────────────────────────────────
  const buttons: BtnSpec[] = [
    {
      key:     "checkout",
      label:   "◀ Check Out",
      bg:      "#1d4ed8",
      show:    showCheckout,
      onClick: () => run("Checkout", onCheckout!, "Checked out → Processing"),
    },
    {
      key:     "start",
      label:   "▶ Start",
      bg:      "#d97706",
      show:    showStart,
      onClick: () => run("Start", onStart!, "Started → In Progress"),
    },
    {
      key:     "complete",
      label:   "✓ Complete",
      bg:      "#059669",
      show:    showComplete,
      onClick: () => run("Complete", onComplete!, "Completed successfully"),
    },
    {
      key:     "checkin",
      label:   "⬆ Check In",
      bg:      "#374151",
      show:    showCheckin,
      onClick: () => run("Checkin", onCheckin!, "Archived"),
    },
    {
      key:     "assign",
      label:   "↗ Assign",
      bg:      "#f59e0b",
      show:    showAssign,
      onClick: () => setShowAssignModal(true),
    },
    {
      key:     "delete",
      label:   "🗑 Delete",
      bg:      "#ef4444",
      show:    showDelete,
      onClick: async () => {
        const msg = count === 1
          ? "Permanently delete this work order? This cannot be undone."
          : `Permanently delete ${count} work orders? This cannot be undone.`
        if (!(await confirm({ message: msg, confirmLabel: count === 1 ? "Delete" : `Delete ${count}` }))) return
        run(
          "Delete",
          onDelete!,
          count === 1 ? "Work order deleted" : `${count} work orders deleted`,
        )
      },
    },
  ].filter(b => b.show)

  return (
    <>
      {/* ── Bar ── */}
      <div style={{
        background: "#eff6ff", borderBottom: "2px solid #bfdbfe",
        padding: "7px 12px", display: "flex", alignItems: "center",
        justifyContent: "space-between", flexShrink: 0, gap: 8, flexWrap: "wrap",
      }}>
        {/* Selection summary */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#1e40af" }}>
            📌 {count} selected
          </span>
          {statuses.size === 1 && (
            <span style={{ fontSize: 10, color: "#3b82f6" }}>
              — {Array.from(statuses)[0]}
            </span>
          )}
          {error && (
            <span style={{ fontSize: 10, color: "#dc2626", fontWeight: 600 }}>
              ⚠ {error}
            </span>
          )}
          {anyLocked && (
            <span style={{ fontSize: 10, color: "#b91c1c", fontWeight: 600 }}>
              🔒 {selectedOrders.filter(o => isWoLockedByOther(o, me)).length} selected order(s) checked out by another user — actions disabled
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {buttons.map(b => (
            <button
              key={b.key}
              onClick={b.onClick}
              disabled={loading}
              style={{
                padding: "5px 13px", fontSize: 11, fontWeight: 600,
                background: loading ? "#d1d5db" : b.bg,
                color: "#fff", border: "none", borderRadius: 4,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                whiteSpace: "nowrap", transition: "opacity .12s",
              }}
            >
              {loading ? "…" : b.label}
            </button>
          ))}

          {/* Hint for IN_PROGRESS exclusion from delete */}
          {canDelete && selectedOrders.some(o => o.status === "IN_PROGRESS") && (
            <span style={{ fontSize: 9, color: "#6b7280", fontStyle: "italic" }}>
              IN_PROGRESS orders cannot be deleted
            </span>
          )}
        </div>
      </div>

      {/* ── Assign Modal ── */}
      {showAssignModal && (
        <>
          <div
            onClick={() => { if (!loading) { setShowAssignModal(false); setError(null) } }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 300 }}
          />
          <div style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            background: "#fff", borderRadius: 6,
            boxShadow: "0 20px 40px rgba(0,0,0,.15)",
            zIndex: 310, width: 380, maxWidth: "92vw",
            display: "flex", flexDirection: "column",
          }}>
            {/* Header */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
                Assign to Org Unit
              </div>
              <div style={{ marginTop: 3, fontSize: 11, color: "#6b7280" }}>
                {count} order{count > 1 ? "s" : ""} will be moved
                {assignTargetName && (
                  <span style={{ color: "#2d7d32", fontWeight: 600 }}> → {assignTargetName}</span>
                )}
              </div>
              {error && (
                <div style={{ marginTop: 6, padding: "5px 8px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 3, fontSize: 11, color: "#dc2626" }}>
                  ⚠ {error}
                </div>
              )}
            </div>

            {/* Tree */}
            <div style={{ padding: "8px 10px", maxHeight: 260, overflowY: "auto" }}>
              {tree && (
                <OrgTree
                  node={tree}
                  selected={assignTarget}
                  onSelect={id => {
                    setAssignTarget(id)
                    // find name from tree
                    function findName(n: any, target: string): string {
                      if (!n) return ""
                      if (n.id === target) return n.name
                      for (const c of n.children ?? []) { const r = findName(c, target); if (r) return r }
                      return ""
                    }
                    setAssignTargetName(findName(tree, id))
                    setError(null)
                  }}
                />
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "10px 14px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowAssignModal(false); setError(null) }}
                disabled={loading}
                style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 3, cursor: loading ? "not-allowed" : "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={submitAssign}
                disabled={!assignTarget || loading}
                style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, background: !assignTarget || loading ? "#d1d5db" : "#2d7d32", color: "#fff", border: "none", borderRadius: 3, cursor: !assignTarget || loading ? "not-allowed" : "pointer" }}
              >
                {loading ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
