// components/WoGrantMatrixTable.tsx
// ──────────────────────────────────────────────────────────────────────────────
// Interactive editor for the Work Order action permission matrix.
// Architecture mirrors GrantMatrixTable (adminGrants) exactly:
//   • loads live from DB on mount
//   • SSE keeps savedMatrix in sync with other sessions
//   • user's draft edits are local-only until Save
//   • unsaved cells are highlighted amber
//   • SUPER_ADMIN row is immutable (locked)
// ──────────────────────────────────────────────────────────────────────────────

"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { useToast } from "@/components/ToastProvider"
import {
  ALL_WO_ACTIONS,
  DEFAULT_WO_GRANT_MATRIX,
  WO_ACTION_DESC,
  WO_ACTION_GROUPS,
  WO_ACTION_LABELS,
  WoAction,
  WoGrantMatrix,
} from "@/lib/workOrderGrants"

// ── Roles ─────────────────────────────────────────────────────────────────────

const ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "CHIEF",
  "DIRECTOR",
  "MANAGER",
  "SUPERVISOR",
  "USER",
] as const
type Role = (typeof ROLES)[number]

const TOTAL_ACTIONS = ALL_WO_ACTIONS.length

// ── Role colour palette (same tokens as GrantMatrixTable for consistency) ─────

const ROLE_COLORS: Record<Role, { bg: string; text: string; border: string; pill: string }> = {
  SUPER_ADMIN: { bg: "#EEEDFE", text: "#3C3489", border: "#C4C2F5", pill: "#7C7AE8" },
  ADMIN:       { bg: "#E6F1FB", text: "#0C447C", border: "#93C5E8", pill: "#3B82F6" },
  CHIEF:       { bg: "#EAF3DE", text: "#27500A", border: "#A8D575", pill: "#65A30D" },
  DIRECTOR:    { bg: "#E1F5EE", text: "#085041", border: "#5DCAA5", pill: "#059669" },
  MANAGER:     { bg: "#FEF3C7", text: "#92400E", border: "#FCD34D", pill: "#D97706" },
  SUPERVISOR:  { bg: "#FFE4E6", text: "#9F1239", border: "#FCA5A5", pill: "#EF4444" },
  USER:        { bg: "#F1F5F9", text: "#334155", border: "#CBD5E1", pill: "#64748B" },
}

// ── Group accent colours ──────────────────────────────────────────────────────

const GROUP_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "Visibility":             { bg: "#EFF6FF", text: "#1E40AF", dot: "#3B82F6" },
  "Creation & Management":  { bg: "#F0FDF4", text: "#166534", dot: "#22C55E" },
  "Assignment":             { bg: "#FFF7ED", text: "#9A3412", dot: "#F97316" },
  "Lifecycle":              { bg: "#F5F3FF", text: "#5B21B6", dot: "#8B5CF6" },
}

