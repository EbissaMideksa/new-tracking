//components/AdvancedSidebar.tsx
"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { LogOut, Network } from "lucide-react"
import TreeNode from "./TreeNode"
import { useTree } from "./useTree"
import { usePermissions } from "@/context/PermissionsContext"
import LogoutButton from "./LogoutButton"
import OrgStructureModal from "./OrgStructureModal"
export default function AdvancedSidebar({ mobileOpen, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const { tree, expanded, toggle } = useTree()
  // canSelf() already resolves role + this user's personal override (via the
  // context's own /api/me fetch) — no need for this component to fetch its
  // own role separately anymore, and it means a grant/revoke made on the
  // Accounts Management screen now actually changes what shows up here.
  const { canSelf, selfRole, loading: matrixLoading } = usePermissions()
  const pathname = usePathname()
  const router   = useRouter()
  const params   = useSearchParams()

  // Admin-only affordances (the org-structure icon). Same ADMIN / SUPER_ADMIN
  // pair used for scope checks across the API routes.
  const isAdmin = selfRole === "ADMIN" || selfRole === "SUPER_ADMIN"
  // The org filter this sidebar writes and reads (`?org=<id>`).
  const activeOrgId = params.get("org")
  // Which branch the org-structure panel is showing (null = closed).
  const [structureNode, setStructureNode] = useState<any | null>(null)

  const [collapsed, setCollapsed] = useState(false)
  const [width,     setWidth]     = useState(220)
  const resizingRef = useRef(false)

  const isDrawer = mobileOpen === true
  const effectiveCollapsed = isDrawer ? false : collapsed
  useEffect(() => {
    const saved = Number(localStorage.getItem("sidebarWidth"))
    if (saved >= 200) {
      setWidth(Math.min(saved, 240))
    } else {
      // No persisted width — use the responsive --sidebar-width token
      const token = Number(
        getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width")
      )
      if (token >= 56) setWidth(Math.min(Math.max(token, 56), 240))
    }
  }, [])

  // Auto-collapse to an icon rail on tablet/smaller screens so the page
  // keeps a usable content width. Never fights the mobile drawer mode.
  useEffect(() => {
    if (isDrawer) return
    const apply = () => {
      if (window.innerWidth < 768) setCollapsed(true)
    }
    // Defer the initial check to after paint to avoid a synchronous
    // setState-in-effect; the resize listener handles subsequent changes.
    const raf = requestAnimationFrame(apply)
    window.addEventListener("resize", apply)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", apply)
    }
  }, [isDrawer])

  useEffect(() => {
    localStorage.setItem("sidebarWidth", String(width))
  }, [width])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current || collapsed) return
      setWidth(Math.min(Math.max(e.clientX, 200), 500))
    }
    const onUp = () => { resizingRef.current = false }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [collapsed])

  // The context resolves loading once BOTH the role matrix and this user's
  // own overrides have been fetched — same "don't flash items then hide
  // them" guarantee the old roleReady && !matrixLoading check gave us.
  const ready = !matrixLoading

  const showUsers      = ready && canSelf("manage_users")
  const showAudit       = ready && canSelf("view_audit")
  const showAnalytics   = ready && canSelf("view_analytics")
  const showAssets      = ready && canSelf("view_all_assets")
  const showWorkOrders  = ready && canSelf("view_work_orders")
  const showPerms        = ready && canSelf("manage_permissions")
  const showWoPerms      = ready && canSelf("manage_wo_permissions")
  const showOrgTree      = ready && canSelf("manage_org_units")
  const showSettings     = ready && canSelf("system_settings")
  // Accounts Management needs EITHER grant — it's where both admin and WO
  // permission overrides for other users get edited.
  const showAccounts     = ready && (showPerms || showWoPerms)

  // The workorders page owns the full viewport — no global sidebar there.
  if (pathname.startsWith("/dashboard/workorders")) return null

  function NavLink({ href, icon, label }: { href: string; icon: string; label: string }) {
    const active = pathname === href || pathname.startsWith(href + "/")
    return (
      <Link href={href} className="block no-underline">
        <div
          className={[
            "flex items-center gap-2 rounded-md mb-0.5 cursor-pointer transition-colors text-[13px]",
            effectiveCollapsed ? "justify-center py-2" : "justify-start px-2.5 py-2",
            active
              ? "bg-blue-50 text-blue-600 font-semibold"
              : "text-slate-600 hover:bg-slate-100",
          ].join(" ")}
          title={effectiveCollapsed ? label : undefined}
        >
          <span className="text-base shrink-0 leading-none">{icon}</span>
          {!effectiveCollapsed && <span className="truncate">{label}</span>}
        </div>
      </Link>
    )
  }

  // ── Org structure as a filter ───────────────────────────────────────────────
  // Writes the same `?org=<id>` the sidebar rows push, so every surface that
  // reads the org filter (dashboard KPIs, assets list, analytics) narrows to the
  // chosen unit; passing null clears it back to the user's own scope.
  function applyOrgFilter(id: string | null) {
    router.push(id ? `/dashboard?org=${id}` : "/dashboard")
    setStructureNode(null)
  }

  // ── Logout (icon variant in the collapsed rail) ──────────────────────────────
  // Same endpoint + redirect as LogoutButton; duplicated only because that
  // component renders a text label, which cannot fit a 56px rail.
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
    router.push("/login")
  }

  return (
    <>

    <div
      className={[
        "h-full flex flex-col relative bg-gray-50 border-r border-gray-200 shrink-0 overflow-hidden transition-[width] duration-200",
        isDrawer ? "w-full" : collapsed ? "w-14" : "",
      ].join(" ")}
      style={!isDrawer && !collapsed ? { width } : undefined}
    >
      {/* Header */}
      <div className="p-3 flex items-center justify-between border-b border-slate-200">
        {!effectiveCollapsed && <h2 className="font-bold text-base text-gray-700 truncate">ETHIOTELECOM</h2>}
        {isDrawer ? (
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="px-2 py-1 rounded hover:bg-gray-200 text-gray-500"
          >
            ✕
          </button>
        ) : (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="px-2 py-1 rounded hover:bg-gray-200 text-gray-500"
          >
            {collapsed ? "▶" : "◀"}
          </button>
        )}
      </div>

      {/* Body — the only scrollable region. It sits directly under the full-width
          topbar (which carries the logout button), so the org tree and nav links
          scroll here without a pinned footer competing for height. */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-2">

        {/* Org tree — grant-gated by manage_org_units */}
        {showOrgTree && tree && (
          <>
            {/* Org-structure icon — ADMIN / SUPER_ADMIN only. Opens the whole
                structure under the logged-in user (/api/tree is already rooted
                at their own org unit), which doubles as an org filter picker. */}
            {isAdmin && !effectiveCollapsed && (
              <button
                type="button"
                onClick={() => setStructureNode(tree)}
                title="Organizational structure under you"
                aria-label="Show organizational structure under you"
                className={[
                  "flex items-center gap-1.5 w-full px-2 py-1 mb-1 rounded-md text-[11px] font-semibold border-0 cursor-pointer transition-colors",
                  activeOrgId
                    ? "bg-blue-100 text-blue-700"
                    : "bg-transparent text-slate-500 hover:bg-slate-100",
                ].join(" ")}
              >
                <Network size={13} className="shrink-0" />
                <span className="truncate">Org structure</span>
                {activeOrgId && (
                  <span
                    title="An org filter is active"
                    className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0"
                  />
                )}
              </button>
            )}

            <TreeNode
              node={tree}
              expanded={expanded}
              toggle={toggle}
              collapsed={effectiveCollapsed}
              showStructureIcon={isAdmin}
              onShowStructure={setStructureNode}
            />
          </>
        )}

        {/* Matrix-gated nav links */}
        {ready && (
          <div className="border-t border-slate-200 mt-2 pt-2">
            {showAssets      && <NavLink href="/dashboard/assets"               icon="📋" label="Assets" />}
            {showWorkOrders  && <NavLink href="/dashboard/workorders"           icon="🔧" label="Work Orders" />}
            {showUsers       && <NavLink href="/dashboard/users"         icon="👥" label="User Management" />}
            {showAccounts    && <NavLink href="/dashboard/admin/accounts"       icon="🗂️" label="Accounts Management" />}
            {showAudit       && <NavLink href="/dashboard/audit"                icon="📝" label="Audit" />}
            {showAnalytics   && <NavLink href="/dashboard/analytics"            icon="📊" label="Analytics" />}
            {showPerms       && <NavLink href="/dashboard/admin/permissions"    icon="🔐" label="Permissions" />}
            {showWoPerms     && <NavLink href="/dashboard/admin/wo-permissions"  icon="🔐" label="WO-Permissions" />}
            {showOrgTree      && <NavLink href="/dashboard/admin/org-structure" icon="🏗️" label="Org Structure (Legacy)" />}
{showOrgTree      && <NavLink href="/dashboard/organization"         icon="🏢" label="Organization" />}
           {/*  {showOrgTree      && <NavLink href="/dashboard/organization/zones"    icon="🏙️" label="Zones" />}
            {showOrgTree      && <NavLink href="/dashboard/organization/regions"  icon="🌍" label="Regions" />} */}
            {showSettings    && <NavLink href="/dashboard/admin/settings"        icon="⚙️" label="Workspace Settings" />}
          </div>
        )}
      </div>

      {/* Footer — logout. Kept here as well as in the topbar so the action stays
          reachable when the bar scrolls out of view, and so the collapsed icon
          rail still has a way out. Sits outside the scrolling body above, so
          the org tree scrolls independently of it. */}
      <div className="p-3 border-t border-gray-200 shrink-0">
        {effectiveCollapsed ? (
          <button
            type="button"
            onClick={logout}
            title="Logout"
            aria-label="Logout"
            className="w-full flex items-center justify-center py-2 rounded text-gray-500 hover:bg-red-50 hover:text-red-600 cursor-pointer transition-colors"
          >
            <LogOut size={16} />
          </button>
        ) : (
          <LogoutButton fullWidth />
        )}
      </div>

      {/* Resize handle */}
      {!collapsed && !isDrawer && (
        <div
          onMouseDown={() => { resizingRef.current = true }}
          className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-blue-400"
        />
      )}
    </div>

    {/* Org-structure panel — admins only, reflects the branch under this user */}
    {isAdmin && showOrgTree && tree && structureNode && (
      <OrgStructureModal
        node={structureNode}
        scopeRoot={tree}
        activeOrgId={activeOrgId}
        onFilter={applyOrgFilter}
        onClose={() => setStructureNode(null)}
      />
    )}
    </>
  )
}