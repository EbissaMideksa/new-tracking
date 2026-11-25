// app/dashboard/(workorders)/workorders/page.tsx
"use client"

import { useEffect, useState, useMemo } from "react"
import dynamic from "next/dynamic"
import { useWorkOrders, WorkOrder } from "@/hooks/useWorkOrders"
import { useTree } from "@/components/useTree"
import { usePermissionGuard } from "@/hooks/usePermissionGuard"
import { useToast } from "@/components/ToastProvider"
import { useConfirm } from "@/components/ConfirmProvider"
import { useWoPermissions } from "@/context/WoPermissionsContext"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Home, Settings, LogOut, Network } from "lucide-react"
import ThemeToggle from "@/components/ThemeToggle"
import EthioTelecomLogo from "@/components/EthioTelecomLogo"
import { buildPathMap, formatOwningDepartment } from "@/lib/formatOrg"

import WorkOrderTable from "./_components/WorkOrderTable"
import BulkActionBar  from "./_components/BulkActionBar"
// The org-structure panel the home sidebar opens from its org-structure icon —
// reused here so "Filter by Org Unit" offers the same picker and breadcrumb.
import OrgStructureModal from "@/components/OrgStructureModal"
import { isWoLockedByOther } from "@/lib/woCheckoutClient"
import {
  AppView, TaskTab, OmTab, ActAction,
  SearchFields, EMPTY_SEARCH, EMPTY_LIFECYCLE_PERMS,
} from "./_components/types"

// Lazy-loaded components (heavy dependencies: xlsx, recharts)
const DetailModal  = dynamic(() => import("./_components/modals/DetailModal"), { ssr: false })
const CreateModal  = dynamic(() => import("./_components/modals/CreateModal"), { ssr: false })
const WoMonitoring = dynamic(() => import("./_components/WoMonitoring"), { ssr: false })

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV_ITEMS: [AppView, string, string, string][] = [
  ["ORDER_MONITORING", "O", "Order Monitoring",     "All work orders — full visibility"],
  ["TASK_CENTER",      "T", "Task Center (OM)",     "Your org unit work queues"],
  ["ORG_ORDERS",       "G", "Org Orders",           "All orders in your org subtree"],
  ["WO_MONITORING",    "W", "WorkOrder Monitoring", "Real-time KPIs, throughput & SLA"],
]

// Shared Tailwind class strings for the sidebar filter inputs / labels.
const INP = "w-full rounded-md border border-slate-200 bg-white px-[7px] py-1 text-[11px] outline-none box-border"
const LBL = "block mb-0.5 text-[10px] font-semibold text-gray-500"

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?"
}

// ─────────────────────────────────────────────────────────────────────────────

