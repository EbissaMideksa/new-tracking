// components/GrantMatrixTable.tsx
"use client"
import { Fragment, useMemo, useState, useEffect, useCallback } from "react"
import { AdminAction, ADMIN_ACTION_DESC, DEFAULT_GRANT_MATRIX, GrantMatrix } from "@/lib/adminGrants"
import { useToast } from "@/components/ToastProvider"

// ─── Constants ────────────────────────────────────────────────────────────────

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

const ACTION_GROUPS: Record<string, AdminAction[]> = {
  "User Management": ["manage_users", "grant_admin"],
  Assets: [
    "assets_page",
    "upload_assets",
    "assign_assets",
    "edit_asset_tags",
    "export_assets",
    "view_all_assets",
  ],
  "Work Orders": [
    "view_work_orders",
    "manage_work_orders",
  ],
  "Analytics & Audit": ["view_analytics", "view_audit", "export_audit"],
  Organization: ["org_hierarchy_manage"],
  System: ["manage_org_units", "manage_permissions", "manage_wo_permissions", "system_settings"],
}

const ALL_ACTIONS = Object.values(ACTION_GROUPS).flat()
const TOTAL_ACTIONS = ALL_ACTIONS.length

const ROLE_COLORS: Record<
  Role,
  { bg: string; text: string; border: string; pill: string }
> = {
  SUPER_ADMIN: {
    bg: "#EEEDFE",
    text: "#3C3489",
    border: "#C4C2F5",
    pill: "#7C7AE8",
  },
  ADMIN: {
    bg: "#E6F1FB",
    text: "#0C447C",
    border: "#93C5E8",
    pill: "#3B82F6",
  },
  CHIEF: {
    bg: "#EAF3DE",
    text: "#27500A",
    border: "#A8D575",
    pill: "#65A30D",
  },
  DIRECTOR: {
    bg: "#E1F5EE",
    text: "#085041",
    border: "#5DCAA5",
    pill: "#059669",
  },
  MANAGER: {
    bg: "#FEF3C7",
    text: "#92400E",
    border: "#FCD34D",
    pill: "#D97706",
  },
  SUPERVISOR: {
    bg: "#FFE4E6",
    text: "#9F1239",
    border: "#FCA5A5",
    pill: "#EF4444",
  },
  USER: {
    bg: "#F1F5F9",
    text: "#334155",
    border: "#CBD5E1",
    pill: "#64748B",
  },
}

