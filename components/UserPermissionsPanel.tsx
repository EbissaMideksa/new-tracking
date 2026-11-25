// components/UserPermissionsPanel.tsx
// ──────────────────────────────────────────────────────────────────────────
// Accounts Management panel: pick a user on the left, edit their personal
// permission overrides on the right.
//
// v4 — single consolidated box per matrix (Admin / Work Order) showing every
// EFFECTIVELY GRANTED permission as a removable chip. Effective = role
// default OR personal override, via lib/effectivePermissions.effectiveState,
// so role-matrix changes made on the Permissions / WO-Permissions pages are
// reflected here immediately.
//
// Interaction:
//   • Chip's × click:
//       - if the grant came from an explicit personal override → clear it
//         (falls back to whatever the role says)
//       - if the grant is inherited from the role → add an explicit REVOKE
//         override for this user (role stays unchanged for everyone else)
//   • Always-visible search box: typing live-filters a dropdown of every
//     action NOT currently effectively granted; picking one adds an
//     explicit GRANT override for this user, merging into the same chip
//     list above.
//   • "Unsaved changes" list is DERIVED (diffed draft vs. last-saved state),
//     not an append-only log — so undoing a change (e.g. revoking something
//     you just granted in this session) makes its line disappear on its
//     own, with nothing to separately clean up.
//   • edits are local-only (draft) until Save.
//   • SUPER_ADMIN users are shown as locked — no overrides possible.
// ──────────────────────────────────────────────────────────────────────────

"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useToast } from "@/components/ToastProvider"
import { usePermissions } from "@/context/PermissionsContext"
import { useWoPermissions } from "@/context/WoPermissionsContext"
import { effectiveState, type EffectiveActionState } from "@/lib/effectivePermissions"
import { WO_ACTION_GROUPS, WO_ACTION_LABELS, WO_ACTION_DESC } from "@/lib/workOrderGrants"
import { ADMIN_ACTION_DESC } from "@/lib/adminGrants"

// Mirrors the ACTION_GROUPS defined locally inside GrantMatrixTable.tsx —
// lib/adminGrants.ts doesn't currently export a groups constant, so this is
// kept in sync by hand. If you later export ADMIN_ACTION_GROUPS from
// lib/adminGrants.ts, swap this out for that import.
const ADMIN_ACTION_GROUPS: Record<string, string[]> = {
  "User Management": ["manage_users", "grant_admin"],
  Assets: ["assets_page", "upload_assets", "assign_assets", "edit_asset_tags", "export_assets", "view_all_assets"],
  "Work Orders": ["view_work_orders", "manage_work_orders"],
  "Analytics & Audit": ["view_analytics", "view_audit", "export_audit"],
  Organization: ["org_hierarchy_manage"],
  System: ["manage_org_units", "manage_permissions", "manage_wo_permissions", "system_settings"],
}