export default function WorkOrdersPage() {
  const { orders, loading, liveIndicator, mutate, create, refetch } = useWorkOrders()
  const { tree }  = useTree()
  const { ready, allowed, myRole } = usePermissionGuard("view_work_orders")
  const { canWo, loaded: woLoaded, canWoSelf } = useWoPermissions()
  //const {canWoSelf} = useWoPermissions()
  const { showToast } = useToast()
  const confirm = useConfirm()
  const router = useRouter()

  const [me,  setMe]  = useState<any>(null)
  const [now, setNow] = useState(Date.now())
  const [woLightbox, setWoLightbox] = useState(false)
  const [woAvatarBroken, setWoAvatarBroken] = useState(false)

  const role  = myRole || me?.role || ""
  const guard = (action: string) => woLoaded && !!role && canWoSelf(action as any)

  // ── Per-action flags ──────────────────────────────────────────────────────
  const canViewAll      = guard("wo_view_all")
  const canCreate       = guard("wo_create")
  const canDelete       = guard("wo_delete")
  const canAssign       = guard("wo_assign")
  const canReassign     = guard("wo_reassign")
  const canCheckout     = guard("wo_checkout")
  const canStart        = guard("wo_start")
  const canComplete     = guard("wo_complete")
  const canCheckin      = guard("wo_checkin")
  const canForceArchive = guard("wo_force_archive")
  const canExport       = guard("wo_export")

  // ── UI state ──────────────────────────────────────────────────────────────
  const [navOpen,    setNavOpen]    = useState(false)
  const [view,       setView]       = useState<AppView>("TASK_CENTER")
  // Taskbar tabs the user has pinned (added from the hamburger menu). Each
  // pinned tab shows an ✕ to unpin. The active view is always pinned.
  const [pinned,     setPinned]     = useState<AppView[]>([])
  const [taskTab,    setTaskTab]    = useState<TaskTab>("TO_PROCESS")
  const [omTab,      setOmTab]      = useState<OmTab>("ACTIVE")
  const [omSidebar,  setOmSidebar]  = useState(true)
  // Org-structure panel opened by the Order Monitoring "Filter by Org Unit"
  // field. Distinct from the sidebar's own panel — that one writes `?org=`
  // and navigates, this one drives the in-page `search.orgId` filter.
  const [omOrgModal,  setOmOrgModal]  = useState(false)
  // Work orders per org unit for the picker (loaded the first time it opens),
  // so this page's org structure shows work-order data, not asset counts.
  const [omOrgCounts, setOmOrgCounts] = useState<Record<string, number> | null>(null)
  const [search,     setSearch]     = useState<SearchFields>(EMPTY_SEARCH)
  const [showAdv,    setShowAdv]    = useState(false)
  const [tcSearch,   setTcSearch]   = useState("")
  const [orgSearch,  setOrgSearch]  = useState("")
  const [page,       setPage]       = useState(1)
  const [selected,   setSelected]   = useState<Set<string>>(new Set())
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [detail,     setDetail]     = useState<WorkOrder | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const pageSize = 20

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  // Org-structure picker counts — work orders per unit, loaded the first time
  // the picker is opened so the panel shows data relevant to this page.
  useEffect(() => {
    if (!omOrgModal || omOrgCounts) return
    fetch("/api/org/metrics?metric=workorders")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.counts) setOmOrgCounts(d.counts as Record<string, number>) })
      .catch(() => {})
  }, [omOrgModal, omOrgCounts])

  useEffect(() => {
    fetch("/api/me").then(r => r.json()).then(u => {
      setMe(u)
      // Non-admins default to Task Center so they see their assigned work
      if (u && !["ADMIN", "SUPER_ADMIN"].includes(u.role)) {
        setView("TASK_CENTER")
      }
    }).catch(() => {})
  }, [])

  // Id set of the subtree under every node of the org tree, keyed by node id.
  //
  // The org filter matches on this rather than on OrgUnit.path: /api/tree
  // returns {id,name,type,children,totalAssets} and no `path`, so a path
  // comparison degrades to an empty string, goes falsy, and silently falls
  // through to an exact-id match — which drops every sub-unit's orders and
  // makes a parent unit look empty. The tree is rooted at the caller's own org
  // unit, so a node's descendant set IS its scope.
  const orgSubtreeIds = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    function walk(n: any): Set<string> {
      const ids = new Set<string>([n.id])
      for (const c of n.children ?? []) for (const id of walk(c)) ids.add(id)
      map[n.id] = ids
      return ids
    }
    if (tree) walk(tree)
    return map
  }, [tree])

  // Build full path nodes for the current user's org unit
  const woPathMap = useMemo(() => tree ? buildPathMap(tree) : {}, [tree])
  const myOrgPathLabel = useMemo(() => {
    if (!me?.orgUnitId || !woPathMap[me.orgUnitId]) return me?.orgUnit?.name || ""
    const formatted = formatOwningDepartment(woPathMap[me.orgUnitId])
    return formatted !== "—" ? formatted : me?.orgUnit?.name || ""
  }, [me, woPathMap])

  // Name of the org unit the Order Monitoring filter is currently pinned to —
  // shown on the "Filter by Org Unit" trigger once the panel has applied one.
  const selectedOrgLabel = useMemo(() => {
    if (!search.orgId) return ""
    const path = woPathMap[search.orgId]
    return path?.[path.length - 1]?.name || search.orgId.slice(0, 8)
  }, [search.orgId, woPathMap])

  // ── Filtered datasets ─────────────────────────────────────────────────────
  const omBase = useMemo(() => {
    let d = [...orders]
    if (search.woNo)     d = d.filter(o => o.workOrderNo?.toLowerCase().includes(search.woNo.toLowerCase()) || o.id.includes(search.woNo))
    if (search.title)    d = d.filter(o => o.title?.toLowerCase().includes(search.title.toLowerCase()))
    if (search.asset)    d = d.filter(o => o.asset?.tagNumber?.toLowerCase().includes(search.asset.toLowerCase()) || o.asset?.serialNumber?.toLowerCase().includes(search.asset.toLowerCase()))
    if (search.status)   d = d.filter(o => o.status === search.status)
    if (search.priority) d = d.filter(o => o.priority === search.priority)
    if (search.assignee) d = d.filter(o => o.assignedTo?.name?.toLowerCase().includes(search.assignee.toLowerCase()))
    if (search.createdBy)d = d.filter(o => (o as any).createdBy?.name?.toLowerCase().includes(search.createdBy.toLowerCase()))
    if (search.orgId) {
      const ids = orgSubtreeIds[search.orgId]
      // Subtree match, so a parent unit keeps its sub-units' orders. Exact-id
      // only as a fallback for a stale id that is no longer in the tree.
      d = ids ? d.filter(o => ids.has(o.orgUnitId)) : d.filter(o => o.orgUnitId === search.orgId)
    }
    return d
  }, [orders, search, orgSubtreeIds])

  const omFiltered = useMemo(() => {
    let d = omTab === "ARCHIVED" ? omBase.filter(o => o.status === "ARCHIVED") : omBase.filter(o => o.status !== "ARCHIVED")
    if (overdueOnly) {
      d = d.filter(o => {
        const open = ["CREATED", "ASSIGNED", "CHECKED_OUT", "IN_PROGRESS"].includes(o.status)
        return open && o.scheduledAt && new Date(o.scheduledAt).getTime() < now
      })
    }
    return d
  }, [omBase, omTab, overdueOnly, now])

  const tcFiltered = useMemo(() => {
    let d = taskTab === "TO_PROCESS"
      ? orders.filter(o => (o.status === "CREATED" || o.status === "ASSIGNED") && o.orgUnit?.path?.startsWith(me?.orgUnit?.path || "\x00"))
      : orders.filter(o => (o.status === "CHECKED_OUT" || o.status === "IN_PROGRESS" || o.status === "COMPLETED") && o.orgUnit?.path?.startsWith(me?.orgUnit?.path || "\x00") && o.checkedOutById === me?.id)
    if (tcSearch) {
      const q = tcSearch.toLowerCase()
      d = d.filter(o =>
        o.workOrderNo?.toLowerCase().includes(q) || o.title?.toLowerCase().includes(q) ||
        o.asset?.tagNumber?.toLowerCase().includes(q) || o.assignedTo?.name?.toLowerCase().includes(q) ||
        (o as any).createdBy?.name?.toLowerCase().includes(q))
    }
    return d
  }, [orders, taskTab, tcSearch, me])

  const orgOrders = useMemo(() => {
    if (!me?.orgUnitId) return []
    // The caller's own subtree. The tree is rooted at that unit, so this is the
    // whole tree — every unit under it, and by extension every order in scope.
    const ids = orgSubtreeIds[me.orgUnitId]
    let d = ids
      ? orders.filter(o => ids.has(o.orgUnitId))
      : orders.filter(o => o.orgUnitId === me.orgUnitId)
    if (orgSearch) {
      const q = orgSearch.toLowerCase()
      d = d.filter(o =>
        o.workOrderNo?.toLowerCase().includes(q) || o.title?.toLowerCase().includes(q) ||
        o.asset?.tagNumber?.toLowerCase().includes(q) || o.assignedTo?.name?.toLowerCase().includes(q) ||
        (o as any).createdBy?.name?.toLowerCase().includes(q))
    }
    return d
  }, [orders, me, orgSubtreeIds, orgSearch])

  // ── Search helpers ────────────────────────────────────────────────────────
  function sf(k: keyof SearchFields, v: string) { setSearch(p => ({ ...p, [k]: v })); setPage(1) }
  function resetSearch() { setSearch(EMPTY_SEARCH); setPage(1) }
  const hasSearch = Object.values(search).some(v => v !== "")
  function clearSelection() { setSelected(new Set()) }

  // ── Lifecycle action (single WO via detail modal) ─────────────────────────
  async function act(id: string, action: ActAction, payload?: any) {
    try {
      await mutate(id, action, payload)
      showToast({
        'checkout': "Checked out → Processing",
        'start':    "Started → In Progress",
        'complete': "Completed successfully",
        'checkin':  "Archived",
        'assign':   "Assigned to org unit",
        'delete':   "Deleted successfully"
      }[action] ?? "Done", "success")
    } catch (e: any) {
      showToast(e.message, "error")
    }
  }

  // ── Single delete (from detail modal) ────────────────────────────────────
  async function handleDelete(id: string) {
    if (!(await confirm({
      message: "Permanently delete this work order? This cannot be undone.",
      confirmLabel: "Delete",
    }))) return
    try {
      const res  = await fetch(`/api/workorders/${id}`, { method: "DELETE" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(body.error ?? "Delete failed", "error"); return }
      showToast("Work order deleted", "success")
      setDetail(null)
    } catch {
      showToast("Delete request failed", "error")
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleExport() {
    try {
      const res = await fetch("/api/workorders/export")
      if (!res.ok) { const b = await res.json().catch(() => ({})); showToast(b.error || "Export failed", "error"); return }
      const blob = await res.blob()
      const url  = window.URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `work-orders-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      window.URL.revokeObjectURL(url)
      showToast("Export completed", "success")
    } catch { showToast("Export failed", "error") }
  }

  // ── Excel export (client-side, exports the currently loaded orders) ────────
  const WO_EXPORT_COLUMNS = [
    { key: "workOrderNo", label: "Work Order No." },
    { key: "title",       label: "Title" },
    { key: "status",      label: "Status" },
    { key: "priority",    label: "Priority" },
    { key: "orgUnit",     label: "Org Unit" },
    { key: "assignedTo",  label: "Assigned To" },
    { key: "assetTag",    label: "Asset Tag" },
    { key: "assetSerial", label: "Asset Serial" },
    { key: "createdAt",   label: "Created" },
    { key: "scheduledAt", label: "Scheduled" },
  ]
  async function exportWoExcel() {
    const { exportToExcel } = await import("@/lib/exportXlsx")
    exportToExcel(
      orders.map(o => ({
        workOrderNo: o.workOrderNo ?? "",
        title: o.title ?? "",
        status: o.status,
        priority: o.priority ?? "",
        orgUnit: o.orgUnit?.name ?? "",
        assignedTo: o.assignedTo?.name ?? "",
        assetTag: o.asset?.tagNumber ?? "",
        assetSerial: o.asset?.serialNumber ?? "",
        createdAt: o.createdAt,
        scheduledAt: o.scheduledAt ?? "",
      })),
      `work-orders-${new Date().toISOString().slice(0, 10)}`,
      WO_EXPORT_COLUMNS,
    )
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
    window.location.href = "/login"
  }

  // ── Bulk handlers — each iterates IDs, calls the correct sub-route ────────
  async function bulkCall(ids: string[], path: (id: string) => string, method = "PATCH", body?: any) {
    const errors: string[] = []
    for (const id of ids) {
      try {
        const res = await fetch(path(id), {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body:    body ? JSON.stringify(body) : undefined,
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          errors.push(d.error || `Failed (${id.slice(0, 8)})`)
        }
      } catch { errors.push(`Network error (${id.slice(0, 8)})`) }
    }
    if (errors.length) throw new Error(errors.join(" · "))
  }

  const handleBulkDelete   = (ids: string[]) => bulkCall(ids, id => `/api/workorders/${id}`,           "DELETE")
  const handleBulkCheckout = (ids: string[]) => bulkCall(ids, id => `/api/workorders/${id}/checkout`)
  const handleBulkStart    = (ids: string[]) => bulkCall(ids, id => `/api/workorders/${id}/start`)
  const handleBulkComplete = (ids: string[]) => bulkCall(ids, id => `/api/workorders/${id}/complete`)
  const handleBulkCheckin  = (ids: string[]) => bulkCall(ids, id => `/api/workorders/${id}/checkin`)
  const handleBulkAssign   = (ids: string[], targetOrgUnitId: string) =>
    bulkCall(ids, id => `/api/workorders/${id}/assign`, "PATCH", { targetOrgUnitId })

  // ── BulkActionBar props — shared across all three views ───────────────────
  // Pass every permission flag; BulkActionBar decides what to show based on view + statuses.
  const bulkProps = {
    me,
    canDelete, canAssign, canReassign,
    canCheckout, canStart, canComplete, canCheckin,
    onDelete:   handleBulkDelete,
    onAssign:   handleBulkAssign,
    onCheckout: handleBulkCheckout,
    onStart:    handleBulkStart,
    onComplete: handleBulkComplete,
    onCheckin:  handleBulkCheckin,
    tree,
    onRefresh:       refetch,
    onClearSelection: clearSelection,
  }

  function switchView(v: AppView) {
    setView(v); setNavOpen(false); setPage(1); clearSelection()
  }

  // Selecting an item from the hamburger menu pins it as a taskbar tab and
  // switches to it.
  function pinView(v: AppView) {
    setPinned(prev => (prev.includes(v) ? prev : [...prev, v]))
    switchView(v)
  }

  // Removing a tab from the taskbar via its ✕. If it was the active view,
  // fall back to the first remaining pinned tab (or Order Monitoring).
  function unpinView(v: AppView) {
    const next = pinned.filter(x => x !== v)
    setPinned(next)
    if (v === view) {
      const fallback = next[0] ?? "ORDER_MONITORING"
      setView(fallback)
      if (!next.includes(fallback)) setPinned(p => [...p, fallback])
      setPage(1); clearSelection()
    }
  }

  // Drilldown from the Monitoring view → switch to Order Monitoring with a filter
  function handleDrilldown(opts: { status?: string; open?: boolean; overdue?: boolean }) {
    setView("ORDER_MONITORING"); setNavOpen(false); setPage(1); clearSelection()
    if (opts.overdue) {
      setOverdueOnly(true); setOmTab("ACTIVE"); setSearch(EMPTY_SEARCH)
    } else if (opts.open) {
      setOverdueOnly(false); setOmTab("ACTIVE"); setSearch(EMPTY_SEARCH)
    } else if (opts.status) {
      setOverdueOnly(false)
      if (opts.status === "ARCHIVED") { setOmTab("ARCHIVED"); setSearch(EMPTY_SEARCH) }
      else { setOmTab("ACTIVE"); setSearch({ ...EMPTY_SEARCH, status: opts.status }) }
    } else {
      setOverdueOnly(false); setOmTab("ACTIVE"); setSearch(EMPTY_SEARCH)
    }
  }

  // ── Detail modal perm flags ───────────────────────────────────────────────
  const detailLocked = detail ? isWoLockedByOther(detail, me) : false
  const isFullAdmin = me && ["ADMIN", "SUPER_ADMIN"].includes(me.role)
  const detailLifecyclePerms = detail ? {
    canCheckout:     canCheckout     && (detail.status === "CREATED" || detail.status === "ASSIGNED") && !detailLocked,
    canStart:        canStart        && isFullAdmin && detail.status === "CHECKED_OUT" && !detailLocked,
    canComplete:     canComplete     && isFullAdmin && detail.status === "IN_PROGRESS" && !detailLocked,
    canCheckin:      canCheckin      && (detail.status === "COMPLETED" || detail.status === "CHECKED_OUT" || detail.status === "IN_PROGRESS") && !detailLocked,
    canForceArchive: canForceArchive && isFullAdmin && detail.status !== "ARCHIVED" && !detailLocked,
    canDelete:       canDelete && detail.status !== "IN_PROGRESS" && !detailLocked,
  } : EMPTY_LIFECYCLE_PERMS

  const detailCanAssign = detail ? (() => {
    if (detailLocked) return false
    if (view === "ORDER_MONITORING" || view === "ORG_ORDERS")
      return canAssign && (detail.status === "CREATED" || detail.status === "ASSIGNED")
    if (detail.status === "CREATED" || detail.status === "ASSIGNED") return canAssign
    if (detail.status === "CHECKED_OUT")                             return canReassign
    return false
  })() : false

  // ── Render guards ─────────────────────────────────────────────────────────
  if (!ready) return (
    <div className="flex h-screen items-center justify-center bg-[#f5f5f5]">
      <div className="flex gap-1.5">
        {[0,1,2].map(i => (
          <div key={i} className="h-2 w-2 rounded-full bg-[#496b18] animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
        ))}
      </div>
    </div>
  )
  if (!allowed) return null

  const omActiveCount   = omBase.filter(o => o.status !== "ARCHIVED").length
  const omArchivedCount = omBase.filter(o => o.status === "ARCHIVED").length

  return (
    <div className="fixed left-0 top-0 flex h-screen w-full flex-col overflow-hidden bg-[#f5f5f5] text-[12px] overscroll-none [font-family:'Segoe_UI',Arial,sans-serif]">

      {/* ══ TOPBAR ══════════════════════════════════════════════════════ */}
      <div className="wo-topbar relative z-[200] flex h-10 shrink-0 items-center overflow-x-hidden shadow-[0_2px_6px_rgba(0,0,0,.25)] min-w-0">
        {/* Logo area — white background persists to the left of the three lines */}
        <div className="flex h-full shrink-0 items-center bg-white pl-2.5 pr-2">
          <EthioTelecomLogo className="h-6" />
        </div>

        {/* Green background starts here — from the hamburger (three lines) onwards */}
        <div className="flex h-full flex-1 items-center overflow-hidden border-t border-[#c8d8b0] bg-[#f0f7e8]">
        {/* Hamburger (three lines) */}
        <button onClick={() => setNavOpen(v => !v)} className="flex h-10 w-11 shrink-0 flex-col items-center justify-center gap-1 bg-transparent border-0 p-0 cursor-pointer" aria-label={navOpen?"Close menu":"Open menu"}>
          {navOpen ? (
            <svg width={17} height={17} viewBox="0 0 17 17" fill="none">
              <line x1="2" y1="2" x2="15" y2="15" stroke="#496b18" strokeWidth={2} strokeLinecap="round"/>
              <line x1="15" y1="2" x2="2" y2="15" stroke="#496b18" strokeWidth={2} strokeLinecap="round"/>
            </svg>
          ) : (
            [0,1,2].map(i => <span key={i} className="block h-0.5 w-[17px] rounded-sm bg-[#496b18]"/>)
          )}
        </button>
        <div className="flex flex-1 items-center gap-0 overflow-x-auto">
          {pinned.map(k => {
            const found = NAV_ITEMS.find(n => n[0] === k)!
            const [, icon, label] = found
            const active = view === k
            return (
              <div key={k} className="wo-tab-wrapper group relative flex shrink-0 items-stretch">
                <button onClick={() => switchView(k)} className={[
                  "wo-tab-btn flex h-10 items-center gap-1.5 whitespace-nowrap border-0 border-b-[3px] px-2 sm:px-[18px] text-[11px] cursor-pointer transition-all",
                  active
                    ? "font-bold bg-[#496b18]/15 text-[#496b18] border-[#496b18]"
                    : "font-normal bg-transparent text-[#496b18] border-transparent",
                ].join(" ")}>
                  <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold text-[#496b18]"
                    style={{ backgroundColor: active ? "rgba(73,107,24,.2)" : "rgba(73,107,24,.1)" }}>{icon}</span>
                  <span className="wo-tab-label hidden sm:inline">{label}</span>
                </button>
                {/* ✕ only visible on hover */}
                <button onClick={() => unpinView(k)} title="Remove from taskbar" aria-label="Remove from taskbar" className="wo-tab-close absolute -right-[3px] -top-[3px] z-[2] flex h-[15px] w-[15px] items-center justify-center rounded-full border border-red-600 bg-white p-0 text-[10px] font-extrabold leading-none text-red-600 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100">×</button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2.5 pr-1.5">
          {liveIndicator && <span className="wo-live hidden sm:inline rounded-full border border-[#496b18]/30 bg-[#496b18]/15 px-2 py-0.5 text-[9px] text-[#496b18]">● LIVE</span>}

          {/* Location / category */}
          {me?.orgUnit?.name && (
            <span className="wo-location hidden md:inline-block whitespace-nowrap rounded-full border border-[#496b18]/20 bg-[#496b18]/10 px-[9px] py-0.5 text-[10px] text-[#496b18]">📍 {myOrgPathLabel}</span>
          )}

          {/* Theme toggle */}
          <ThemeToggle color="#496b18" hoverBg="rgba(73,107,24,.15)" />

          {/* Settings icons */}
          <Link href="/dashboard" title="Dashboard" className="flex items-center text-[#496b18] opacity-90">
            <Home size={15} />
          </Link>
          <Link href="/dashboard/settings" title="Settings" className="wo-settings hidden sm:flex items-center text-[#496b18] opacity-90">
            <Settings size={15} />
          </Link>

          <div className="h-[22px] w-px bg-[#496b18]/20" />

          {/* Profile of the logged-in user */}
          <div className="flex items-center gap-[7px]">
            <div
              onClick={() => me?.photo && !woAvatarBroken ? setWoLightbox(true) : undefined}
              title={me?.photo ? "Click to enlarge" : undefined}
              className="flex h-[26px] w-[26px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#496b18]/15"
              style={{ cursor: me?.photo ? "pointer" : "default" }}>
              {me?.photo && !woAvatarBroken
                ? <img src={me.photo} alt={me?.name || ""} className="h-full w-full object-cover" onError={() => setWoAvatarBroken(true)} />
                : <span className="text-[10px] font-bold text-[#496b18]">{getInitials(me?.name || "")}</span>}
            </div>
            <div className="wo-profile-text hidden md:flex flex-col leading-tight whitespace-nowrap text-[#496b18]">
              <span className="text-[11px] font-semibold">{me?.name || ""}</span>
              <span className="text-[9px] opacity-80">{me?.role || ""}</span>
            </div>
            <button onClick={logout} title="Logout" className="flex items-center bg-transparent border-0 text-[#496b18] opacity-85 cursor-pointer p-1">
              <LogOut size={14} />
            </button>
          </div>
        </div>
        </div>{/* end green background div */}
      </div>

      {/* ══ NAV OVERLAY ════════════════════════════════════════════════ */}
      {navOpen && (
        <>
          <div onClick={() => setNavOpen(false)} className="fixed inset-0 z-[150] bg-black/35"/>
          <div className="fixed left-0 right-0 top-10 z-[160] flex max-h-[calc(100vh-40px)] flex-col overflow-y-auto border-t-[3px] border-[#496b18] bg-white shadow-[0_4px_16px_rgba(0,0,0,.15)]">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Navigation</span>
              <button onClick={() => setNavOpen(false)} className="bg-transparent border-0 p-0 text-lg text-gray-500 cursor-pointer">✕</button>
            </div>
            <div className="flex flex-col overflow-y-auto">
            {NAV_ITEMS.map(([k, icon, label, desc]) => (
              <button key={k} onClick={() => pinView(k)} className={[
                "flex w-full items-center gap-2.5 border-0 border-b border-gray-100 px-4 py-3 text-left transition-all cursor-pointer",
                view===k ? "bg-[#f5f7f0]" : "bg-transparent",
              ].join(" ")}>
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
                  style={{ backgroundColor: view===k ? "#496b18" : "#f3f4f6", color: view===k ? "#fff" : "#6b7280" }}>{icon}</span>
                <div className="flex min-w-0 flex-1 flex-col items-start">
                  <span className="text-xs" style={{ fontWeight: view===k?700:500, color: view===k ? "#496b18" : "#111827" }}>{label}</span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-gray-400">{desc}</span>
                </div>
                {pinned.includes(k)
                  ? <span className="shrink-0 whitespace-nowrap rounded-lg bg-[#e8f0d8] px-[7px] py-px text-[9px] font-bold text-[#496b18]">pinned</span>
                  : (view===k && <span className="shrink-0 text-sm text-[#496b18]">✓</span>)}
              </button>
            ))}
            </div>
          </div>
        </>
      )}

      {/* ══ BODY ════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ════ ORDER MONITORING ════ */}
        {view === "ORDER_MONITORING" && (
          <>
            {/* Mobile backdrop for the filter sidebar */}
            {omSidebar && <div className="wo-sidebar-backdrop fixed inset-0 top-10 z-[99] bg-black/35 md:hidden" onClick={() => setOmSidebar(false)} />}
            {/* Sidebar */}
            <aside className={[
              "wo-sidebar flex flex-col overflow-hidden border-r border-slate-200 bg-gray-50 transition-all",
              "max-md:fixed max-md:top-10 max-md:bottom-0 max-md:left-0 max-md:z-[100] max-md:shadow-xl",
              omSidebar ? "max-md:w-[82vw] max-md:max-w-[270px] md:w-[200px] md:min-w-[200px]" : "max-md:hidden md:w-0 md:min-w-0",
            ].join(" ")}>
              <div className="flex h-full min-w-0 flex-col overflow-hidden md:min-w-[200px]">
                <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-3">
                  <span className="text-sm font-bold text-slate-700">Search Filters</span>
                  <button onClick={() => setShowAdv(v => !v)} className="text-[9px] text-[#496b18] bg-transparent border-0 cursor-pointer">{showAdv?"▲ Basic":"▼ Advanced"}</button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {([
                    ["woNo",     "Work Order No.",    "text", "Please Enter"],
                    ["title",    "Subject / Title",   "text", "Please Enter"],
                    ["asset",    "Asset Tag / Serial","text", "Please Enter"],
                    ["assignee", "Assigned To",       "text", "Please Enter"],
                    ["createdBy","Created By",        "text", "Please Enter"],
                  ] as [keyof SearchFields, string, string, string][]).map(([k, label, type, ph]) => (
                    <div key={k} className="mb-[5px]">
                      <label className={LBL}>{label}</label>
                      <input className={INP} type={type} value={search[k]} onChange={e => sf(k, e.target.value)} placeholder={ph}/>
                    </div>
                  ))}
                  <div className="mb-[5px]">
                    <label className={LBL}>Work Order State</label>
                    <select className={INP} value={search.status} onChange={e => sf("status", e.target.value)}>
                      <option value="">Please Select</option>
                      {Object.entries({ CREATED:"Initialization State", ASSIGNED:"Assigned", CHECKED_OUT:"Processing", IN_PROGRESS:"In Progress", COMPLETED:"Successful", ARCHIVED:"Order Archive" }).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="mb-[5px]">
                    <label className={LBL}>Priority</label>
                    <select className={INP} value={search.priority} onChange={e => sf("priority", e.target.value)}>
                      <option value="">Please Select</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>
                  {showAdv && (
                    <div className="border-t border-gray-200 pt-2 mt-1">
                      <div className="mb-1.5 text-[10px] font-bold text-gray-700">Advanced Condition</div>
                      <div className="mb-1.5">
                        <label className="mb-0.5 flex items-center justify-between text-[10px] font-semibold text-gray-500">
                          Filter by Org Unit
                          {search.orgId && <button onClick={() => sf("orgId", "")} className="text-[9px] text-red-500 bg-transparent border-0 cursor-pointer">✕ clear</button>}
                        </label>
                        {/* Opens the same org-structure panel the home sidebar uses,
                            rooted at this user's own branch from /api/tree. */}
                        <button
                          type="button"
                          onClick={() => tree && setOmOrgModal(true)}
                          disabled={!tree}
                          title={search.orgId ? `Filtered to ${selectedOrgLabel}` : "Pick an org unit to narrow the list"}
                          className="flex w-full items-center gap-[5px] rounded border px-[7px] py-1 text-left text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                          style={{
                            borderColor: search.orgId ? "#93c5fd" : "#d1d5db",
                            backgroundColor: search.orgId ? "#eff6ff" : "#fff",
                            color: search.orgId ? "#1d4ed8" : "#374151",
                          }}
                        >
                          <Network size={12} className="shrink-0" />
                          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                            {search.orgId ? selectedOrgLabel : "All org units"}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-[5px] border-t border-gray-200 px-2.5 py-[7px]">
                  <button onClick={() => setPage(1)} className="flex-1 rounded border-0 bg-[#496b18] py-[5px] text-[11px] font-semibold text-white cursor-pointer">Query</button>
                  <button onClick={resetSearch} disabled={!hasSearch} className="flex-1 rounded border border-gray-300 bg-white py-[5px] text-[11px] text-gray-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">Reset</button>
                </div>
              </div>
            </aside>

            {/* Main panel */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Toolbar */}
              <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setOmSidebar(v => !v)} className="rounded border border-gray-200 bg-transparent px-[7px] py-[3px] text-[13px] text-gray-500 cursor-pointer">{omSidebar?"◀":"▶"}</button>
                  <span className="text-xs font-semibold text-gray-700">Order Monitoring</span>
                  <span className="text-[10px] italic text-gray-400">
                    — {canViewAll?"all orders":"own org unit"}
                    {(canAssign||canReassign)?", assignment enabled":", read-only"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                {canExport && <button onClick={handleExport} className="whitespace-nowrap rounded border border-gray-300 bg-white px-2 py-1 text-[10px] font-semibold text-gray-700 cursor-pointer">↓ CSV</button>}
                {canExport && <button onClick={exportWoExcel} className="whitespace-nowrap rounded border border-indigo-500 bg-white px-2 py-1 text-[10px] font-semibold text-indigo-500 cursor-pointer">↓ Excel</button>}
                  {canCreate && <button onClick={() => setShowCreate(true)} className="whitespace-nowrap rounded border-0 bg-blue-700 px-2 py-1 text-[10px] font-semibold text-white cursor-pointer">+ New</button>}
                </div>
              </div>

              {/* Overdue-only filter banner (drilled down from Monitoring) */}
              {overdueOnly && (
                <div className="flex shrink-0 items-center justify-between border-b border-red-200 bg-red-50 px-3 py-[5px] text-[11px] font-semibold text-red-700">
                  <span>⚠ Showing overdue work orders only (past scheduled date, still open)</span>
                  <button onClick={() => setOverdueOnly(false)} className="rounded border border-red-200 bg-white px-[9px] py-0.5 text-[10px] font-semibold text-red-700 cursor-pointer">✕ Clear filter</button>
                </div>
              )}

              {/* Bulk action bar */}
              {selected.size > 0 && (
                <BulkActionBar selectedIds={selected} orders={omFiltered} view={view} {...bulkProps}/>
              )}

              {/* Tabs */}
              <div className="flex shrink-0 gap-0 border-b border-gray-200 bg-white px-3">
                {([["ACTIVE","📋 Active Orders",omActiveCount],["ARCHIVED","🗄 Archived Orders",omArchivedCount]] as [OmTab,string,number][]).map(([k,label,count]) => (
                  <button key={k} onClick={() => { setOmTab(k); setPage(1); clearSelection() }}
                    className="flex items-center gap-1.5 border-0 border-b-2 px-[18px] py-2 text-[11px] cursor-pointer transition-all"
                    style={{
                      fontWeight: omTab===k ? 700 : 400,
                      color: omTab===k ? (k==="ARCHIVED" ? "#64748b" : "#496b18") : "#6b7280",
                      background: "transparent",
                      borderBottomColor: omTab===k ? (k==="ARCHIVED" ? "#64748b" : "#496b18") : "transparent",
                    }}>
                    {label}
                    <span className="rounded-lg px-1.5 text-[9px] font-bold"
                      style={{ backgroundColor: omTab===k ? (k==="ARCHIVED" ? "#f1f5f9" : "#e8f0d8") : "#f3f4f6", color: omTab===k ? (k==="ARCHIVED" ? "#64748b" : "#15803d") : "#9ca3af" }}>{count}</span>
                  </button>
                ))}
              </div>

              <WorkOrderTable orders={omFiltered} page={page} pageSize={pageSize} setPage={setPage} selected={selected} setSelected={setSelected} onDetail={setDetail} me={me} now={now} tree={tree}/>
            </div>
          </>
        )}

        {/* ════ TASK CENTER ════ */}
        {view === "TASK_CENTER" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 border-b border-gray-200 bg-white px-2.5 py-1.5">
              <div className="flex shrink-0 overflow-hidden rounded border border-gray-300">
                {(["TO_PROCESS","PROCESSING"] as TaskTab[]).map(k => {
                  const label = k==="TO_PROCESS"?"To Process":"Processing"
                  const count = k==="TO_PROCESS"
                    ? orders.filter(o=>(o.status==="CREATED"||o.status==="ASSIGNED")&&o.orgUnit?.path?.startsWith(me?.orgUnit?.path||"\x00")).length
                    : orders.filter(o=>(o.status==="CHECKED_OUT"||o.status==="IN_PROGRESS"||o.status==="COMPLETED")&&o.orgUnit?.path?.startsWith(me?.orgUnit?.path||"\x00")&&o.checkedOutById===me?.id).length
                  return (
                    <button key={k} onClick={() => { setTaskTab(k); setPage(1); clearSelection() }}
                      className="whitespace-nowrap border-0 border-r border-gray-300 px-3 py-[5px] text-[11px] cursor-pointer transition-all"
                      style={{ fontWeight: taskTab===k?700:400, backgroundColor: taskTab===k?"#496b18":"#fff", color: taskTab===k?"#fff":"#374151" }}>
                      {label}
                      <span className="ml-1 rounded-lg px-[5px] text-[9px] font-bold"
                        style={{ backgroundColor: taskTab===k?"rgba(255,255,255,.25)":"#f3f4f6", color: taskTab===k?"#fff":"#6b7280" }}>{count}</span>
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="relative min-w-[120px] flex-1">
                  <svg className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                  </svg>
                  <input value={tcSearch} onChange={e => setTcSearch(e.target.value)} placeholder="Search…"
                    className="w-full rounded border border-gray-300 bg-gray-50 py-[5px] pl-[26px] pr-2 text-[11px] outline-none"/>
                </div>
                {canCreate && <button onClick={() => setShowCreate(true)} className="whitespace-nowrap rounded border-0 bg-blue-700 px-2.5 py-[5px] text-[11px] font-semibold text-white cursor-pointer">+ New</button>}
              </div>
            </div>

            {/* Info banner */}
            <div className="shrink-0 border-b border-gray-200 px-3.5 py-[5px] text-[10px] font-medium"
              style={{ backgroundColor: taskTab==="TO_PROCESS"?"#fffbeb":"#f5f3ff", color: taskTab==="TO_PROCESS"?"#92400e":"#5b21b6" }}>
              {taskTab==="TO_PROCESS"
                ?"📋 Work orders awaiting checkout — select and Check Out to start processing"
                :"⚙️ Work orders in progress — use Check In when work is complete"}
              {me?.orgUnitId && <span className="ml-2 opacity-70">— {me?.orgUnit?.name || me?.orgUnitId?.slice(0,8)}</span>}
            </div>

            {/* Bulk action bar — shows lifecycle + delete based on selection */}
            {selected.size > 0 && (
              <BulkActionBar selectedIds={selected} orders={tcFiltered} view={view} {...bulkProps}/>
            )}

            <WorkOrderTable orders={tcFiltered} page={page} pageSize={pageSize} setPage={setPage} selected={selected} setSelected={setSelected} onDetail={setDetail} me={me} now={now} tree={tree} taskMode taskTab={taskTab}/>
          </div>
        )}

        {/* ════ ORG ORDERS ════ */}
        {view === "ORG_ORDERS" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3.5 py-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-700">Org Orders</span>
                <span className="rounded-lg bg-[#f5f7f0] px-2 py-px text-[10px] font-bold text-green-700">{orgOrders.length} orders</span>
                {me?.orgUnit?.name && <span className="text-[10px] italic text-gray-400">— {me.orgUnit.name} &amp; sub-units</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <svg className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                  </svg>
                  <input value={orgSearch} onChange={e => { setOrgSearch(e.target.value); setPage(1) }} placeholder="Search keyword…"
                    className="w-[200px] rounded border border-gray-300 bg-gray-50 py-[5px] pl-[26px] pr-2.5 text-[11px] outline-none"/>
                </div>
                {canExport && <button onClick={handleExport} className="whitespace-nowrap rounded border border-gray-300 bg-white px-2 py-1 text-[10px] font-semibold text-gray-700 cursor-pointer">↓ CSV</button>}
                {canCreate && <button onClick={() => setShowCreate(true)} className="whitespace-nowrap rounded border-0 bg-blue-700 px-2 py-1 text-[10px] font-semibold text-white cursor-pointer">+ New</button>}
              </div>
            </div>
            <div className="shrink-0 border-b border-blue-200 bg-blue-50 px-3.5 py-[5px] text-[10px] font-medium text-blue-800">
              🏢 Showing all work orders within your organisational subtree. Use <strong>Order Monitoring</strong> for system-wide visibility.
            </div>
            {selected.size > 0 && (
              <BulkActionBar selectedIds={selected} orders={orgOrders} view={view} {...bulkProps}/>
            )}
            <WorkOrderTable orders={orgOrders} page={page} pageSize={pageSize} setPage={setPage} selected={selected} setSelected={setSelected} onDetail={setDetail} me={me} now={now} tree={tree}/>
          </div>
        )}

        {/* ════ WO MONITORING ════ */}
        {view === "WO_MONITORING" && (
          <WoMonitoring
            tree={tree}
            canViewAll={canViewAll}
            orders={orders}
            onDetail={setDetail}
            liveIndicator={liveIndicator}
            now={now}
            onDrilldown={handleDrilldown}
          />
        )}
      </div>

      {/* ── Modals ── */}
      {detail && (
        <DetailModal
          o={detail} onClose={() => setDetail(null)}
          me={me} tree={tree}
          lifecyclePerms={detailLifecyclePerms}
          canAssign={detailCanAssign}
          lockedByOther={detailLocked}
          checkedOutByName={detail.checkedOutBy?.name ?? null}
          act={async (id, a, payload) => { await act(id, a, payload); setDetail(null) }}
          onDelete={() => handleDelete(detail.id)}
          now={now}
        />
      )}

      {showCreate && canCreate && (
        <CreateModal
          tree={tree}
          onClose={() => setShowCreate(false)}
          onCreate={async (data) => {
            try {
              const o = await create(data)
              setShowCreate(false)
              showToast(`✓ Work order ${o.workOrderNo || o.id.slice(0,8)} created`, "success")
            } catch (e: any) {
              showToast(e.message || "Failed to create work order", "error")
            }
          }}
        />
      )}

      {/* Org-structure picker behind the Order Monitoring "Filter by Org Unit"
          field. Applies straight to `search.orgId`, which omBase already narrows
          on (path prefix match, so sub-units are included), and closes on pick. */}
      {omOrgModal && tree && (
        <OrgStructureModal
          node={tree}
          scopeRoot={tree}
          activeOrgId={search.orgId || null}
          onFilter={id => { sf("orgId", id ?? ""); setOmOrgModal(false) }}
          onClose={() => setOmOrgModal(false)}
          countsByOrg={omOrgCounts ?? undefined}
          countLabel="Work orders"
          filterHint="Filtering narrows this work order list to the selected unit and its sub-units."
        />
      )}

      {/* ── PHOTO LIGHTBOX ── */}
      {woLightbox && me?.photo && (
        <div
          onClick={() => setWoLightbox(false)}
          className="fixed inset-0 z-[3000] flex cursor-pointer items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
        >
          <img
            src={me.photo}
            alt={me?.name || ""}
            onClick={e => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-cover shadow-2xl"
          />
        </div>
      )}
    </div>
  )
}