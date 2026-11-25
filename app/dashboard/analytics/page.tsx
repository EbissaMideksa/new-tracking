// app/dashboard/analytics/page.tsx
"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ComposedChart, Area, Line,
} from "recharts"
import { useLiveChannel } from "@/hooks/useLiveChannel"
import { useTree } from "@/components/useTree"
import { usePermissionGuard } from "@/hooks/usePermissionGuard"
import OrgTree from "@/app/dashboard/(workorders)/workorders/_components/OrgTree"
import {
  Package, PackageCheck, Activity, Users, ClipboardList,
  Lock, RefreshCw, Filter, X, Cpu, Wrench, AlertTriangle,
} from "lucide-react"

// ── Response shape (matches /api/assets/analytics) ──────────────────────────
type AnalyticsData = {
  totalUsers: number
  totalAssets: number
  monthlyUsers: { month: string; users: number }[]
  assetsByType: { type: string; count: number }[]
  activeAssets: number
  inactiveAssets: number
  operationalAssets: number
  nonOperationalAssets: number
  maintainableAssets: number
  checkedOutAssets: number
  assignedAssets: number
  unassignedAssets: number
  assetsByCategory: { category: string; count: number }[]
  assetsByCriticality: { criticality: string; count: number }[]
  monthlyAssets: { month: string; assets: number }[]
  topOrgUnits: { orgUnitId: string; name: string; count: number }[]
  usersByRole: { role: string; count: number }[]
  workOrders: { total: number; open: number; completed: number; byStatus: { status: string; count: number }[] }
  growth: { assetsLast30Days: number; usersLast30Days: number }
  scope: "all" | "own"
  generatedAt: string
}

// ── Palette ─────────────────────────────────────────────────────────────────
const CHART_COLORS = ["#2d7d32", "#1d4ed8", "#7c3aed", "#f59e0b", "#ef4444", "#0ea5e9", "#ec4899", "#64748b"]
const CRITICALITY_COLOR: Record<string, string> = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#22c55e", Unspecified: "#94a3b8" }
const WO_STATUS_COLOR: Record<string, string> = {
  CREATED: "#f59e0b", ASSIGNED: "#3b82f6", CHECKED_OUT: "#7c3aed",
  IN_PROGRESS: "#b45309", COMPLETED: "#22c55e", ARCHIVED: "#94a3b8",
}
const WO_STATUS_LABEL: Record<string, string> = {
  CREATED: "Initialization", ASSIGNED: "Assigned", CHECKED_OUT: "Processing",
  IN_PROGRESS: "In Progress", COMPLETED: "Completed", ARCHIVED: "Archived",
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 100) : 0
}
function formatDuration(ms: number): string {
  if (ms <= 0) return "—"
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

// Recharts tooltip styling is a chart prop, not DOM styling — kept as an object.
const tooltipStyle = {
  fontSize: 11, borderRadius: 6, border: "1px solid #e5e7eb",
  boxShadow: "0 4px 12px rgba(0,0,0,.1)",
}

// ── Presentational bits ─────────────────────────────────────────────────────
function KpiCard({
  icon, label, value, sub, color, bg,
}: {
  icon: React.ReactNode; label: string; value: React.ReactNode
  sub?: React.ReactNode; color: string; bg: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[10px] border border-gray-200 bg-white px-3.5 py-3 shadow-sm">
      <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: bg, color }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
        <div className="text-[22px] font-extrabold leading-tight text-gray-900">{value}</div>
        {sub != null && <div className="mt-0.5 text-[10px] text-gray-400">{sub}</div>}
      </div>
    </div>
  )
}

function SectionCard({ title, right, children, height }: {
  title: string; right?: React.ReactNode; children: React.ReactNode; height?: number
}) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-gray-200 bg-white shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3.5 py-[9px]">
        <span className="text-[13px] font-bold text-slate-700">{title}</span>
        {right}
      </div>
      <div className="flex flex-1 flex-col p-3" style={{ minHeight: height }}>
        {children}
      </div>
    </div>
  )
}