// ── Lifecycle badge for action labels ─────────────────────────────────────────
// Maps certain actions to a status badge so admins see the state-machine link
const LIFECYCLE_BADGE: Partial<Record<WoAction, { label: string; color: string; bg: string }>> = {
  wo_checkout:      { label: "→ Processing",  color: "#5B21B6", bg: "#EDE9FE" },
  wo_start:         { label: "→ In Progress", color: "#92400E", bg: "#FEF3C7" },
  wo_complete:      { label: "→ Completed",   color: "#166534", bg: "#DCFCE7" },
  wo_checkin:       { label: "→ Archived",    color: "#374151", bg: "#F1F5F9" },
  wo_force_archive: { label: "→ Archived ⚠",  color: "#991B1B", bg: "#FEE2E2" },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WoGrantMatrixTable() {
  const { showToast } = useToast()
  const [draft,       setDraft]       = useState<WoGrantMatrix>({})
  const [savedMatrix, setSavedMatrix] = useState<WoGrantMatrix>({})
  const [loaded,      setLoaded]      = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [search,      setSearch]      = useState("")
  const [roleFilter,  setRoleFilter]  = useState<Role | "">("")
  const [hoveredDesc, setHoveredDesc] = useState<WoAction | null>(null)
  const [isMobile,    setIsMobile]    = useState(false)
  const [isSmall,     setIsSmall]     = useState(false)

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth <= 768)
      setIsSmall(window.innerWidth <= 480)
    }
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  // ── Load from DB on mount ─────────────────────────────────────────────────
  const loadFromServer = useCallback(async () => {
    try {
      const res  = await fetch("/api/admin/wo-permissions", { credentials: "include" })
      if (!res.ok) return
      const data = await res.json()
      const m: WoGrantMatrix = data.matrix ?? DEFAULT_WO_GRANT_MATRIX
      setDraft(JSON.parse(JSON.stringify(m)))
      setSavedMatrix(JSON.parse(JSON.stringify(m)))
    } catch {
      const fallback = JSON.parse(JSON.stringify(DEFAULT_WO_GRANT_MATRIX))
      setDraft(fallback)
      setSavedMatrix(fallback)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { loadFromServer() }, [loadFromServer])

  // ── SSE — live updates from other sessions ─────────────────────────────────
  useEffect(() => {
    if (!loaded) return
    const es = new EventSource("/api/admin/wo-permissions/events")
    es.onmessage = (e) => {
      try {
        const { event, matrix: m } = JSON.parse(e.data)
        if (event === "updated" && m) {
          setSavedMatrix(JSON.parse(JSON.stringify(m)))
        }
      } catch { /* ignore */ }
    }
    es.onerror = () => setTimeout(loadFromServer, 5_000)
    return () => es.close()
  }, [loaded, loadFromServer])

  // ── Toggle a single cell ──────────────────────────────────────────────────
  function toggle(role: Role, action: WoAction) {
    if (role === "SUPER_ADMIN") return
    setDraft((prev) => {
      const current: WoAction[] = (prev[role] ?? []) as WoAction[]
      const has = current.includes(action)
      return {
        ...prev,
        [role]: has ? current.filter((a) => a !== action) : [...current, action],
      }
    })
  }

  // ── Bulk column toggle (grant / revoke all for a role) ────────────────────
  function toggleAll(role: Role) {
    if (role === "SUPER_ADMIN") return
    setDraft((prev) => {
      const current: WoAction[] = (prev[role] ?? []) as WoAction[]
      const allGranted = ALL_WO_ACTIONS.every((a) => current.includes(a))
      return {
        ...prev,
        [role]: allGranted ? [] : [...ALL_WO_ACTIONS],
      }
    })
  }

  // ── Bulk row toggle (grant / revoke an action for all non-locked roles) ───
  function toggleRow(action: WoAction) {
    setDraft((prev) => {
      const editableRoles = ROLES.filter((r) => r !== "SUPER_ADMIN")
      const allGranted = editableRoles.every((r) => (prev[r] ?? []).includes(action))
      const next = { ...prev }
      for (const r of editableRoles) {
        const cur = (next[r] ?? []) as WoAction[]
        next[r] = allGranted ? cur.filter((a) => a !== action) : [...new Set([...cur, action])]
      }
      return next
    })
  }

  // ── Save to DB ────────────────────────────────────────────────────────────
  async function save() {
    setSaving(true)
    try {
      const res  = await fetch("/api/admin/wo-permissions", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify(draft),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || "Save failed", "error"); return }
      const confirmed: WoGrantMatrix = data.matrix ?? draft
      setSavedMatrix(JSON.parse(JSON.stringify(confirmed)))
      setDraft(JSON.parse(JSON.stringify(confirmed)))
      showToast("WO permissions saved — live across all sessions", "success")
    } catch (e: any) {
      showToast(e.message || "Save failed", "error")
    } finally {
      setSaving(false)
    }
  }

  function discard() {
    setDraft(JSON.parse(JSON.stringify(savedMatrix)))
    showToast("Changes discarded", "info")
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const dirty = useMemo(() => {
    for (const role of ROLES) {
      const d = [...(draft[role] ?? [])].sort().join(",")
      const s = [...(savedMatrix[role] ?? [])].sort().join(",")
      if (d !== s) return true
    }
    return false
  }, [draft, savedMatrix])

  const visibleRoles = roleFilter ? ([roleFilter] as Role[]) : [...ROLES]

  const filteredGroups = useMemo(() => {
    if (!search) return WO_ACTION_GROUPS
    const q = search.toLowerCase()
    const result: Record<string, WoAction[]> = {}
    for (const [group, actions] of Object.entries(WO_ACTION_GROUPS)) {
      const matches = actions.filter(
        (a) =>
          a.includes(q) ||
          WO_ACTION_LABELS[a].toLowerCase().includes(q) ||
          group.toLowerCase().includes(q),
      )
      if (matches.length) result[group] = matches
    }
    return result
  }, [search])

  const roleSummary = useMemo(
    () =>
      ROLES.map((r) => ({
        role:  r,
        count: (draft[r] ?? []).length,
        pct:   Math.round(((draft[r] ?? []).length / TOTAL_ACTIONS) * 100),
      })),
    [draft],
  )

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:300, color:"#94a3b8", fontSize:13 }}>
        Loading WO permissions…
      </div>
    )
  }

  // Responsive style values computed in JS — applied directly as inline styles
  const S = {
    roleMin: isSmall ? 42 : isMobile ? 52 : 90,
    labelMin: isSmall ? 80 : isMobile ? 100 : 260,
    cellSize: isSmall ? 20 : isMobile ? 24 : 32,
    cellFont: isSmall ? 10 : isMobile ? 11 : 14,
    roleBadgeFont: isSmall ? 7 : isMobile ? 8 : 10,
    roleBadgePad: isSmall ? "1px 3px" : isMobile ? "2px 4px" : "3px 8px",
    grantFont: isSmall ? 6 : isMobile ? 7 : 9,
    grantPad: isSmall ? "0 2px" : isMobile ? "0 2px" : "1px 7px",
    thPad: isMobile ? "4px 2px" : "10px 12px",
    labelPad: isMobile ? "4px 8px" : "10px 14px",
    theadH: isMobile ? 48 : 64,
  }

  return (
    <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"visible", fontFamily:"system-ui,sans-serif", fontSize: isMobile ? 11 : 13 }}>

      {/* ── HEADER ── */}
      <div className="gm-header-row" style={{ padding:"12px var(--gm-pad-x, 20px)", borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ minWidth:0, flex:1 }}>
          <div className="gm-title-line" style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
            {/* WO icon badge */}
            <div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#7C3AED,#5B21B6)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <span style={{ color:"#fff", fontSize:13 }}>⚙</span>
            </div>
            <h2 style={{ margin:0, fontSize:"var(--gm-h2, 17px)", fontWeight:700, color:"#0f172a", whiteSpace:"nowrap" }}>
              Work Order Action Permissions
            </h2>
            {dirty ? (
              <span style={{ color:"#d97706", fontWeight:600, fontSize:"var(--gm-font-xs, 11px)" }}>Unsaved changes</span>
            ) : (
              <span style={{ color:"#16a34a", fontWeight:600, fontSize:"var(--gm-font-xs, 11px)" }}>All saved</span>
            )}
          </div>
          <p className="gm-subtitle gm-desc" style={{ margin:"0 0 0 36px", fontSize:"var(--gm-font-sm, 12px)", color:"#64748b" }}>
            Control which roles can perform each work order lifecycle action.
          </p>
        </div>

        <div className="gm-controls" style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ padding:"5px 8px", fontSize:"var(--gm-font-sm, 12px)", border:"1px solid #e2e8f0", borderRadius:6, width:"var(--gm-search-w, 180px)", maxWidth:"100%", outline:"none" }}
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "")}
            style={{ padding:"5px 8px", fontSize:"var(--gm-font-sm, 12px)", border:"1px solid #e2e8f0", borderRadius:6, background:"#fff" }}
          >
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* ── ROLE SUMMARY BAR ── */}
      <div style={{ display:"flex", gap:8, padding:"10px var(--gm-pad-x, 20px)", borderBottom:"1px solid #f1f5f9", overflowX:"auto", justifyContent: roleFilter ? "center" : "flex-start" }}>
        {roleSummary
          .filter((rc) => !roleFilter || rc.role === roleFilter)
          .map(({ role, count, pct }) => {
            const c        = ROLE_COLORS[role as Role]
            const isActive = roleFilter === role
            return (
              <div
                key={role}
                onClick={() => setRoleFilter((prev) => (prev === role ? "" : role as Role))}
                style={{ flexShrink:0, padding:"7px 12px", borderRadius:8, cursor:"pointer", background: isActive ? c.bg : "#f8fafc", border:`1px solid ${isActive ? c.border : "#e2e8f0"}`, transition:"all .15s", minWidth:"var(--gm-pill-min, 110px)" }}
              >
                <div style={{ fontSize:"var(--gm-font-xs, 10px)", fontWeight:700, color:c.text, letterSpacing:".05em", marginBottom:4, display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ width:7, height:7, borderRadius:"50%", background:c.pill, display:"inline-block", flexShrink:0 }}/>
                  {role}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ flex:1, height:4, background:"#e2e8f0", borderRadius:2, overflow:"hidden" }}>
                    <div style={{ width:`${pct}%`, height:"100%", background:c.pill, borderRadius:2, transition:"width .3s" }}/>
                  </div>
                  <span style={{ fontSize:"var(--gm-font-xs, 10px)", color:"#64748b", whiteSpace:"nowrap" }}>{count}/{TOTAL_ACTIONS}</span>
                </div>
              </div>
            )
          })}
      </div>

      {/* ── LEGEND ── */}
      <div style={{ padding:"8px var(--gm-pad-x, 20px)", borderBottom:"1px solid #f1f5f9", display:"flex", gap:16, flexWrap:"wrap", alignItems:"center" }}>
        <span style={{ fontSize:"var(--gm-font-xs, 10px)", color:"#94a3b8", fontWeight:600, textTransform:"uppercase", letterSpacing:".06em" }}>Groups:</span>
        {Object.entries(GROUP_COLORS).map(([name, c]) => (
          <span key={name} style={{ display:"flex", alignItems:"center", gap:5, fontSize:"var(--gm-font-sm, 11px)", color:c.text }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:c.dot, display:"inline-block" }}/>
            {name}
          </span>
        ))}
        <span className="gm-desc" style={{ marginLeft:"auto", fontSize:"var(--gm-font-xs, 10px)", color:"#94a3b8" }}>
          Click header to toggle entire column · Click row label to toggle entire row
        </span>
      </div>

      {/* ── MATRIX TABLE ── */}
      <div style={{ overflow:"auto", maxHeight: isMobile ? "calc(100vh - 220px)" : "calc(100vh - 260px)", WebkitOverflowScrolling:"touch", position:"relative" }}>
        <table style={{ width: isMobile ? "max-content" : "100%", minWidth: "100%", borderCollapse:"collapse", fontSize: isMobile ? 11 : 12 }}>
          <thead style={{ background:"#f8fafc" }}>
            <tr>
              {/* Action label column — frozen top-left corner */}
              <th style={{ padding: S.labelPad, textAlign:"left", background:"#f8fafc", borderBottom:"2px solid #e2e8f0", position:"sticky", top:0, left:0, zIndex:30, minWidth: S.labelMin, height: S.theadH }}>
                <span style={{ fontSize:"var(--gm-font-xs, 10px)", fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".05em" }}>
                  Work Order Action
                </span>
              </th>

              {visibleRoles.map((role) => {
                const c         = ROLE_COLORS[role as Role]
                const isLocked  = role === "SUPER_ADMIN"
                const cur       = (draft[role] ?? []) as WoAction[]
                const allGiven  = ALL_WO_ACTIONS.every((a) => cur.includes(a))
                return (
                  <th
                    key={role}
                    style={{ padding: S.thPad, textAlign:"center", background:"#f8fafc", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap", width: roleFilter ? "100%" : `${Math.floor(100 / ROLES.length)}%`, minWidth: S.roleMin, height: S.theadH, position:"sticky", top:0, zIndex:10 }}
                  >
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                      <span style={{ fontSize: S.roleBadgeFont, fontWeight:700, padding: S.roleBadgePad, borderRadius:5, background:c.bg, color:c.text, border:`1px solid ${c.border}`, letterSpacing:".04em" }}>
                        {role}
                      </span>
                      {isLocked ? (
                        <span style={{ fontSize: S.grantFont, color:"#94a3b8" }}>locked</span>
                      ) : (
                        <button
                          onClick={() => toggleAll(role as Role)}
                          title={allGiven ? "Revoke all" : "Grant all"}
                          style={{ fontSize: S.grantFont, padding: S.grantPad, borderRadius:3, border:`1px solid ${c.border}`, background:allGiven ? c.bg : "#fff", color:allGiven ? c.text : "#94a3b8", cursor:"pointer", fontWeight:600 }}
                        >
                          {allGiven ? "Revoke all" : "Grant all"}
                        </button>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {Object.entries(filteredGroups).map(([group, actions]) => {
              const gc = GROUP_COLORS[group] ?? { bg:"#f8fafc", text:"#64748b", dot:"#94a3b8" }
              return (
                <Fragment key={group}>
                  {/* Group header row — full width, text always visible */}
                  <tr className="gm-group-row">
                    <td
                      colSpan={visibleRoles.length + 1}
                      style={{ padding:"8px 14px", background:gc.bg, borderBottom:`1px solid ${gc.dot}22`, borderTop:"1px solid #f1f5f9" }}
                    >
                      <span style={{ display:"flex", alignItems:"center", gap:6, fontSize: isMobile ? 9 : 10, fontWeight:700, color:gc.text, textTransform:"uppercase", letterSpacing:".08em" }}>
                        <span style={{ width:8, height:8, borderRadius:"50%", background:gc.dot, display:"inline-block" }}/>
                        {group}
                        <span style={{ fontWeight:400, color:`${gc.text}99`, marginLeft:2, textTransform:"none" }}>
                          — {actions.length} action{actions.length !== 1 ? "s" : ""}
                        </span>
                      </span>
                    </td>
                  </tr>

                  {/* Action rows */}
                  {actions.map((action) => {
                    const badge   = LIFECYCLE_BADGE[action]
                    const label   = WO_ACTION_LABELS[action]
                    const desc    = WO_ACTION_DESC[action]
                    const isHover = hoveredDesc === action

                    // Is every editable role granted this action?
                    const editableRoles   = ROLES.filter((r) => r !== "SUPER_ADMIN")
                    const allRowGranted   = editableRoles.every((r) => (draft[r] ?? []).includes(action))

                    return (
                      <tr
                        key={action}
                        style={{ borderBottom:"1px solid #f9fafb" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#fafbfc"; setHoveredDesc(action) }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; setHoveredDesc(null) }}
                      >
                        {/* Action name cell */}
                        <td
                          style={{ padding:"var(--gm-row-pad, 9px) 14px", position:"sticky", left:0, background:"#fff", zIndex:2, borderBottom:"1px solid #f1f5f9", maxWidth:260 }}
                        >
                          <div style={{ display:"flex", alignItems:"flex-start", gap:6 }}>
                            {/* Row toggle button */}
                            <button
                              onClick={() => toggleRow(action)}
                              title={allRowGranted ? "Revoke from all editable roles" : "Grant to all editable roles"}
                              style={{ marginTop:1, width:14, height:14, borderRadius:3, border:"1px solid #cbd5e1", background: allRowGranted ? "#f1f5f9" : "#fff", cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}
                            >
                              <span style={{ fontSize:8, color:"#94a3b8", fontWeight:700 }}>
                                {allRowGranted ? "▣" : "□"}
                              </span>
                            </button>

                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
                                <span style={{ color:"#334155", fontWeight:600, fontSize:"var(--gm-font-sm, 12px)" }}>{label}</span>
                                {badge && (
                                  <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:badge.bg, color:badge.color, fontWeight:700, whiteSpace:"nowrap" }}>
                                    {badge.label}
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize:"var(--gm-font-xs, 10px)", color:"#94a3b8", fontFamily:"monospace" }}>{action}</span>
                              {isHover && (
                                <div style={{ marginTop:3, fontSize:"var(--gm-font-xs, 10px)", color:"#64748b", fontStyle:"italic", lineHeight:1.4 }}>
                                  {desc}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Role cells */}
                        {visibleRoles.map((role) => {
                          const granted      = (draft[role] ?? []).includes(action)
                          const locked       = role === "SUPER_ADMIN"
                          const savedGranted = (savedMatrix[role] ?? []).includes(action)
                          const unsaved      = granted !== savedGranted
                          const c            = ROLE_COLORS[role as Role]

                          return (
                            <td
                              key={role}
                              style={{ padding:6, textAlign:"center", borderBottom:"1px solid #f1f5f9" }}
                            >
                              <div style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>
                                <button
                                  onClick={() => !locked && toggle(role as Role, action)}
                                  title={
                                    locked
                                      ? "SUPER_ADMIN permissions are immutable"
                                      : unsaved
                                        ? `${granted ? "Granted" : "Revoked"} (unsaved) — click to revert`
                                        : granted
                                          ? "Granted — click to revoke"
                                          : "Not granted — click to grant"
                                  }
                                  style={{
                                    width: S.cellSize, height: S.cellSize, borderRadius:7,
                                    border:`1.5px solid ${unsaved ? "#f59e0b" : granted ? c.border : "#e2e8f0"}`,
                                    background: unsaved ? "#fef3c7" : granted ? c.bg : "#fff",
                                    color: unsaved ? "#92400e" : granted ? c.text : "#cbd5e1",
                                    cursor: locked ? "default" : "pointer",
                                    fontWeight:700, fontSize: S.cellFont,
                                    transition:"all .12s",
                                    opacity: locked ? 0.5 : 1,
                                    outline:"none",
                                    display:"flex", alignItems:"center", justifyContent:"center",
                                  }}
                                >
                                  {granted ? "✓" : "—"}
                                </button>
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ padding:"12px var(--gm-pad-x, 20px)", borderTop:"1px solid #e2e8f0", background:"#fafafa", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
        <span style={{ fontSize:"var(--gm-font-xs, 11px)", color:"#94a3b8" }}>
          {Object.values(draft).reduce((s, p) => s + p.length, 0)} total grants across {ROLES.length} roles
          {dirty && <span style={{ color:"#d97706", marginLeft:8 }}>· unsaved changes</span>}
        </span>

        <div style={{ display:"flex", gap:8 }}>
          {dirty && (
            <button
              onClick={discard}
              style={{ padding:"7px 14px", fontSize:"var(--gm-font-sm, 12px)", borderRadius:6, border:"1px solid #e2e8f0", background:"#fff", color:"#64748b", cursor:"pointer" }}
            >
              Discard
            </button>
          )}
          <button
            onClick={save}
            disabled={saving || !dirty}
            style={{
              padding:"7px 18px", fontSize:"var(--gm-font-sm, 12px)", fontWeight:600, borderRadius:6, border:"none",
              cursor: saving || !dirty ? "not-allowed" : "pointer",
              background: dirty ? "#7C3AED" : "#e2e8f0",
              color: dirty ? "#fff" : "#94a3b8",
              transition:"all .15s",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save Permissions"}
          </button>
        </div>
      </div>
    </div>
  )
}