function pretty(s: string) {
  return s.replaceAll("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GrantMatrixTable() {
  const { showToast } = useToast()
  const [draft, setDraft] = useState<GrantMatrix>({})
  const [savedMatrix, setSavedMatrix] = useState<GrantMatrix>({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<Role | "">("")
  const [hoveredAction, setHoveredAction] = useState<AdminAction | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [isSmall, setIsSmall] = useState(false)

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth <= 768)
      setIsSmall(window.innerWidth <= 480)
    }
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  // ── Load once from DB on mount ────────────────────────────
  const loadFromServer = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/permissions", { credentials: "include" })
      if (!res.ok) return
      const data = await res.json()
      const m: GrantMatrix = data.matrix ?? DEFAULT_GRANT_MATRIX
      // Deep-clone so draft and savedMatrix are independent objects
      setDraft(JSON.parse(JSON.stringify(m)))
      setSavedMatrix(JSON.parse(JSON.stringify(m)))
    } catch {
      const fallback = JSON.parse(JSON.stringify(DEFAULT_GRANT_MATRIX))
      setDraft(fallback)
      setSavedMatrix(fallback)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    loadFromServer()
  }, [loadFromServer])

  // ── SSE — listen for changes made by other tabs/users ────
  useEffect(() => {
    if (!loaded) return
    const es = new EventSource("/api/admin/permissions/events")
    es.onmessage = (e) => {
      try {
        const { event, matrix: m } = JSON.parse(e.data)
        if (event === "updated" && m) {
          // Only update savedMatrix — never clobber the user's draft
          setSavedMatrix(JSON.parse(JSON.stringify(m)))
        }
      } catch {
        /* ignore */
      }
    }
    es.onerror = () => setTimeout(loadFromServer, 5000)
    return () => es.close()
  }, [loaded, loadFromServer])

  // ── Toggle a single permission cell ──────────────────────
  function toggle(role: Role, action: AdminAction) {
    if (role === "SUPER_ADMIN") return // immutable
    setDraft((prev) => {
      const current: AdminAction[] = prev[role] ?? []
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
      const current: AdminAction[] = prev[role] ?? []
      const allGranted = ALL_ACTIONS.every((a) => current.includes(a))
      return {
        ...prev,
        [role]: allGranted ? [] : [...ALL_ACTIONS],
      }
    })
  }

  // ── Bulk row toggle (grant / revoke an action for all non-locked roles) ───
  function toggleRow(action: AdminAction) {
    setDraft((prev) => {
      const editableRoles = ROLES.filter((r) => r !== "SUPER_ADMIN")
      const allGranted = editableRoles.every((r) => (prev[r] ?? []).includes(action))
      const next = { ...prev }
      for (const r of editableRoles) {
        const cur: AdminAction[] = next[r] ?? []
        next[r] = allGranted
          ? cur.filter((a) => a !== action)
          : [...new Set([...cur, action])]
      }
      return next
    })
  }

  // ── Save to DB ────────────────────────────────────────────
  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // Send the matrix directly — the API accepts either shape
        body: JSON.stringify(draft),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || "Save failed", "error")
        return
      }
      // Update savedMatrix to the confirmed server state
      // (server may have enforced SUPER_ADMIN immutability)
      const confirmed: GrantMatrix = data.matrix ?? draft
      setSavedMatrix(JSON.parse(JSON.stringify(confirmed)))
      // Also sync draft to exactly what server saved
      setDraft(JSON.parse(JSON.stringify(confirmed)))
      showToast("Permissions saved — live across all sessions", "success")
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

  // ── Derived state ─────────────────────────────────────────
  const dirty = useMemo(() => {
    for (const role of ROLES) {
      const draftActions = [...(draft[role] ?? [])].sort().join(",")
      const savedActions = [...(savedMatrix[role] ?? [])].sort().join(",")
      if (draftActions !== savedActions) return true
    }
    return false
  }, [draft, savedMatrix])

  const visibleRoles = roleFilter ? ([roleFilter] as Role[]) : [...ROLES]

  const filteredGroups = useMemo(() => {
    if (!search) return ACTION_GROUPS
    const q = search.toLowerCase()
    const result: Record<string, AdminAction[]> = {}
    for (const [group, actions] of Object.entries(ACTION_GROUPS)) {
      const matches = actions.filter(
        (a) => a.includes(q) || group.toLowerCase().includes(q)
      )
      if (matches.length) result[group] = matches
    }
    return result
  }, [search])

  const roleCounts = useMemo(
    () =>
      ROLES.map((r) => ({
        role: r,
        count: draft[r]?.length ?? 0,
        pct: Math.round(((draft[r]?.length ?? 0) / TOTAL_ACTIONS) * 100),
      })),
    [draft]
  )

  if (!loaded) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 300,
          color: "#94a3b8",
          fontSize: 13,
        }}
      >
        Loading permissions…
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  // Responsive style values — direct inline, no CSS classes
  const S = {
    roleMin: isSmall ? 42 : isMobile ? 52 : 90,
    labelMin: isSmall ? 80 : isMobile ? 100 : 220,
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
    <div
      className="gm-wrapper"
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        overflow: "visible",
        fontFamily: "system-ui, sans-serif",
        fontSize: "var(--gm-font, 13px)",
      }}
    >
      <style>{``}</style>
      {/* ── HEADER ── */}
      <div
        className="gm-header-row"
        style={{
          padding: "12px var(--gm-pad-x, 20px)",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="gm-title-line" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: "var(--gm-h2, 17px)", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>
              Permission Matrix
            </h2>
            {dirty ? (
              <span style={{ color: "#d97706", fontWeight: 600, fontSize: "var(--gm-font-xs, 11px)" }}>Unsaved changes</span>
            ) : (
              <span style={{ color: "#16a34a", fontWeight: 600, fontSize: "var(--gm-font-xs, 11px)" }}>All saved</span>
            )}
          </div>
          <p className="gm-desc" style={{ margin: "3px 0 0", fontSize: "var(--gm-font-sm, 12px)", color: "#64748b" }}>
            Click a cell to toggle · click a role header to grant/revoke all · click a row box to toggle all roles.
          </p>
        </div>

        <div
          className="gm-controls"
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search permissions…"
            style={{
              padding: "6px 10px",
              fontSize: "var(--gm-font-sm, 12px)",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              width: "var(--gm-search-w, 200px)",
              maxWidth: "100%",
              outline: "none",
            }}
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "")}
            style={{
              padding: "6px 10px",
              fontSize: "var(--gm-font-sm, 12px)",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              background: "#fff",
            }}
          >
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── ROLE SUMMARY BAR ── */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "10px var(--gm-pad-x, 20px)",
          borderBottom: "1px solid #f1f5f9",
          overflowX: "auto",
          // When a role is filtered, center the single pill
          justifyContent: roleFilter ? "center" : "flex-start",
        }}
      >
        {roleCounts
          .filter((rc) => !roleFilter || rc.role === roleFilter)
          .map(({ role, count, pct }) => {
            const c = ROLE_COLORS[role as Role]
            const isActive = roleFilter === role
            return (
              <div
                key={role}
                onClick={() =>
                  setRoleFilter((prev) => (prev === role ? "" : (role as Role)))
                }
                style={{
                  flexShrink: 0,
                  padding: "7px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: isActive ? c.bg : "#f8fafc",
                  border: `1px solid ${isActive ? c.border : "#e2e8f0"}`,
                  transition: "all .15s",
                  minWidth: "var(--gm-pill-min, 110px)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: c.text,
                    letterSpacing: ".05em",
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: c.pill,
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  {role}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 4,
                      background: "#e2e8f0",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: c.pill,
                        borderRadius: 2,
                        transition: "width .3s",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 10, color: "#64748b", whiteSpace: "nowrap" }}>
                    {count}/{TOTAL_ACTIONS}
                  </span>
                </div>
              </div>
            )
          })}
      </div>

      {/* ── MATRIX TABLE ── */}
      <div
        style={{
          overflow: "auto",
          maxHeight: isMobile ? "calc(100vh - 220px)" : "calc(100vh - 260px)",
          WebkitOverflowScrolling: "touch",
          position: "relative",
        }}
      >
        <table style={{ width: isMobile ? "max-content" : "100%", minWidth: "100%", borderCollapse: "collapse", fontSize: isMobile ? 11 : 12 }}>
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              {/* Permission label column */}
              <th
                style={{
                  padding: S.labelPad,
                  textAlign: "left",
                  background: "#f8fafc",
                  borderBottom: "2px solid #e2e8f0",
                  position: "sticky",
                  top: 0,
                  left: 0,
                  zIndex: 30,
                  minWidth: S.labelMin,
                  height: S.theadH,
                }}
              >
                Permission
              </th>

              {visibleRoles.map((role) => {
                const c = ROLE_COLORS[role as Role]
                const isLocked = role === "SUPER_ADMIN"
                const cur: AdminAction[] = draft[role] ?? []
                const allGiven = ALL_ACTIONS.every((a) => cur.includes(a))
                return (
                  <th
                    key={role}
                    style={{
                      padding: S.thPad,
                      textAlign: "center",
                      background: "#f8fafc",
                      borderBottom: "2px solid #e2e8f0",
                      whiteSpace: "nowrap",
                      width: roleFilter ? "100%" : `${Math.floor(100 / ROLES.length)}%`,
                      minWidth: S.roleMin,
                      height: S.theadH,
                      position: "sticky",
                      top: 0,
                      zIndex: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span
                        className="gm-role-badge"
                        style={{
                          fontSize: S.roleBadgeFont,
                          fontWeight: 700,
                          padding: S.roleBadgePad,
                          borderRadius: 5,
                          background: c.bg,
                          color: c.text,
                          border: `1px solid ${c.border}`,
                          letterSpacing: ".04em",
                        }}
                      >
                        {role}
                      </span>
                      {isLocked ? (
                        <span style={{ fontSize: S.grantFont, color: "#94a3b8" }}>locked</span>
                      ) : (
                        <button
                          onClick={() => toggleAll(role as Role)}
                          title={allGiven ? "Revoke all" : "Grant all"}
                          style={{
                            fontSize: S.grantFont,
                            padding: S.grantPad,
                            borderRadius: 3,
                            border: `1px solid ${c.border}`,
                            background: allGiven ? c.bg : "#fff",
                            color: allGiven ? c.text : "#94a3b8",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
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
            {Object.entries(filteredGroups).map(([group, actions]) => (
              <Fragment key={group}>
                {/* Group header row — full width, text always visible */}
                <tr className="gm-group-row">
                  <td
                    colSpan={visibleRoles.length + 1}
                    style={{
                      padding: "8px 14px",
                      background: "#f8fafc",
                      fontSize: isMobile ? 9 : 10,
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: ".08em",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    {group}
                  </td>
                </tr>

                {/* Action rows */}
                {actions.map((action) => {
                  const editableRoles = ROLES.filter((r) => r !== "SUPER_ADMIN")
                  const allRowGranted = editableRoles.every((r) =>
                    (draft[r] ?? []).includes(action)
                  )
                  const isHover = hoveredAction === action
                  return (
                  <tr
                    key={action}
                    style={{ borderBottom: "1px solid #f9fafb" }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLElement).style.background = "#fafbfc"
                      setHoveredAction(action)
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLElement).style.background = ""
                      setHoveredAction(null)
                    }}
                  >
                    {/* Permission name */}
                    <td
                      style={{
                        padding: "var(--gm-row-pad, 9px) 14px",
                        position: "sticky",
                        left: 0,
                        background: "#fff",
                        zIndex: 2,
                        borderBottom: "1px solid #f1f5f9",
                        maxWidth: 260,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                        <button
                          onClick={() => toggleRow(action)}
                          title={
                            allRowGranted
                              ? "Revoke from all editable roles"
                              : "Grant to all editable roles"
                          }
                          style={{
                            marginTop: 1,
                            width: 14,
                            height: 14,
                            borderRadius: 3,
                            border: "1px solid #cbd5e1",
                            background: allRowGranted ? "#f1f5f9" : "#fff",
                            cursor: "pointer",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                          }}
                        >
                          <span style={{ fontSize: 8, color: "#94a3b8", fontWeight: 700 }}>
                            {allRowGranted ? "▣" : "□"}
                          </span>
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: "#334155", fontWeight: 500, fontSize: "var(--gm-font-sm, 12px)" }}>
                            {pretty(action)}
                          </div>
                          <span
                            style={{
                              fontSize: "var(--gm-font-xs, 10px)",
                              color: "#cbd5e1",
                              fontFamily: "monospace",
                            }}
                          >
                            {action}
                          </span>
                          {isHover && (
                            <div
                              style={{
                                marginTop: 3,
                                fontSize: "var(--gm-font-xs, 10px)",
                                color: "#64748b",
                                fontStyle: "italic",
                                lineHeight: 1.4,
                              }}
                            >
                              {ADMIN_ACTION_DESC[action]}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Role cells */}
                    {visibleRoles.map((role) => {
                      const granted = draft[role]?.includes(action) ?? false
                      const locked = role === "SUPER_ADMIN"
                      const c = ROLE_COLORS[role as Role]

                      // Highlight cells that differ from what's saved in DB
                      const savedGranted =
                        savedMatrix[role]?.includes(action) ?? false
                      const unsaved = granted !== savedGranted

  // Responsive style values — direct inline, no CSS classes
  const S = {
    roleMin: isSmall ? 42 : isMobile ? 52 : 90,
    labelMin: isSmall ? 80 : isMobile ? 100 : 220,
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
                        <td
                          key={role}
                          style={{
                            padding: 6,
                            // ← Always center-align cell content
                            textAlign: "center",
                            borderBottom: "1px solid #f1f5f9",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <button
                              onClick={() =>
                                !locked && toggle(role as Role, action)
                              }
                              title={
                                locked
                                  ? "SUPER_ADMIN permissions are immutable"
                                  : granted
                                  ? "Click to revoke"
                                  : "Click to grant"
                              }
                              style={{
                                width: S.cellSize,
                                height: S.cellSize,
                                borderRadius: 7,
                                border: `1.5px solid ${
                                  unsaved
                                    ? "#f59e0b"
                                    : granted
                                    ? c.border
                                    : "#e2e8f0"
                                }`,
                                background: unsaved
                                  ? "#fef3c7"
                                  : granted
                                  ? c.bg
                                  : "#fff",
                                color: unsaved
                                  ? "#92400e"
                                  : granted
                                  ? c.text
                                  : "#cbd5e1",
                                cursor: locked ? "default" : "pointer",
                                fontWeight: 700,
                                fontSize: S.cellFont,
                                transition: "all .12s",
                                opacity: locked ? 0.5 : 1,
                                outline: "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
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
            ))}
          </tbody>
        </table>
      </div>

      {/* ── FOOTER ── */}
      <div
        style={{
          padding: "12px var(--gm-pad-x, 20px)",
          borderTop: "1px solid #e2e8f0",
          background: "#fafafa",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "var(--gm-font-xs, 11px)", color: "#94a3b8" }}>
          {Object.values(draft).reduce((s, p) => s + p.length, 0)} total grants
          {dirty && (
            <span style={{ color: "#d97706", marginLeft: 8 }}>
              · unsaved changes
            </span>
          )}
        </span>

        <div style={{ display: "flex", gap: 8 }}>
          {dirty && (
            <button
              onClick={discard}
              style={{
                padding: "7px 14px",
                fontSize: "var(--gm-font-sm, 12px)",
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                background: "#fff",
                color: "#64748b",
                cursor: "pointer",
              }}
            >
              Discard
            </button>
          )}
          <button
            onClick={save}
            disabled={saving || !dirty}
            style={{
              padding: "7px 16px",
              fontSize: "var(--gm-font-sm, 12px)",
              fontWeight: 600,
              borderRadius: 6,
              border: "none",
              cursor: saving || !dirty ? "not-allowed" : "pointer",
              background: dirty ? "#2563eb" : "#e2e8f0",
              color: dirty ? "#fff" : "#94a3b8",
              transition: "all .15s",
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