function Empty({ label = "No data" }: { label?: string }) {
  return (
    <div className="flex min-h-[120px] flex-1 items-center justify-center text-xs text-gray-400">
      {label}
    </div>
  )
}

function LegendList({ items }: { items: { name: string; value: number; color: string }[] }) {
  return (
    <div className="flex max-h-[200px] flex-1 flex-col gap-[5px] overflow-y-auto">
      {items.map((d) => (
        <div key={d.name} className="flex items-center gap-[7px] text-[11px]">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-gray-700">{d.name}</span>
          <span className="font-bold text-gray-900">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

function LoadingDots() {
  return (
    <div className="flex h-[300px] items-center justify-center">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[9px] w-[9px] rounded-full bg-[#2d7d32] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { ready, allowed } = usePermissionGuard("view_analytics")
  const { tree } = useTree()

  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [orgId, setOrgId] = useState("")
  const [orgFilterOpen, setOrgFilterOpen] = useState(false)
  const [now, setNow] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // fetchAnalytics has no synchronous setState before its first await.
  const fetchAnalytics = useCallback(async () => {
    const params = new URLSearchParams()
    if (orgId) params.set("org", orgId)
    try {
      const res = await fetch(`/api/assets/analytics?${params}`)
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const json: AnalyticsData = await res.json()
      setData(json)
      setLastUpdated(Date.now())
      setError("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [orgId])

  useEffect(() => { fetchAnalytics() }, [fetchAnalytics])

  // Live updates — debounced refetch on invalidate events
  useLiveChannel<{ event: string }>("/api/analytics/events", () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setRefreshing(true)
      fetchAnalytics()
    }, 600)
  })

  // "updated X ago" ticker (setState only inside the interval callback)
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  function handleRefresh() {
    setRefreshing(true)
    fetchAnalytics()
  }

  // ── Derived chart datasets ────────────────────────────────────────────────
  const typePieData = useMemo(
    () => (data?.assetsByType || []).map((d, i) => ({
      name: d.type, value: d.count, color: CHART_COLORS[i % CHART_COLORS.length],
    })),
    [data]
  )

  const categoryData = useMemo(
    () => (data?.assetsByCategory || []).map((d, i) => ({
      name: truncate(d.category, 20), value: d.count, color: CHART_COLORS[i % CHART_COLORS.length],
    })),
    [data]
  )

  const criticalityData = useMemo(
    () => (data?.assetsByCriticality || []).map((d) => ({
      name: d.criticality, value: d.count, color: CRITICALITY_COLOR[d.criticality] || "#94a3b8",
    })),
    [data]
  )

  const roleData = useMemo(
    () => (data?.usersByRole || []).map((d, i) => ({
      name: d.role, value: d.count, color: CHART_COLORS[i % CHART_COLORS.length],
    })),
    [data]
  )

  const orgData = useMemo(
    () => (data?.topOrgUnits || []).map((d) => ({ name: truncate(d.name, 18), count: d.count })),
    [data]
  )

  const woData = useMemo(
    () => (data?.workOrders.byStatus || []).map((d) => ({
      name: WO_STATUS_LABEL[d.status] || d.status, value: d.count, color: WO_STATUS_COLOR[d.status] || "#94a3b8",
    })),
    [data]
  )

  // Merge monthly users + assets by month label, last 12 months
  const growthData = useMemo(() => {
    if (!data) return []
    const map = new Map<string, { month: string; assets: number; users: number }>()
    for (const m of data.monthlyAssets) map.set(m.month, { month: m.month, assets: m.assets, users: 0 })
    for (const m of data.monthlyUsers) {
      const e = map.get(m.month) || { month: m.month, assets: 0, users: 0 }
      e.users = m.users
      map.set(m.month, e)
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12)
  }, [data])

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!ready) return <LoadingDots />
  if (!allowed) return (
    <div className="flex h-[300px] flex-col items-center justify-center gap-2.5 text-gray-400">
      <Lock size={32} className="text-slate-300" />
      <div className="text-sm font-semibold text-gray-700">Access denied</div>
      <div className="text-xs">You don&apos;t have permission to view analytics.</div>
    </div>
  )
  if (loading) return <LoadingDots />
  if (error && !data) return (
    <div className="p-6 text-[13px] text-red-500">{error}</div>
  )

  const t = data!
  const live = refreshing

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-5 pt-[18px] pb-7">
      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 flex items-center gap-2 text-[22px] font-extrabold text-gray-900">
            <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-green-100 text-[#2d7d32]">
              <Activity size={18} />
            </span>
            Analytics
          </h1>
          <p className="m-0 mt-1 text-xs text-gray-500">
            Asset, user &amp; work-order insights across your organisational scope
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {orgId && (
            <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-800">
              Filtered org unit
              <button onClick={() => setOrgId("")} className="flex bg-transparent border-0 p-0 text-blue-800 cursor-pointer"><X size={11} /></button>
            </span>
          )}

          {/* Org filter */}
          <div className="relative">
            <button onClick={() => setOrgFilterOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold cursor-pointer"
              style={{ backgroundColor: orgId ? "#eff6ff" : "#fff", color: orgId ? "#1e40af" : "#374151" }}>
              <Filter size={13} /> Org Unit
            </button>
            {orgFilterOpen && (
              <>
                <div onClick={() => setOrgFilterOpen(false)} className="fixed inset-0 z-50" />
                <div className="absolute right-0 top-[calc(100%+5px)] z-[51] max-h-[360px] w-[270px] overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
                  <div className="px-1 pt-0.5 pb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    Filter by Org Unit
                  </div>
                  {tree ? (
                    <OrgTree node={tree} selected={orgId} onSelect={(id) => { setOrgId(id === orgId ? "" : id); setOrgFilterOpen(false) }} />
                  ) : (
                    <div className="p-2 text-[11px] text-gray-400">No org tree available</div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Refresh */}
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>

          {/* Live */}
          <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: live ? "#16a34a" : "#9ca3af" }}>
            <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: live ? "#16a34a" : "#cbd5e1" }} />
            {live ? "LIVE" : "live"}
          </span>
          {now > 0 && lastUpdated && (
            <span className="text-[11px] text-gray-400">· updated {formatDuration(now - lastUpdated)} ago</span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* ══ KPI ROW ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <KpiCard icon={<Package size={20} />} label="Total Assets" value={t.totalAssets}
          sub={t.growth.assetsLast30Days ? `+${t.growth.assetsLast30Days} last 30 days` : "no recent additions"} color="#1d4ed8" bg="#dbeafe" />
        <KpiCard icon={<PackageCheck size={20} />} label="Active Assets" value={t.activeAssets}
          sub={`${pct(t.activeAssets, t.totalAssets)}% of total`} color="#15803d" bg="#dcfce7" />
        <KpiCard icon={<Cpu size={20} />} label="Operational" value={t.operationalAssets}
          sub={`${pct(t.operationalAssets, t.totalAssets)}% · ${t.nonOperationalAssets} down`} color="#0ea5e9" bg="#e0f2fe" />
        <KpiCard icon={<Users size={20} />} label="Total Users" value={t.totalUsers}
          sub={t.growth.usersLast30Days ? `+${t.growth.usersLast30Days} last 30 days` : "no recent users"} color="#7c3aed" bg="#ede9fe" />
        <KpiCard icon={<ClipboardList size={20} />} label="Work Orders" value={t.workOrders.total}
          sub={`${t.workOrders.open} open · ${t.workOrders.completed} completed`} color="#b45309" bg="#fef3c7" />
        <KpiCard icon={<Wrench size={20} />} label="Checked Out" value={t.checkedOutAssets}
          sub={`${t.assignedAssets} assigned · ${t.unassignedAssets} free`} color="#dc2626" bg="#fee2e2" />
      </div>

      {/* ══ GROWTH CHART ══════════════════════════════════════════════════════ */}
      <SectionCard title="Growth — New Assets & Users (last 12 months)" height={260}
        right={
          <div className="flex gap-3.5 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#2d7d32]" />Assets</span>
            <span className="flex items-center gap-1.5"><span className="h-[3px] w-2.5 rounded-sm bg-[#1d4ed8]" />Users</span>
          </div>
        }>
        {growthData.length === 0 ? <Empty label="No growth data yet" /> : (
          <div className="h-[230px] w-full">
            <ResponsiveContainer>
              <ComposedChart data={growthData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="assetGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2d7d32" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2d7d32" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9ca3af" }} minTickGap={14} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
                <Area type="monotone" dataKey="assets" name="Assets" stroke="#2d7d32" strokeWidth={2} fill="url(#assetGrad)" />
                <Line type="monotone" dataKey="users" name="Users" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3, fill: "#1d4ed8" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* ══ ROW: Type + Category ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
        <SectionCard title="Assets by Type / Group"
          right={<span className="text-[11px] text-gray-400">{t.totalAssets} total</span>}>
          {typePieData.length === 0 ? <Empty /> : (
            <div className="flex min-h-[200px] flex-1 items-center gap-2.5">
              <div className="h-[200px] w-[52%]">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={typePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={82} paddingAngle={2}>
                      {typePieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1">
                <LegendList items={typePieData} />
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Assets by Category">
          {categoryData.length === 0 ? <Empty /> : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer>
                <BarChart data={categoryData} layout="vertical" margin={{ top: 4, right: 14, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#374151" }} width={120} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="value" name="Assets" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {categoryData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ══ ROW: Criticality + Roles ══════════════════════════════════════════ */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
        <SectionCard title="Assets by Criticality"
          right={<span className="flex items-center gap-1 text-[11px] text-red-700"><AlertTriangle size={12} /> {t.assetsByCriticality.find((c) => c.criticality === "HIGH")?.count || 0} high</span>}>
          {criticalityData.length === 0 ? <Empty /> : (
            <div className="h-[200px] w-full">
              <ResponsiveContainer>
                <BarChart data={criticalityData} margin={{ top: 6, right: 10, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="value" name="Assets" radius={[4, 4, 0, 0]} maxBarSize={56}>
                    {criticalityData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Users by Role"
          right={<span className="text-[11px] text-gray-400">{t.totalUsers} users</span>}>
          {roleData.length === 0 ? <Empty /> : (
            <div className="h-[200px] w-full">
              <ResponsiveContainer>
                <BarChart data={roleData} layout="vertical" margin={{ top: 4, right: 14, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#374151" }} width={100} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="value" name="Users" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {roleData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ══ ROW: Top Org Units + Work Orders ══════════════════════════════════ */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
        <SectionCard title="Top Org Units by Assets">
          {orgData.length === 0 ? <Empty /> : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer>
                <BarChart data={orgData} layout="vertical" margin={{ top: 4, right: 14, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#374151" }} width={110} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="count" name="Assets" fill="#2d7d32" radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Work Orders by Status"
          right={<span className="text-[11px] text-gray-400">{t.workOrders.total} total</span>}>
          {woData.length === 0 ? <Empty label="No work orders" /> : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer>
                <BarChart data={woData} margin={{ top: 6, right: 10, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#6b7280" }} interval={0} angle={-12} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="value" name="Work Orders" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {woData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="pt-0.5 text-center text-[10px] text-gray-400">
        {t.generatedAt && <>Last generated {formatTime(t.generatedAt)} · </>}metrics are scoped to your organisational unit{orgId ? " (filtered)" : ""}.
      </div>
    </div>
  )
}