function pretty(s: string) {
  return s.replaceAll("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())
}

type UserRow = {
  id: string
  name: string | null
  email: string | null
  role: string
  /** Present so the picker can show which org unit each account sits in. */
  orgUnit?: { id: string; name: string } | null
}

/** What boundary the server applied when listing accounts. */
type ListScope =
  | { systemWide: true; orgUnitName: string | null }
  | { systemWide: false; orgUnitName: string | null; orgUnitPath: string | null }
type Override = { granted: string[]; revoked: string[] }
type OverridesBundle = { admin: Override; wo: Override }

function emptyBundle(): OverridesBundle {
  return { admin: { granted: [], revoked: [] }, wo: { granted: [], revoked: [] } }
}

// What a chip's × should do, precomputed per action.
type ChipInfo = {
  action: string
  label: string
  desc?: string
  source: "override" | "role" // "override" = explicit grant for this user; "role" = inherited from role default
}

function allActions(groups: Record<string, string[]>): string[] {
  return Object.values(groups).flat()
}

// Explicit-grant / explicit-revoke / clear-back-to-inherited helpers.
function withGrant(o: Override, action: string): Override {
  return { granted: [...o.granted.filter((a) => a !== action), action], revoked: o.revoked.filter((a) => a !== action) }
}
function withRevoke(o: Override, action: string): Override {
  return { granted: o.granted.filter((a) => a !== action), revoked: [...o.revoked.filter((a) => a !== action), action] }
}
function withCleared(o: Override, action: string): Override {
  return { granted: o.granted.filter((a) => a !== action), revoked: o.revoked.filter((a) => a !== action) }
}

const SOURCE_STYLE = {
  role:     { dot: "#94A3B8", label: "From role" },
  override: { dot: "#7C3AED", label: "Personal grant" },
}

// A single pending (unsaved) change, derived by diffing draft vs saved —
// NOT an append-only log. Toggling something back to its saved state makes
// it vanish from this list automatically, since it's recomputed each render.
type DraftChange = { action: string; label: string; kind: "grant" | "revoke" | "clear" }

function diffOverride(
  saved: Override,
  draft: Override,
  groups: Record<string, string[]>,
  labels?: Record<string, string>,
): DraftChange[] {
  const label = (a: string) => labels?.[a] ?? pretty(a)
  const out: DraftChange[] = []
  const allowed = new Set(allActions(groups))
  for (const a of draft.granted) {
    if (!allowed.has(a)) continue
    if (!saved.granted.includes(a)) out.push({ action: a, label: label(a), kind: "grant" })
  }
  for (const a of draft.revoked) {
    if (!allowed.has(a)) continue
    if (!saved.revoked.includes(a)) out.push({ action: a, label: label(a), kind: "revoke" })
  }
  // was overridden (granted or revoked) in saved, now cleared back to inherited in draft
  for (const a of [...saved.granted, ...saved.revoked]) {
    if (!allowed.has(a)) continue
    if (!draft.granted.includes(a) && !draft.revoked.includes(a)) out.push({ action: a, label: label(a), kind: "clear" })
  }
  return out
}

export default function UserPermissionsPanel() {
  const { showToast } = useToast()
  const { matrix: adminMatrix } = usePermissions()
  const { matrix: woMatrix } = useWoPermissions()

  const [users, setUsers] = useState<UserRow[]>([])
  const [scope, setScope] = useState<ListScope | null>(null)
  const [canManageAdmin, setCanManageAdmin] = useState(false)
  const [canManageWo, setCanManageWo] = useState(false)
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [search, setSearch] = useState("")

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [draft, setDraft] = useState<OverridesBundle>(emptyBundle())
  const [saved, setSaved] = useState<OverridesBundle>(emptyBundle())
  const [detailLoaded, setDetailLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Load user list ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/users", { credentials: "include" })
        if (!res.ok) return
        const data = await res.json()
        setUsers(data.users ?? [])
        setScope(data.scope ?? null)
        setCanManageAdmin(!!data.canManageAdmin)
        setCanManageWo(!!data.canManageWo)
      } finally {
        setUsersLoaded(true)
      }
    })()
  }, [])

  // ── Load overrides for the selected user ────────────────────────────────
  const loadDetail = useCallback(
    async (userId: string) => {
      setDetailLoaded(false)
      try {
        const res = await fetch(`/api/admin/user-permissions?userId=${encodeURIComponent(userId)}`, {
          credentials: "include",
        })
        if (!res.ok) {
          showToast("Failed to load permissions for this user", "error")
          return
        }
        const data = await res.json()
        setSelectedRole(data.user.role)
        const bundle: OverridesBundle = data.overrides ?? emptyBundle()
        setDraft(JSON.parse(JSON.stringify(bundle)))
        setSaved(JSON.parse(JSON.stringify(bundle)))
      } finally {
        setDetailLoaded(true)
      }
    },
    [showToast],
  )

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
  }, [selectedId, loadDetail])

  // ── Live updates from other sessions (personal override changes) ──────────
  useEffect(() => {
    const es = new EventSource("/api/admin/user-permissions/events")
    es.onmessage = (e) => {
      try {
        const { event, userId, overrides } = JSON.parse(e.data)
        if (event === "updated" && userId && userId === selectedId && overrides) {
          setSaved(JSON.parse(JSON.stringify(overrides)))
        }
      } catch {
        /* ignore */
      }
    }
    return () => es.close()
  }, [selectedId])

  // Role-matrix changes (Permissions / WO-Permissions pages) arrive for free
  // via adminMatrix / woMatrix from context — no extra fetch/SSE needed here.

  const dirty = useMemo(() => {
    const key = (o: Override) => JSON.stringify({ g: [...o.granted].sort(), r: [...o.revoked].sort() })
    return key(draft.admin) !== key(saved.admin) || key(draft.wo) !== key(saved.wo)
  }, [draft, saved])

  function grant(kind: "admin" | "wo", action: string) {
    const editable = kind === "admin" ? canManageAdmin : canManageWo
    if (!editable || selectedRole === "SUPER_ADMIN") return
    setDraft((prev) => ({ ...prev, [kind]: withGrant(prev[kind], action) }))
  }

  function revoke(kind: "admin" | "wo", action: string, source: "override" | "role") {
    const editable = kind === "admin" ? canManageAdmin : canManageWo
    if (!editable || selectedRole === "SUPER_ADMIN") return
    setDraft((prev) => ({
      ...prev,
      [kind]: source === "override" ? withCleared(prev[kind], action) : withRevoke(prev[kind], action),
    }))
  }

  function clearOverride(kind: "admin" | "wo", action: string) {
    const editable = kind === "admin" ? canManageAdmin : canManageWo
    if (!editable || selectedRole === "SUPER_ADMIN") return
    setDraft((prev) => ({ ...prev, [kind]: withCleared(prev[kind], action) }))
  }

  // Used by the "Undo" button in the unsaved-changes list — restores this
  // ONE action to exactly what it was in `saved`, not just to "inherited".
  // A blanket clear would be wrong if `saved` had it explicitly revoked
  // (not merely absent) — undo must reproduce that, not erase it.
  function restoreToSaved(kind: "admin" | "wo", action: string) {
    const editable = kind === "admin" ? canManageAdmin : canManageWo
    if (!editable || selectedRole === "SUPER_ADMIN") return
    setDraft((prev) => {
      const savedO = saved[kind]
      let next: Override
      if (savedO.granted.includes(action)) next = withGrant(prev[kind], action)
      else if (savedO.revoked.includes(action)) next = withRevoke(prev[kind], action)
      else next = withCleared(prev[kind], action)
      return { ...prev, [kind]: next }
    })
  }

  async function save() {
    if (!selectedId) return
    setSaving(true)
    try {
      const body: { userId: string; admin?: Override; wo?: Override } = { userId: selectedId }
      if (canManageAdmin) body.admin = draft.admin
      if (canManageWo) body.wo = draft.wo

      const res = await fetch("/api/admin/user-permissions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || "Save failed", "error")
        return
      }
      setSaved(JSON.parse(JSON.stringify(data.overrides)))
      setDraft(JSON.parse(JSON.stringify(data.overrides)))
      showToast("Permissions updated for this user", "success")
    } catch (e: any) {
      showToast(e.message || "Save failed", "error")
    } finally {
      setSaving(false)
    }
  }

  function discard() {
    setDraft(JSON.parse(JSON.stringify(saved)))
    showToast("Changes discarded", "info")
  }

  const filteredUsers = useMemo(() => {
    if (!search) return users
    const q = search.toLowerCase()
    return users.filter(
      (u) =>
        (u.name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    )
  }, [users, search])

  const selectedUser = users.find((u) => u.id === selectedId) ?? null

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* ── USER PICKER ── */}
      <div style={{ width: 280, flexShrink: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #e2e8f0" }}>
          {/* States the boundary the server applied. Without this a regional
              approver sees a shorter list with no indication that the accounts
              are hidden by design rather than missing. */}
          {scope && (
            <div style={{
              fontSize: 10, color: scope.systemWide ? "#64748b" : "#92400e",
              background: scope.systemWide ? "#f1f5f9" : "#fef3c7",
              border: `1px solid ${scope.systemWide ? "#e2e8f0" : "#fde68a"}`,
              borderRadius: 4, padding: "3px 7px", marginBottom: 8, lineHeight: 1.45,
            }}>
              {scope.systemWide
                ? "All accounts system-wide"
                : `Your jurisdiction: ${scope.orgUnitName ?? "your org unit"} and below (${users.length} account${users.length === 1 ? "" : "s"})`}
            </div>
          )}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            style={{ width: "100%", padding: "6px 10px", fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 6, outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ maxHeight: 520, overflowY: "auto" }}>
          {!usersLoaded && <div style={{ padding: 16, fontSize: 12, color: "#94a3b8" }}>Loading users…</div>}
          {usersLoaded && filteredUsers.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: "#94a3b8" }}>No users found.</div>
          )}
          {filteredUsers.map((u) => {
            const active = u.id === selectedId
            return (
              <button
                key={u.id}
                onClick={() => setSelectedId(u.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 12px",
                  border: "none",
                  borderBottom: "1px solid #f1f5f9",
                  cursor: "pointer",
                  background: active ? "#EEEDFE" : "#fff",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{u.name || u.email || u.id}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
                  <span style={{ padding: "1px 6px", borderRadius: 4, background: "#f1f5f9", fontWeight: 600, fontSize: 10, flexShrink: 0 }}>
                    {u.role}
                  </span>
                </div>
                {u.orgUnit?.name && (
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    🏢 {u.orgUnit.name}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── PERMISSION BOXES ── */}
      <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 16 }}>
        {!selectedId && (
          <div style={{ background: "#fff", border: "1px dashed #e2e8f0", borderRadius: 12, padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            Select a user on the left to view and edit their permissions.
          </div>
        )}

        {selectedId && !detailLoaded && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            Loading permissions…
          </div>
        )}

        {selectedId && detailLoaded && selectedUser && (
          <>
            <div
              style={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: "14px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{selectedUser.name || selectedUser.email}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {selectedUser.email} · role: <strong>{selectedUser.role}</strong>
                  {selectedRole === "SUPER_ADMIN" && <span style={{ color: "#94a3b8" }}> — permissions are immutable</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {dirty && (
                  <button
                    onClick={discard}
                    style={{ padding: "7px 14px", fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer" }}
                  >
                    Discard
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={saving || !dirty || selectedRole === "SUPER_ADMIN"}
                  style={{
                    padding: "7px 18px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 6,
                    border: "none",
                    cursor: saving || !dirty || selectedRole === "SUPER_ADMIN" ? "not-allowed" : "pointer",
                    background: dirty ? "#7C3AED" : "#e2e8f0",
                    color: dirty ? "#fff" : "#94a3b8",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>

            {selectedRole === "SUPER_ADMIN" ? (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                SUPER_ADMIN permissions are locked at the role level and can't be overridden per-user.
              </div>
            ) : (
              <>
                <PermissionBox
                  title="Admin Permissions"
                  editable={canManageAdmin}
                  groups={ADMIN_ACTION_GROUPS}
                  descriptions={ADMIN_ACTION_DESC as Record<string, string>}
                  matrix={adminMatrix as Record<string, string[]>}
                  role={selectedRole!}
                  override={draft.admin}
                  savedOverride={saved.admin}
                  onGrant={(action) => grant("admin", action)}
                  onRevoke={(action, source) => revoke("admin", action, source)}
                  onClear={(action) => restoreToSaved("admin", action)}
                />
                <PermissionBox
                  title="Work Order Permissions"
                  editable={canManageWo}
                  groups={WO_ACTION_GROUPS}
                  labels={WO_ACTION_LABELS as Record<string, string>}
                  descriptions={WO_ACTION_DESC as Record<string, string>}
                  matrix={(woMatrix ?? {}) as Record<string, string[]>}
                  role={selectedRole!}
                  override={draft.wo}
                  savedOverride={saved.wo}
                  onGrant={(action) => grant("wo", action)}
                  onRevoke={(action, source) => revoke("wo", action, source)}
                  onClear={(action) => restoreToSaved("wo", action)}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Single consolidated box: every effectively-granted action as a
//    removable chip, a live search box to add more, and an auto-clearing
//    "unsaved changes" list ─────────────────────────────────────────────────

function PermissionBox({
  title,
  editable,
  groups,
  labels,
  descriptions,
  matrix,
  role,
  override,
  savedOverride,
  onGrant,
  onRevoke,
  onClear,
}: {
  title: string
  editable: boolean
  groups: Record<string, string[]>
  labels?: Record<string, string>
  descriptions?: Record<string, string>
  matrix: Record<string, string[]>
  role: string
  override: Override
  savedOverride: Override
  onGrant: (action: string) => void
  onRevoke: (action: string, source: "override" | "role") => void
  onClear: (action: string) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState("")
  const pickerRef = useRef<HTMLDivElement>(null)

  const actions = useMemo(() => allActions(groups), [groups])

  const chips = useMemo<ChipInfo[]>(() => {
    return actions
      .map((action): ChipInfo | null => {
        const state = effectiveState(matrix, role, action, override) as EffectiveActionState
        const isGranted = state === "granted" || state === "inherited-granted"
        if (!isGranted) return null
        return {
          action,
          label: labels?.[action] ?? pretty(action),
          desc: descriptions?.[action],
          source: state === "granted" ? "override" : "role",
        }
      })
      .filter((c): c is ChipInfo => c !== null)
  }, [actions, matrix, role, override, labels, descriptions])

  const grantedSet = useMemo(() => new Set(chips.map((c) => c.action)), [chips])
  const available = useMemo(
    () =>
      actions.filter(
        (a) => !grantedSet.has(a) && (labels?.[a] ?? pretty(a)).toLowerCase().includes(pickerQuery.toLowerCase()),
      ),
    [actions, grantedSet, pickerQuery, labels],
  )

  const changes = useMemo(() => diffOverride(savedOverride, override, groups, labels), [savedOverride, override, groups, labels])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{title}</span>
        {!editable && <span style={{ fontSize: 11, color: "#94a3b8" }}>View only — you lack the grant to edit this</span>}
      </div>

      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* ── Granted chips ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {chips.length === 0 && (
            <span style={{ fontSize: 12, color: "#94a3b8" }}>No permissions currently granted.</span>
          )}
          {chips.map((c) => {
            const s = SOURCE_STYLE[c.source]
            return (
              <span
                key={c.action}
                title={c.desc ? `${c.desc} — ${s.label}` : s.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 8px 6px 10px",
                  borderRadius: 999,
                  border: "1.5px solid #DCFCE7",
                  background: "#F0FDF4",
                  color: "#166534",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
                {c.label}
                {editable && (
                  <button
                    onClick={() => onRevoke(c.action, c.source)}
                    aria-label={`Revoke ${c.label}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: "none",
                      background: "#DCFCE7",
                      color: "#166534",
                      cursor: "pointer",
                      fontSize: 11,
                      lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            )
          })}
        </div>

        {/* ── Search + live suggestions ── */}
        {editable && (
          <div ref={pickerRef} style={{ position: "relative" }}>
            <input
              value={pickerQuery}
              onChange={(e) => {
                setPickerQuery(e.target.value)
                setPickerOpen(true)
              }}
              onFocus={() => setPickerOpen(true)}
              placeholder="Type to search permissions…"
              style={{ width: "100%", padding: "8px 12px", fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 8, outline: "none", boxSizing: "border-box" }}
            />

            {pickerOpen && pickerQuery.trim().length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  width: "100%",
                  maxHeight: 280,
                  overflowY: "auto",
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  boxShadow: "0 10px 30px rgba(0,0,0,.12)",
                  zIndex: 20,
                }}
              >
                {available.length === 0 ? (
                  <div style={{ padding: 14, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>No matching permissions.</div>
                ) : (
                  available.map((action) => (
                    <button
                      key={action}
                      onClick={() => {
                        onGrant(action)
                        setPickerQuery("")
                        setPickerOpen(false)
                      }}
                      title={descriptions?.[action]}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 12px",
                        border: "none",
                        background: "#fff",
                        cursor: "pointer",
                        fontSize: 12,
                        color: "#0f172a",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#f8fafc")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#fff")}
                    >
                      {labels?.[action] ?? pretty(action)}
                      {descriptions?.[action] && (
                        <span style={{ display: "block", fontSize: 10, color: "#94a3b8", marginTop: 1 }}>{descriptions[action]}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Unsaved changes (derived diff — auto-clears on undo) ── */}
        <RecentChanges changes={changes} editable={editable} onUndo={onClear} />

        {/* ── Legend ── */}
        <div style={{ display: "flex", gap: 14, fontSize: 10, color: "#94a3b8", paddingTop: 2 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: SOURCE_STYLE.role.dot }} /> From role default
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: SOURCE_STYLE.override.dot }} /> Personal grant/revoke
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Derived list of this session's unsaved changes for one matrix.
//    Recomputed from draft vs saved on every render — undoing a change
//    (toggling the action back to its saved state) removes its line here
//    automatically, nothing to separately track or clean up. ────────────────

function RecentChanges({
  changes,
  editable,
  onUndo,
}: {
  changes: DraftChange[]
  editable: boolean
  onUndo: (action: string) => void
}) {
  if (changes.length === 0) return null

  const STYLE: Record<DraftChange["kind"], { bg: string; text: string; border: string; verb: string }> = {
    grant:  { bg: "#F0FDF4", text: "#166534", border: "#DCFCE7", verb: "Granted" },
    revoke: { bg: "#FEF2F2", text: "#991B1B", border: "#FEE2E2", verb: "Revoked" },
    clear:  { bg: "#F8FAFC", text: "#64748B", border: "#E2E8F0", verb: "Reset to role default" },
  }

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
        Unsaved changes
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {changes.map((c) => {
          const s = STYLE[c.kind]
          return (
            <div
              key={c.action}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "5px 10px",
                borderRadius: 6,
                background: s.bg,
                border: `1px solid ${s.border}`,
                fontSize: 11,
              }}
            >
              <span style={{ color: s.text }}>
                <strong>{s.verb}</strong> — {c.label}
              </span>
              {editable && (
                <button
                  onClick={() => onUndo(c.action)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: s.text, fontSize: 11, textDecoration: "underline", padding: 0 }}
                >
                  Undo
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

