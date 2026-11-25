"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import UploadPro from "@/components/UploadPro"
import RecentActivityButton from "@/components/RecentActivityButton"
import { useTree } from "@/components/useTree"
import { useBreadcrumbs } from "@/context/BreadcrumbContext"
import BreadcrumbBar from "@/components/BreadcrumbBar"
import { usePermissions } from "@/context/PermissionsContext"
import { usePermissionGuard } from "@/hooks/usePermissionGuard"
import { useLiveChannel } from "@/hooks/useLiveChannel"
import { ORG_TYPE_COLOR, targetTypesFor } from "@/lib/orgStructure"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"

export default function DashboardPage() {
  const [assets, setAssets] = useState<any[]>([])
  const [assetsTotal, setAssetsTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dashboardNodes, setDashboardNodes] = useState<any[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [targetOrgId, setTargetOrgId] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<any>(null)

  const { tree, error: treeError, reloadTree } = useTree()
  const params = useSearchParams()
  const router = useRouter()
  const orgId = params.get("org")

  const [role, setRole] = useState("CHIEF")
  const [isAdmin, setIsAdmin] = useState(false)

  const { breadcrumbs, setBreadcrumbs, pushCrumb } = useBreadcrumbs()

  const getBadgeColor = (count: number) => {
    if (count === 0) return "#94a3b8"
    if (count < 10) return "#22c55e"
    if (count < 30) return "#f59e0b"
    return "#ef4444"
  }

  const {  canSelf } = usePermissions()
  const { ready, allowed, myRole } = usePermissionGuard("view_all_assets")
  const canViewAssets = ready && myRole ? canSelf("view_all_assets") : false

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me")
        if (!res.ok) return
        const user = await res.json()
        setRole(user.role ?? "USER")
        setIsAdmin(["ADMIN", "SUPER_ADMIN"].includes(user.role))
      } catch { }
    }
    loadUser()
  }, [])

  function canUploadUI(role: string) {
    return ["ADMIN", "SUPER_ADMIN", "CHIEF", "DIRECTOR", "MANAGER", "SUPERVISOR", "USER"].includes(role)
  }

  async function loadAssets() {
    setLoading(true)
    try {
      // The dashboard only renders the first 20 rows, but this used to fetch
      // the entire (legacy, 2000-row) list just to slice it. Ask for one page
      // plus the real total instead.
      const url = orgId ? `/api/assets?page=1&pageSize=20&org=${orgId}` : "/api/assets?page=1&pageSize=20"
      const res = await fetch(url)
      if (!res.ok) { setAssets([]); setAssetsTotal(0); return }
      const data = await res.json()
      const items = Array.isArray(data) ? data : data.items || []
      setAssets(items)
      setAssetsTotal(Array.isArray(data) ? items.length : data.total ?? items.length)
    } catch { setAssets([]); setAssetsTotal(0) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadAssets() }, [orgId])

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await fetch(orgId ? `/api/assets/analytics?org=${orgId}` : "/api/assets/analytics")
        if (!res.ok) return
        setAnalytics(await res.json())
      } catch {}
    }
    loadAnalytics()
  }, [orgId])

  useEffect(() => {
    if (!tree || !role) return
    const currentNode = orgId ? findNode(tree, orgId) : tree
    if (!currentNode) return

    // The next tier down for this role. Taken from the shared role→tier map so
    // the dashboard cards line up with what the role is allowed to assign to;
    // a type the current node has no children of falls through to "all direct
    // children" below, which keeps a partially-built tree browsable.
    const childLevel = targetTypesFor(role)[0] ?? ""

    if (!orgId) {
      setBreadcrumbs([{ id: tree.id, name: tree.name, type: tree.type }])
    } else {
      const path = findPath(tree, orgId)
      if (path) setBreadcrumbs(path)
    }

    let nodes: any[] = []
    if (isAdmin) {
      nodes = (currentNode.children || []).map((c: any) => ({
        id: c.id, name: c.name, type: c.type, totalAssets: c.totalAssets || 0
      }))
    } else {
      nodes = collectChildNodesByType(currentNode, childLevel)
      if (nodes.length === 0) {
        nodes = (currentNode.children || []).map((c: any) => ({
          id: c.id, name: c.name, type: c.type, totalAssets: c.totalAssets || 0
        }))
      }
    }

    setDashboardNodes(nodes)
    setTargetOrgId(currentNode.id)
  }, [tree, orgId, role, isAdmin])

  useLiveChannel("/api/assets/events", (payload) => {
    if (payload.event === "created") {
      setAssets(prev => prev.some(a => a.id === payload.asset.id) ? prev : [payload.asset, ...prev].slice(0, 20))
      setAssetsTotal(t => t + 1)
    }
    if (payload.event === "updated") {
      setAssets(prev => prev.map(a => a.id === payload.asset.id ? payload.asset : a))
    }
    if (payload.event === "deleted") {
      setAssets(prev => prev.filter(a => a.id !== payload.asset.id))
      setAssetsTotal(t => Math.max(0, t - 1))
    }
  })

  if (!tree || !role) return (
    <div className="flex h-full items-center justify-center bg-slate-50">
      {treeError ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-semibold text-slate-700">Couldn’t load the organization tree</p>
          <p className="text-xs text-slate-400">{treeError}</p>
          <button
            onClick={() => reloadTree()}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white cursor-pointer hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="h-[9px] w-[9px] rounded-full animate-bounce"
              style={{
                backgroundColor: `hsl(${160 + i * 20}, 70%, 45%)`,
                animationDelay: `${i * 0.18}s`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )

  const typeColor: Record<string, string> = { ...ORG_TYPE_COLOR }

  // Exact counts come from /api/assets/analytics, which aggregates in the
  // database. The client-side fallbacks only ever saw the loaded page (up to
  // 2000 of ~1M rows) and therefore understated every KPI.
  const totalAssets = analytics?.totalAssets ?? assetsTotal
  const operationalCount = analytics?.operationalAssets ?? assets.filter(a => a.operational).length
  const checkedOutCount = analytics?.checkedOutAssets ?? assets.filter(a => a.checkedOut).length
  const operationalPct = totalAssets > 0 ? Math.round((operationalCount / totalAssets) * 100) : 0
  const warrantyExpiring = analytics?.warrantyExpiringAssets ?? assets.filter(a => {
    if (!a.warrantyExpiration) return false
    const days = (new Date(a.warrantyExpiration).getTime() - Date.now()) / 86400000
    return days > 0 && days <= 30
  }).length
  const warrantyExpired = analytics?.warrantyExpiredAssets ?? assets.filter(a => {
    if (!a.warrantyExpiration) return false
    return new Date(a.warrantyExpiration) < new Date()
  }).length

  return (
    <>
      <div className="flex min-h-full flex-col bg-slate-100">

        {/* ── GLOBAL BREADCRUMB BAR ── */}
        <BreadcrumbBar />

        {/* ── STICKY NAV BAR ── */}
        <div className="breadcrumb-bar sticky top-0 z-50 flex min-h-[44px] items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-3 shadow-[0_1px_0_0_#f1f5f9] backdrop-blur-md sm:px-6">
          {breadcrumbs.map((b, i) => (
            <div key={b.id} className="breadcrumb-item flex shrink-0 items-center gap-1">
              <button
                onClick={() => {
                  if (i === 0) router.push("/dashboard")
                  else router.push(`/dashboard?org=${b.id}`)
                  setTargetOrgId(b.id)
                }}
                className={[
                  "whitespace-nowrap rounded-md border-0 px-2.5 py-1 text-[13px] transition-colors cursor-pointer",
                  i === breadcrumbs.length - 1
                    ? "font-bold text-blue-700 bg-blue-50"
                    : "font-normal text-slate-500 hover:bg-slate-100",
                ].join(" ")}
              >
                <span>{b.name}</span>
              </button>
              {i < breadcrumbs.length - 1 && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
                  <path d="M4.5 2.5L7.5 6L4.5 9.5" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}

          {/* live indicator */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <span className="live-dot inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-green-500 animate-pulse" />
            <span className="whitespace-nowrap text-[11px] font-medium text-slate-500">Live</span>
          </div>
        </div>

        {canViewAssets && (
          <div className="page-content flex flex-col gap-2 bg-slate-100 p-2 sm:gap-4 sm:p-4 lg:gap-[18px] lg:p-6">

            {/* ── TOOLBAR ── */}
            <div className="toolbar-row flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-baseline gap-2.5">
                <h1 className="section-title m-0 text-[22px] font-extrabold tracking-tight text-slate-900">
                  Assets
                </h1>
                <span className="whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-bold tracking-wide text-blue-600">
                  {totalAssets.toLocaleString()}
                </span>
              </div>

              <div className="toolbar-actions flex flex-wrap items-center gap-2">
                {/* Search hint */}
                <div className="search-hint hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-400 md:flex">
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                    <circle cx="9" cy="9" r="6" stroke="#94a3b8" strokeWidth="2" />
                    <path d="M14 14l3.5 3.5" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span>Search</span>
                  <kbd className="rounded border border-slate-200 bg-white px-1.5 py-px text-[9px] font-bold text-slate-500">⌘K</kbd>
                </div>

                {/* Reset */}
                {orgId && (
                  <button
                    className="reset-btn cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700"
                    onClick={() => router.push("/dashboard")}
                  >
                    ← Reset
                  </button>
                )}

                {/* Upload */}
                {canUploadUI(role) && (
                  <button
                    onClick={() => setShowUpload(!showUpload)}
                    className={[
                      "whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                      showUpload
                        ? "border-red-300 bg-red-50 text-red-600"
                        : "border-green-600 bg-green-600 text-white animate-[pulse-green_2s_infinite]",
                    ].join(" ")}
                  >
                    {showUpload ? "✕ Close" : "↑ Upload"}
                  </button>
                )}

                {/* View table */}
                {canViewAssets && (
                  <button
                    onClick={() => router.push(orgId ? `/dashboard/assets?org=${orgId}` : "/dashboard/assets")}
                    className="whitespace-nowrap rounded-lg border-0 bg-blue-600 bg-linear-to-br from-blue-600 to-blue-700 px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-blue-500/30 transition-all cursor-pointer hover:-translate-y-px hover:shadow-lg hover:shadow-blue-500/45"
                  >
                    Full Table →
                  </button>
                )}
              </div>
            </div>

            {/* Upload target label */}
            {showUpload && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3.5 py-1.5 text-xs text-slate-500">
                <span className="text-slate-400">Uploading to:</span>
                <span className="font-bold text-blue-600">
                  {isAdmin ? findNodeName(tree, targetOrgId || "") : formatBreadcrumb(breadcrumbs)}
                </span>
              </div>
            )}

            {/* Upload panel */}
            {showUpload && targetOrgId && (
              <UploadPro
                orgUnitId={targetOrgId}
                role={role}
                onSuccess={() => { loadAssets(); setShowUpload(false) }}
              />
            )}

            {/* ── TWO-COLUMN LAYOUT: Assets | Work Orders ── */}
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {/* Asset KPIs column */}
              <div>
                <h2 className="m-0 mb-2.5 text-xs font-bold text-slate-900">Assets</h2>
                <div className="kpi-grid grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 sm:gap-2.5 xl:grid-cols-2">
              {[
                {
                  label: "Total Assets",
                  value: totalAssets,
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <rect x="2" y="7" width="20" height="14" rx="2" stroke="#2563eb" strokeWidth="2" />
                      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="#2563eb" strokeWidth="2" />
                    </svg>
                  ),
                  color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe",
                  sub: null,
                },
                {
                  label: "Operational",
                  value: operationalCount,
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="#16a34a" strokeWidth="2" />
                      <path d="M8 12l3 3 5-5" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ),
                  color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0",
                  sub: operationalPct,
                },
                {
                  label: "Checked Out",
                  value: checkedOutCount,
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2v10m0 0l-3-3m3 3l3-3" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 14v5a1 1 0 001 1h14a1 1 0 001-1v-5" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  ),
                  color: "#d97706", bg: "#fffbeb", border: "#fde68a",
                  sub: null,
                },
                {
                  label: "Warranty Expiring",
                  value: warrantyExpiring,
                  icon: <span className="text-[18px]">⏰</span>,
                  color: "#f59e0b", bg: "#fffbeb", border: "#fde68a",
                  sub: warrantyExpiring > 0 ? "within 30 days" : null,
                },
                {
                  label: "Warranty Expired",
                  value: warrantyExpired,
                  icon: <span className="text-[18px]">⚠️</span>,
                  color: "#dc2626", bg: "#fef2f2", border: "#fecaca",
                  sub: warrantyExpired > 0 ? "needs attention" : null,
                },
              ].map(({ label, value, icon, color, bg, border, sub }, idx) => (
                <div
                  key={label}
                  className={[
                    "kpi-card flex items-center gap-3.5 rounded-[14px] border bg-white px-5 py-[18px] cursor-default transition-all hover:-translate-y-0.5 hover:shadow-lg",
                    idx === 2 ? "sm:col-span-2 md:col-span-1" : "",
                  ].join(" ")}
                  style={{ borderColor: border }}
                >
                  <div
                    className="kpi-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px]"
                    style={{ backgroundColor: bg }}
                  >
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="kpi-label m-0 mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {label}
                    </p>
                    <p className="kpi-value m-0 text-[28px] font-extrabold leading-none tracking-tight text-slate-900">
                      {value.toLocaleString()}
                    </p>
                    {sub !== null && totalAssets > 0 && (
                      <div className="progress-row mt-2">
                        <div className="h-1 overflow-hidden rounded-sm bg-slate-200">
                          <div
                            className="progress-fill h-full rounded-sm animate-[bar-fill_0.8s_cubic-bezier(0.4,0,0.2,1)_forwards]"
                            style={{ backgroundColor: color, width: `${sub}%` }}
                          />
                        </div>
                        <p className="m-0 mt-[3px] text-[10px] font-semibold" style={{ color }}>{sub}% of total</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
                </div>
              </div>

              {/* Work Order KPIs column */}
              <div>
                <h2 className="m-0 mb-2.5 text-xs font-bold text-slate-900">Work Orders</h2>
                {analytics?.workOrders ? (
              <div className="kpi-grid grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 sm:gap-2.5 xl:grid-cols-2">
                {[
                  { label: "Open WOs",   value: analytics.workOrders.open,      color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
                  { label: "Overdue",     value: analytics.workOrders.overdue,    color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
                  { label: "Completed",   value: analytics.workOrders.completed,  color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
                  { label: "MTTR",        value: formatMttr(analytics.workOrders.mttrMs), color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
                ].map(({ label, value, color, border }) => (
                  <div key={label} className="kpi-card rounded-[14px] border bg-white px-[18px] py-4 transition-all hover:-translate-y-0.5 hover:shadow-lg" style={{ borderColor: border }}>
                    <p className="kpi-label m-0 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="kpi-value m-0 text-2xl font-extrabold" style={{ color }}>{typeof value === "number" ? value.toLocaleString() : value}</p>
                  </div>
                ))}
              </div>
                ) : (
                  <p className="text-xs text-slate-400">Loading work order data...</p>
                )}
              </div>
            </div>

            {/* ── WO STATUS CHART ── */}
            {analytics?.workOrders?.byStatus?.length > 0 && (
              <div className="rounded-[14px] border border-slate-200 bg-white px-5 py-4">
                <h2 className="m-0 mb-3 text-sm font-bold text-slate-900">Work Orders by Status</h2>
                <div className="flex flex-wrap items-center gap-6 h-[220px]">
                  <div className="h-[220px] w-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics.workOrders.byStatus.map((s: any) => ({ name: s.status, value: s.count }))}
                          dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}
                        >
                          {analytics.workOrders.byStatus.map((s: any) => (
                            <Cell key={s.status} fill={WO_STATUS_COLOR[s.status] ?? "#94a3b8"} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {analytics.workOrders.byStatus.map((s: any) => (
                      <div key={s.status} className="flex items-center gap-2 text-xs">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: WO_STATUS_COLOR[s.status] ?? "#94a3b8" }} />
                        <span className="font-semibold text-slate-700">{WO_STATUS_LABEL[s.status] ?? s.status}</span>
                        <span className="text-slate-400">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── ORG NODE CARDS ── */}
            {dashboardNodes.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2.5">
                  <p className="m-0 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                    {dashboardNodes[0]?.type ?? "Units"}
                  </p>
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="whitespace-nowrap text-[10px] text-slate-400">{dashboardNodes.length} units</span>
                </div>

                <div className="org-grid grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
                  {dashboardNodes.map((n) => {
                    const accent = typeColor[n.type] ?? "#64748b"
                    return (
                      <div
                        key={n.id}
                        className="org-card relative cursor-pointer rounded-[11px] border border-l-[3px] border-slate-200 bg-white px-3 pt-3 pb-2.5 transition-all hover:-translate-y-[3px] hover:shadow-lg"
                        style={{ borderLeftColor: accent }}
                        onClick={() => {
                          pushCrumb({ id: n.id, name: n.name, type: n.type })
                          router.push(`/dashboard?org=${n.id}`)
                          setTargetOrgId(n.id)
                        }}
                      >
                        <span
                          className="mb-1.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider"
                          style={{ color: accent, backgroundColor: `${accent}18` }}
                        >
                          {n.type}
                        </span>
                        <p className="m-0 text-[13px] font-semibold leading-snug text-slate-900">
                          {n.name}
                        </p>
                        {n.totalAssets > 0 && (
                          <span
                            className="absolute right-2.5 top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                            style={{ backgroundColor: getBadgeColor(n.totalAssets) }}
                          >
                            {n.totalAssets}
                          </span>
                        )}
                        <div className="absolute bottom-2.5 right-3 text-[10px] text-slate-300">
                          →
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── ASSET PREVIEW TABLE ── */}
            <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm">
              {/* Table header row */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-[#fafbfc] px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <h2 className="m-0 text-sm font-bold text-slate-900">
                    {orgId ? "Scoped Assets" : "All Assets"}
                  </h2>
                  {!loading && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                      showing {assets.length} of {totalAssets.toLocaleString()}
                    </span>
                  )}
                </div>
                {totalAssets > 20 && (
                  <button
                    onClick={() => router.push(orgId ? `/dashboard/assets?org=${orgId}` : "/dashboard/assets")}
                    className="border-0 bg-transparent p-0 text-[11px] font-semibold text-blue-600 cursor-pointer hover:text-blue-700"
                  >
                    View all {totalAssets.toLocaleString()} →
                  </button>
                )}
              </div>

              {loading ? (
                <div className="px-5 py-10 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="h-2 w-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <p className="mt-2.5 text-xs text-slate-400">Loading assets…</p>
                </div>
              ) : assets.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <div className="mb-2.5 text-4xl">📦</div>
                  <p className="m-0 mb-1 text-sm font-semibold text-slate-700">No assets found</p>
                  <p className="m-0 text-xs text-slate-400">
                    {canUploadUI(role) ? "Upload assets to get started." : "No assets are assigned to this scope."}
                  </p>
                </div>
              ) : (
                <div className="db-scroll asset-table overflow-auto bg-white max-h-[400px]">
                  <table className="w-full min-w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        {[
                          { label: "Item Code", cls: "" },
                          { label: "Description", cls: "" },
                          { label: "Tag №", cls: "" },
                          { label: "Serial", cls: "table-col-serial-th" },
                        ].map(({ label, cls }) => (
                          <th key={label} className={`table-header-row sticky top-0 z-10 whitespace-nowrap border-b-2 border-slate-200 bg-slate-50 px-4 py-[9px] text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500 ${cls}`}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {assets.slice(0, 20).map((a) => (
                        <tr key={a.id} className="asset-row transition-colors hover:bg-sky-50">
                          <td className="table-body-row whitespace-nowrap border-b border-slate-100 px-4 py-[9px] font-medium text-slate-700">
                            {a.itemCode
                              ? <span className="rounded bg-slate-100 px-1.5 py-px font-mono text-[11px] font-bold text-slate-900">{a.itemCode}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="table-body-row whitespace-nowrap border-b border-slate-100 px-4 py-[9px] text-slate-600 max-w-[260px]">
                            <span className="block truncate">
                              {a.description ?? "—"}
                            </span>
                          </td>
                          <td className="table-body-row whitespace-nowrap border-b border-slate-100 px-4 py-[9px]">
                            {a.tagNumber
                              ? <span className="rounded-[5px] bg-slate-900 px-[7px] py-0.5 font-mono text-[11px] font-bold text-white">{a.tagNumber}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="table-body-row table-col-serial whitespace-nowrap border-b border-slate-100 px-4 py-[9px]">
                            <span className="font-mono text-[11px] text-slate-400">{a.serialNumber ?? "—"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* Recent Activity — moved off the page into a floating button that opens
          the feed on demand. */}
      <RecentActivityButton />
    </>
  )
}

/* ── helpers (unchanged) ── */
function findNode(node: any, id: string): any | null {
  if (node.id === id) return node
  if (!node.children) return null
  for (const c of node.children) {
    const found = findNode(c, id)
    if (found) return found
  }
  return null
}

function findNodeName(node: any, id: string): string {
  if (!id) return ""
  if (node.id === id) return node.name
  if (!node.children) return ""
  for (const c of node.children) {
    const found = findNodeName(c, id)
    if (found) return found
  }
  return ""
}

function collectChildNodesByType(node: any, type: string) {
  if (!node.children) return []
  return node.children
    .filter((c: any) => c.type === type)
    .map((c: any) => ({ id: c.id, name: c.name, type: c.type, totalAssets: c.totalAssets || 0 }))
}

function findPath(node: any, targetId: string, path: any[] = []): any[] | null {
  if (!node) return null
  const newPath = [...path, { id: node.id, name: node.name, type: node.type }]
  if (node.id === targetId) return newPath
  if (node.children) {
    for (const child of node.children) {
      const result = findPath(child, targetId, newPath)
      if (result) return result
    }
  }
  return null
}

function formatBreadcrumb(breadcrumbs: any[]) {
  return breadcrumbs.map(b => b.name).join(" › ")
}

const WO_STATUS_COLOR: Record<string, string> = {
  CREATED: "#f59e0b", ASSIGNED: "#3b82f6", CHECKED_OUT: "#7c3aed",
  IN_PROGRESS: "#b45309", COMPLETED: "#22c55e", ARCHIVED: "#94a3b8",
}
const WO_STATUS_LABEL: Record<string, string> = {
  CREATED: "Initialization", ASSIGNED: "Assigned", CHECKED_OUT: "Processing",
  IN_PROGRESS: "In Progress", COMPLETED: "Completed", ARCHIVED: "Archived",
}

function formatMttr(ms: number): string {
  if (!ms || ms <= 0) return "—"
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}