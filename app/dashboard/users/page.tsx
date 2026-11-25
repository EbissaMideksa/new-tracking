
// app/dashboard/users/page.tsx
"use client"

import { useEffect, useState, useRef, useMemo, Fragment, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ToastProvider"
import { useConfirm } from "@/components/ConfirmProvider"
import AssignTreeSelector from "@/components/AssignTreeSelector"
import { useTree } from "@/components/useTree"
import { usePermissions } from "@/context/PermissionsContext"
import { usePermissionGuard } from "@/hooks/usePermissionGuard"
import { useLiveChannel } from "@/hooks/useLiveChannel"
import { fallbackRoleForType, ASSIGNABLE_TYPES } from "@/lib/orgStructure"
import { USER_STATUSES } from "@/lib/userStatus"
import UserDetailDrawer from "./_components/UserDetailDrawer"
import UserSeedDialog from "@/components/UserSeedDialog"
import OrgFilterBar, { type OrgLevel, type OrgFilterIds } from "@/components/OrgFilterBar"
import Modal from "@/components/Modal"
import {
  type User,
  type Visibility,
  type ColKey,
  type ColDef,
  type OrgNode,
  COLUMNS,
  STATUS_STYLES,
  buildAncestry,
  sectionFor,
  departmentFor,
  regionZoneSiteFor,
  statusOf,
  fmtDate,
  fmtDateTime,
  fmtRelative,
  defaultVisibility,
  loadVisibility,
  saveVisibility,
} from "./_components/userColumns"

// Customizable filter attributes. The admin first selects which of these to
// filter by; the matching controls then appear and the filter is applied.
const FILTER_ATTRS: { key: string; label: string }[] = [
  { key: "DIVISION",   label: "Division" },
  { key: "DEPARTMENT", label: "Department" },
  { key: "SECTION",    label: "Section" },
  { key: "ZONE",       label: "Zone/Region" },
  { key: "AREA",       label: "Area" },
  { key: "SITE",       label: "Site" },
  { key: "ROLE",       label: "Role" },
  { key: "STATUS",     label: "Status" },
  { key: "SEARCH",     label: "Search" },
]

const ORG_LEVELS = ["DIVISION", "DEPARTMENT", "SECTION", "ZONE", "AREA", "SITE"]

export default function UsersPage() {
  const router        = useRouter()
  const { tree }      = useTree()
  const { showToast } = useToast()
  const confirm = useConfirm()
  const { canSelf }       = usePermissions()

  const { ready, allowed, myRole } = usePermissionGuard("manage_users")
  const canGrantAdmin = ready && myRole ? canSelf("grant_admin") : false
  // Putting an account back on the built-in default password is SUPER_ADMIN's
  // privilege alone (mirrors the guard in PATCH /api/users/[id]).
  const canResetToDefault = ready && myRole === "SUPER_ADMIN"

  const [users,       setUsers]       = useState<User[]>([])
  const [activeView,  setActiveView]  = useState<"view" | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [saving,      setSaving]      = useState(false)
  // Org-structure filter (?<none>): when set, the table is narrowed to that
  // unit's subtree. The picker shows the users-per-unit counts for this page.
  const [orgFilter, setOrgFilter] = useState<OrgFilterIds>({})

  // ── Column visibility ──────────────────────────────────────────────────────
  // ~10 columns on by default; the rest live behind the toggle (and in the
  // detail drawer). Choices persist per browser.
  const [visible, setVisible] = useState<Visibility>(defaultVisibility)
  const [colsOpen, setColsOpen] = useState(false)

  // ── Filters ────────────────────────────────────────────────────────────────
  // Role and Status (plus the org-structure picker below) are the three ways
  // admins most often narrow this list.
  const [roleFilter,   setRoleFilter]   = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  // Customizable: which filter attributes are active. The admin selects the
  // attributes first; their controls appear and the filter is applied.
  const [enabledFilters, setEnabledFilters] = useState<Set<string>>(
    () => new Set(["DIVISION", "ROLE", "STATUS", "SEARCH"]),
  )

  const toggleFilter = (key: string) =>
    setEnabledFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const orgLevels = useMemo(
    () => ORG_LEVELS.filter((k) => enabledFilters.has(k)) as OrgLevel[],
    [enabledFilters],
  )

  // Deepest selected org node (used for the subtree match); the other selected
  // levels are ANDed separately in filteredUsers.
  const orgId =
    orgFilter.SITE || orgFilter.AREA || orgFilter.ZONE ||
    orgFilter.SECTION || orgFilter.DEPARTMENT || orgFilter.DIVISION || ""

  const clearAllFilters = () => {
    setOrgFilter({})
    setRoleFilter("")
    setStatusFilter("")
    setSearchQuery("")
  }

  // ── Detail drawer ──────────────────────────────────────────────────────────
  const [detailUser,  setDetailUser]  = useState<User | null>(null)

  // Hydrate the saved column choices after mount — localStorage does not
  // exist during the server render.
  useEffect(() => { setVisible(loadVisibility()) }, [])

  function toggleCol(key: ColKey) {
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      saveVisibility(next)
      return next
    })
  }

  // Id set of the subtree under every node of the org tree, keyed by node id,
  // so a parent unit keeps its sub-units' users (same contract the work orders
  // page uses for its org filter).
  const orgSubtreeIds = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    type Node = { id: string; children?: Node[] }
    function walk(n: Node): Set<string> {
      const ids = new Set<string>([n.id])
      for (const c of n.children ?? []) for (const id of walk(c)) ids.add(id)
      map[n.id] = ids
      return ids
    }
    if (tree) walk(tree)
    return map
  }, [tree])

  async function loadUsers() {
    const res = await fetch("/api/users")
    if (res.status === 403) {
      showToast("User management permission was revoked", "error")
      router.replace("/dashboard")
      return
    }
    if (!res.ok) return
    const data = await res.json()
    setUsers(Array.isArray(data) ? data : [])
  }

  useEffect(() => { if (activeView === "view") loadUsers() }, [activeView])

  // ── Live updates ─────────────────────────────────────────────────────────
  useLiveChannel<{ event: string; user?: User; userId?: string; count?: number }>(
    "/api/users/events",
    (payload) => {
      if (payload.event === "created" && payload.user) {
        setUsers((prev) =>
          prev.some((u) => u.id === payload.user!.id) ? prev : [...prev, payload.user!]
        )
      }
      if (payload.event === "updated" && payload.user) {
        setUsers((prev) =>
          prev.map((u) => u.id === payload.user!.id ? payload.user! : u)
        )
      }
      if (payload.event === "openWorkOrdersUpdated" && payload.userId) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === payload.userId
              ? { ...u, _count: { ...u._count, assignedWorkOrders: payload.count ?? (u._count?.assignedWorkOrders ?? 0) } }
              : u
          ) as User[])
      }
      if (payload.event === "deleted" && payload.userId) {
        setUsers((prev) => prev.filter((u) => u.id !== payload.userId))
      }
    }
  )
  // ────────────────────────────────────────────────────────────────────────

  // root → [root … node] for the user's org unit, driving the two DERIVED
  // columns (Section, Region / Zone / Site) and their drawer counterparts.
  const ancestry = useMemo(() => buildAncestry(tree), [tree])

  // The columns actually rendered, kept in COLUMNS order (Section right after
  // Department). Actions / Admin Access are appended in the markup.
  const cols = useMemo(() => COLUMNS.filter((c) => visible[c.key]), [visible])


  // Org filter — AND every selected level so a shared zone/area/site narrowed
  // by division/department doesn't leak users from other departments.
  const inSubtree = (nodeId: string | undefined, id: string | undefined | null) =>
    !!nodeId && !!id && !!orgSubtreeIds[nodeId]?.has(id)

  const matchesOrg = (u: User): boolean => {
    // Deepest org node (site/area/zone/section/dept/div).
    if (orgId) {
      const inOrg =
        inSubtree(orgId, u.orgUnit?.id) ||
        inSubtree(orgId, (u as any).functionalOrgUnitId) ||
        ((u as any).geoZoneId && (u as any).geoZoneId === orgId)
      if (!inOrg) return false
    }
    if (orgFilter.DIVISION) {
      const inDiv = inSubtree(orgFilter.DIVISION, u.department?.id) || inSubtree(orgFilter.DIVISION, u.orgUnit?.id)
      if (!inDiv) return false
    }
    if (orgFilter.DEPARTMENT) {
      const inDept =
        u.department?.id === orgFilter.DEPARTMENT ||
        inSubtree(orgFilter.DEPARTMENT, u.department?.id) ||
        inSubtree(orgFilter.DEPARTMENT, u.orgUnit?.id)
      if (!inDept) return false
    }
    return true
  }

  const filteredUsers = users.filter(
    (u) =>
      matchesOrg(u) &&
      // Role / Status / Search — only applied when their attribute is enabled.
      (!enabledFilters.has("ROLE") || !roleFilter || u.role === roleFilter) &&
      (!enabledFilters.has("STATUS") || !statusFilter || statusOf(u) === statusFilter) &&
      (!enabledFilters.has("SEARCH") || !searchQuery ||
        u?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u?.phone || "").includes(searchQuery))
  )

  // ── Form ──────────────────────────────────────────────────────────────────
  const [showModal,   setShowModal]   = useState(false)
  const [seedOpen,    setSeedOpen]    = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "", role: "", orgUnitId: "",
    // Directory attributes (blank = no value; POST/PUT normalise "" → null).
    employeeId: "", jobTitle: "", status: "ACTIVE", managerId: "",
    // Operational zone/region for field workers (blank = corporate worker).
    geoZoneId: "",
  })

  function resetForm() {
    setForm({
      name: "", email: "", phone: "", password: "", role: "", orgUnitId: "",
      employeeId: "", jobTitle: "", status: "ACTIVE", managerId: "",
      geoZoneId: "",
    })
  }

  function startEdit(u: User) {
    setEditingUser(u)
    setForm({
      name: u.name, email: u.email, phone: u.phone || "",
      password: "", role: u.role, orgUnitId: u.orgUnit?.id || "",
      employeeId: u.employeeId || "", jobTitle: u.jobTitle || "",
      status: statusOf(u), managerId: u.managerId || "",
      geoZoneId: (u as any).geoZoneId || "",
    })
    setDetailUser(null)
    setShowModal(true)
  }

  // Zone/Region options for the field-worker zone selector (from the org tree).
  const zoneOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: { id: string; label: string }[] = []
    const walk = (n: any) => {
      if (n?.type === "ZONE" || n?.type === "REGION") {
        const k = (n.code || n.name || "").toLowerCase()
        if (n?.id && !seen.has(k)) {
          seen.add(k)
          out.push({ id: n.id, label: n.code ? `${n.code} — ${n.name}` : n.name })
        }
      }
      for (const c of n?.children ?? []) walk(c)
    }
    if (tree) walk(tree)
    return out
  }, [tree])

  // ── Reports-To picker ─────────────────────────────────────────────────────
  // Options come from the loaded list (the table's own /api/users fetch);
  // "+ Add User" triggers that fetch on click for anyone who skipped the table.
  const managerOptions = useMemo(
    () =>
      users
        .filter((u) => u.id !== editingUser?.id)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users, editingUser],
  )

  function findNodeType(node: any, id: string): string | null {
    if (node?.id === id) return node.type
    for (const c of node?.children ?? []) {
      const f = findNodeType(c, id); if (f) return f
    }
    return null
  }

  const ALL_ROLES = ["SUPER_ADMIN","ADMIN","CHIEF","DIRECTOR","MANAGER","SUPERVISOR","USER"]

  function getRoleByType(type: string | null) {
    // Only tiers that actually have a head imply a role. COUNTRY and the
    // CATEGORY grouping tier ("Addis Ababa" / "Region") carry nobody, so the
    // current role is left untouched instead of being forced to USER.
    const headed = ["DIVISION", "DEPARTMENT", "CORPORATE", "ZONE", "REGION",
                    "SECTION", "AREA", "SITE", "GROUP"]
    if (!type || !headed.includes(type)) return ""
    // ZONE/REGION → DIRECTOR: that is where the operational director sits.
    return fallbackRoleForType(type)
  }

  async function saveUser() {
    if (saving) return
    if (!form.name || !form.email)      return showToast("Name and email required", "error")
    if (!form.orgUnitId)                return showToast("Select an org unit", "error")
    // A blank password is fine now: the account is provisioned on the built-in
    // default password and forced to change it at first login.

    setSaving(true)
    try {
      const url    = editingUser ? `/api/users/${editingUser.id}` : "/api/users"
      const method = editingUser ? "PUT" : "POST"
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      })
      const data = await res.json()

      if (res.status === 403) { showToast("Permission revoked", "error"); setShowModal(false); return }
      if (!res.ok)             { showToast(data.error || "Failed to save", "error"); return }

      const saved = data.user ?? data
      if (editingUser) {
        setUsers((p) => p.map((u) => u.id === saved.id ? saved : u))
        showToast("User updated!", "success")
      } else {
        setUsers((p) => [...p, saved])
        showToast("User created!", "success")
      }
      // SSE pushes this to all other open tabs automatically — no manual dispatch needed
      setShowModal(false)
      setEditingUser(null)
      setActiveView("view")
      resetForm()
    } finally { setSaving(false) }
  }

  async function deleteUser(id: string) {
    if (!(await confirm({ message: "Delete this user?", confirmLabel: "Delete user" }))) return
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" })
    if (res.status === 403) { showToast("Permission revoked", "error"); return }
    if (!res.ok)             { showToast("Failed to delete", "error"); return }
    setUsers((p) => p.filter((u) => u.id !== id))
    showToast("User deleted", "success")
  }

  async function toggleAdminAccess(u: User, grant: boolean) {
    const res = await fetch(`/api/users/${u.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ grantAdmin: grant }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      return showToast(d.error || "Failed", "error")
    }
    const updated = await res.json()
    setUsers((p) => p.map((x) => x.id === updated.id ? updated : x))
    showToast(
      grant ? `Admin granted to ${u.name}` : `Admin revoked from ${u.name}`,
      "success"
    )
  }

  // ── SUPER_ADMIN only: put an account back on the default password ──────────
  async function resetToDefault(u: User) {
    if (!(await confirm({
      title: "Reset password",
      message:
        `Reset ${u.name}'s password to the default?\n\n` +
        `They must choose a new password at their next login.`,
      tone: "default",
      confirmLabel: "Reset password",
    }))) return

    const res = await fetch(`/api/users/${u.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ resetPassword: true }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return showToast(data.error || "Failed to reset password", "error")

    if (data.user) setUsers((p) => p.map((x) => x.id === u.id ? data.user : x))
    showToast(`${u.name} must change their password at next login`, "success")
  }

  // ── Draggable modal ───────────────────────────────────────────────────────
  const modalRef      = useRef<HTMLDivElement>(null)
  const deniedHandled = useRef(false)
  const [modalPos, setModalPos] = useState({ x: 0, y: 100 })
  const dragging = useRef(false)
  const offset   = useRef({ x: 0, y: 0 })

  useEffect(() => { setModalPos({ x: window.innerWidth / 2 - 250, y: 100 }) }, [])

  useEffect(() => {
    if (!ready || allowed || deniedHandled.current) return
    deniedHandled.current = true
    showToast("You don't have permission to manage users", "error")
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - startedAt >= 5_000) { clearInterval(timer); router.replace("/dashboard") }
    }, 100)
    return () => clearInterval(timer)
  }, [ready, allowed, router])

  function startDrag(e: React.MouseEvent) {
    dragging.current = true
    offset.current   = { x: e.clientX - modalPos.x, y: e.clientY - modalPos.y }
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const w = modalRef.current?.offsetWidth  || 500
      const h = modalRef.current?.offsetHeight || 400
      setModalPos({
        x: Math.max(0, Math.min(e.clientX - offset.current.x, window.innerWidth  - w)),
        y: Math.max(0, Math.min(e.clientY - offset.current.y, window.innerHeight - h)),
      })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup",   onUp)
    }
  }, [])

  // One renderer, shared by the table cell and by the mobile expandable
  // row's <dd> — so the collapsed and expanded views can never disagree.
  function renderValue(c: ColDef, u: User, chain?: OrgNode[]): ReactNode {
    switch (c.key) {
      case "name":
        return (
          <span className="inline-flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => setDetailUser(u)}
              title="Open user details"
              className="font-medium text-gray-900 hover:text-blue-600 hover:underline text-left"
            >
              {u.name}
            </button>
            {u.mustChangePassword && (
              <span
                title="Still on the default password — must change it at next login"
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800"
              >
                default pw
              </span>
            )}
          </span>
        )
      case "role":
        return (
          <span className="text-[11px] font-semibold px-[7px] py-0.5 rounded bg-slate-100 text-slate-600">
            {u.role}
          </span>
        )
      case "status": {
        const s = statusOf(u)
        const chip = STATUS_STYLES[s] ?? STATUS_STYLES.ACTIVE
        return (
          <span
            className="text-[11px] font-semibold px-[7px] py-0.5 rounded border"
            style={{ backgroundColor: chip.bg, color: chip.fg, borderColor: chip.bd }}
          >
            {s}
          </span>
        )
      }
      case "orgUnit":    return u.orgUnit?.name ?? "—"
      // Matrix affiliation: where a field worker BELONGS (their department),
      // as opposed to where they sit. Prefixed with the division abbreviation
      // ("FN O&M", "NI Engineering") so a bare department name is unambiguous.
      case "department": return departmentFor(u, chain)
      case "section":        return sectionFor(u, chain)
      case "regionZoneSite": return regionZoneSiteFor(chain)
      case "manager":        return u.manager?.name ?? "—"
      case "employeeId":
        return u.employeeId ? <span className="font-mono">{u.employeeId}</span> : "—"
      case "jobTitle":   return u.jobTitle || "—"
      case "email":      return u.email
      case "phone":      return u.phone || "—"
      case "createdAt":  return fmtDate(u.createdAt)
      case "assignedAssets":
        return u._count ? (
          <span className="text-[11px] font-semibold px-[7px] py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">{u._count.assignedAssets}</span>
        ) : "—"
      case "openWorkOrders":
        return u._count ? (
          <span className="text-[11px] font-semibold px-[7px] py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">{u._count.assignedWorkOrders}</span>
        ) : "—"
      case "lastLogin":
        return (
          <span title={fmtDateTime(u.lastLoginAt)}>
            {u.lastLoginAt ? fmtRelative(u.lastLoginAt) : "Never"}
          </span>
        )
      default:
        return null
    }
  }

  // ── Render guards ─────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <div className="flex gap-1.5">
          {[0,1,2].map((i) => (
            <div
              key={i}
              className="h-2 w-2 rounded-full bg-blue-500 animate-bounce"
              style={{ animationDelay: `${i*0.15}s` }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] gap-3 text-slate-500">
        <div className="text-[32px]">🔒</div>
        <div className="text-[15px] font-semibold text-slate-900">Access Denied</div>
        <div className="text-xs text-slate-400">Redirecting to dashboard in 5 seconds…</div>
      </div>
    )
  }

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold">User Management</h1>
        <div className="flex items-center gap-2.5">
          {/* Live indicator */}
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-600 animate-pulse" />
            LIVE
          </span>
          <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
            {myRole}
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium"
          onClick={() => {
            resetForm(); setEditingUser(null); setShowModal(true)
            // Reports-To picker needs the list — fetch it if the admin never
            // opened the table first.
            if (users.length === 0) loadUsers()
          }}
        >
          + Add User
        </button>
        <button
          className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium"
          onClick={() => setSeedOpen(true)}
        >
          ⬆ Seed from Excel
        </button>
        <button
          className={`px-4 py-2 rounded border text-sm ${activeView === "view" ? "bg-gray-200" : "bg-white hover:bg-gray-50"}`}
          onClick={() => setActiveView("view")}
        >
          View Users
        </button>
      </div>

      {activeView === "view" && (
        <div className="bg-white p-4 rounded shadow">
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <div className="w-full space-y-2">
              {/* Attribute selector — pick which filters to use first. */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Filter by</span>
                {FILTER_ATTRS.map((a) => {
                  const on = enabledFilters.has(a.key)
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => toggleFilter(a.key)}
                      className={`px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors ${
                        on ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {a.label}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="ml-1 text-[11px] font-semibold text-slate-500 hover:underline"
                >
                  Clear all
                </button>
              </div>

              {/* Active filter controls — shown for the selected attributes. */}
              <div className="flex flex-wrap items-end gap-2">
                {orgLevels.length > 0 && (
                  <div className="w-full">
                    <OrgFilterBar tree={tree} value={orgFilter} onChange={setOrgFilter} levels={orgLevels} />
                  </div>
                )}
                {enabledFilters.has("ROLE") && (
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    title="Filter by role"
                    className={`px-2 py-2 rounded border text-sm font-medium bg-white ${
                      roleFilter ? "bg-blue-50 border-blue-300 text-blue-700" : "text-gray-600"
                    }`}
                  >
                    <option value="">All roles</option>
                    {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}
                {enabledFilters.has("STATUS") && (
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    title="Filter by account status"
                    className={`px-2 py-2 rounded border text-sm font-medium bg-white ${
                      statusFilter ? "bg-blue-50 border-blue-300 text-blue-700" : "text-gray-600"
                    }`}
                  >
                    <option value="">All statuses</option>
                    {USER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                {enabledFilters.has("SEARCH") && (
                  <input
                    type="text"
                    placeholder="Search by name, email or phone…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 min-w-[200px] border p-2 rounded text-sm"
                  />
                )}
              </div>
            </div>

            {/* Column visibility — opens a modal so it always renders above the
                table (the old absolute dropdown could sit behind sticky cells). */}
            <button
              type="button"
              onClick={() => setColsOpen(true)}
              title="Choose visible columns"
              className="px-3 py-2 rounded border text-sm font-medium bg-white text-gray-600 hover:bg-gray-50"
            >
              Columns ▾
            </button>
            <Modal
              open={colsOpen}
              onClose={() => setColsOpen(false)}
              title="Visible columns"
              size="sm"
              footer={
                <button
                  onClick={() => setColsOpen(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold"
                >
                  Done
                </button>
              }
            >
              <p className="text-xs text-gray-400 mb-2">
                {cols.length} of {COLUMNS.length} columns shown
              </p>
              <div className="grid grid-cols-2 gap-1">
                {COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 cursor-pointer rounded"
                  >
                    <input
                      type="checkbox"
                      checked={visible[c.key]}
                      onChange={() => toggleCol(c.key)}
                      className="accent-blue-600"
                    />
                    <span className="flex-1">{c.label}</span>
                  </label>
                ))}
              </div>
            </Modal>
          </div>

          <div className="overflow-auto max-h-[520px]">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-gray-100 z-10">
                <tr>
                  {cols.map((c) => (
                    <th
                      key={c.key}
                      className="p-2 text-left border-b font-semibold text-gray-600 whitespace-nowrap"
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className="p-2 border-b text-center font-semibold text-gray-600 whitespace-nowrap">Actions</th>
                  {canGrantAdmin && (
                    <th className="p-2 border-b text-center font-semibold text-gray-600 whitespace-nowrap">Admin Access</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={cols.length + 2 + (canGrantAdmin ? 1 : 0)} className="p-8 text-center text-gray-400">
                      No users found
                    </td>
                  </tr>
                )}
                {filteredUsers.map((u) => {
                  const chain = ancestry.get(u.orgUnit?.id ?? "")
                  return (
                    <Fragment key={u.id}>
                      <tr className="border-t hover:bg-gray-50">
                        {cols.map((c) => (
                          <td
                            key={c.key}
                            className="p-2 align-top text-gray-600 whitespace-nowrap"
                          >
                            {renderValue(c, u, chain)}
                          </td>
                        ))}
                        <td className="p-2 text-center">
                          <div className="flex gap-2 justify-center">
                            <button onClick={() => startEdit(u)} className="text-blue-600 hover:underline text-xs">Edit</button>
                            <button onClick={() => deleteUser(u.id)} className="text-red-500 hover:underline text-xs">Delete</button>
                            {/* SUPER_ADMIN only — recovery path back onto the default
                                password; the account is flagged for a forced change. */}
                            {canResetToDefault && u.role !== "SUPER_ADMIN" && (
                              <button
                                onClick={() => resetToDefault(u)}
                                className="text-amber-600 hover:underline text-xs"
                                title="Reset this account onto the default password (they must change it at next login)"
                              >
                                Reset pw
                              </button>
                            )}
                          </div>
                        </td>
                        {canGrantAdmin && (
                          <td className="p-2 text-center">
                            {u.role === "SUPER_ADMIN"
                              ? <span className="text-xs text-gray-400">—</span>
                              : u.role === "ADMIN"
                                ? (
                                  <button
                                    onClick={() => toggleAdminAccess(u, false)}
                                    className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                                  >
                                    Revoke Admin
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => toggleAdminAccess(u, true)}
                                    className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200"
                                  >
                                    Grant Admin
                                  </button>
                                )
                            }
                          </td>
                        )}
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50">
          <div
            ref={modalRef}
            className="bg-white w-[500px] max-w-[92vw] rounded-xl shadow-xl flex flex-col p-6 max-h-[82vh]"
            style={{ position:"absolute", top:modalPos.y, left:modalPos.x }}
          >
            <div
              className="cursor-grab font-semibold mb-4 text-gray-800 select-none"
              onMouseDown={startDrag}
            >
              {editingUser ? "Edit User" : "Add New User"}
            </div>
            <div className="flex-1 overflow-auto space-y-3">
              <input
                className="w-full border p-2 rounded text-sm" placeholder="Full name"
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="w-full border p-2 rounded text-sm"
                placeholder="Email address or username"
                type="text" autoComplete="off" spellCheck={false} autoCapitalize="none"
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <input
                className="w-full border p-2 rounded text-sm" placeholder="Phone (optional)"
                value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              {!editingUser && (
                <div>
                  <input
                    className="w-full border p-2 rounded text-sm"
                    placeholder="Password (blank = default)"
                    type="password"
                    value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Blank provisions the account on the default password — the user must change it at first login.
                  </p>
                </div>
              )}
              <select
                className="w-full border p-2 rounded text-sm bg-white"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="">Select role</option>
                {/* SUPER_ADMIN is offered only to a caller who can actually grant
                    it — the API rejects the elevation otherwise, so listing it for
                    an ADMIN would just be an option that always 403s. */}
                {ALL_ROLES
                  .filter((r) => r !== "SUPER_ADMIN" || canGrantAdmin)
                  .map((r) => <option key={r} value={r}>{r}</option>)}
              </select>

              {/* ── Directory attributes (Users page columns) ─────────────── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-medium">Oracle ID (Employee ID)</div>
                  <input
                    className="w-full border p-2 rounded text-sm"
                    placeholder="e.g. 104382"
                    value={form.employeeId}
                    onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-medium">Job Title</div>
                  <input
                    className="w-full border p-2 rounded text-sm"
                    placeholder="e.g. Field Technician"
                    value={form.jobTitle}
                    onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-medium">Status</div>
                  <select
                    className="w-full border p-2 rounded text-sm bg-white"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    {USER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Anything but ACTIVE is refused at sign-in.
                  </p>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-medium">Reports To</div>
                  <select
                    className="w-full border p-2 rounded text-sm bg-white"
                    value={form.managerId}
                    onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                  >
                    <option value="">— none —</option>
                    {managerOptions.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1 font-medium">Org Unit *</div>
                <div className="border rounded overflow-auto max-h-[200px] px-2 py-1.5">
                  <AssignTreeSelector
                    tree={tree}
                    assignableTypes={ASSIGNABLE_TYPES}
                    selectedId={form.orgUnitId}
                    onSelect={(id: string) => {
                      const type = findNodeType(tree, id)
                      const r    = getRoleByType(type)
                      setForm((prev) => ({ ...prev, orgUnitId: id, role: r }))
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1 font-medium">
                  Zone / Region <span className="text-gray-400 font-normal">(zones/regions field workers)</span>
                </div>
                <select
                  className="w-full border p-2 rounded text-sm bg-white"
                  value={form.geoZoneId}
                  onChange={(e) => setForm({ ...form, geoZoneId: e.target.value })}
                >
                  <option value="">— none (corporate worker) —</option>
                  {zoneOptions.map((z) => (
                    <option key={z.id} value={z.id}>{z.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Field workers are homed under their functional unit above and populated into the
                  selected zone/region&apos;s operational office.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
              <button
                onClick={() => { setShowModal(false); setEditingUser(null) }}
                className="px-4 py-2 border rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveUser}
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-60"
              >
                {saving ? "Saving…" : editingUser ? "Save Changes" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User detail drawer — every column plus the fields that have none.
          The list copy is preferred so an SSE update lands live. */}
      {detailUser && (() => {
        const current = detailUser!
        const live = users.find((u) => u.id === current.id) ?? current
        return (
          <UserDetailDrawer
            user={live}
            chain={ancestry.get(live.orgUnit?.id ?? "")}
            onClose={() => setDetailUser(null)}
            onEdit={() => startEdit(live)}
          />
        )
      })()}

      {/* Manual user seeding from an Excel workbook. */}
      <UserSeedDialog
        open={seedOpen}
        onClose={() => setSeedOpen(false)}
        onImported={() => { loadUsers(); showToast("Users imported", "success") }}
      />
    </div>
  )
}
