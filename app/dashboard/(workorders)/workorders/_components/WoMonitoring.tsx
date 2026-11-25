// app/dashboard/(workorders)/workorders/_components/WoMonitoring.tsx
"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { useLiveChannel } from "@/hooks/useLiveChannel"
import OrgTree from "./OrgTree"
import { WorkOrder, STATUS_META, PRIORITY_META, Priority } from "./types"
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Gauge, Layers,
  RefreshCw, Filter, X,
} from "lucide-react"

// ── API response shape ───────────────────────────────────────────────────────
type MonitoringData = {
  generatedAt: string
  scope: "all" | "own"
  range: string
  rangeDays: number
  totals: {
    total: number; open: number; inProgress: number; completed: number
    archived: number; closed: number; overdue: number; completionRate: number
    unassignedOpen: number
  }
  throughput: { createdInRange: number; completedInRange: number; avgCompletionHours: number }
  byStatus: { status: string; count: number }[]
  byPriority: { priority: string; count: number }[]
  byOrgUnit: { orgUnitId: string; name: string; open: number; total: number }[]
  assigneeWorkload: { assigneeId: string; name: string; open: number; total: number }[]
  timeseries: { date: string; created: number; completed: number }[]
  aging: {
    avgOpenAgeMs: number
    byStatus: { status: string; count: number; avgMs: number }[]
  }
  overdue: {
    count: number
    items: {
      id: string; workOrderNo: string | null; title: string | null
      status: string; priority: string | null; scheduledAt: string | null
      orgUnit: string | null; assetTag: string | null; assignee: string | null
      ageMs: number
    }[]
  }
}

type Props = {
  tree: unknown
  canViewAll: boolean
  orders: WorkOrder[]
  onDetail: (o: WorkOrder) => void
  liveIndicator: boolean
  now: number
  onDrilldown: (opts: { status?: string; open?: boolean; overdue?: boolean }) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDuration(ms: number): string {
  if (ms <= 0) return "—"
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`
}

const STATUS_CHART_COLOR: Record<string, string> = {
  CREATED: "#f59e0b",
  ASSIGNED: "#3b82f6",
  CHECKED_OUT: "#7c3aed",
  IN_PROGRESS: "#b45309",
  COMPLETED: "#22c55e",
  ARCHIVED: "#94a3b8",
}

const PRIORITY_CHART_COLOR: Record<string, string> = {
  HIGH: "#ef4444",
  MEDIUM: "#f59e0b",
  LOW: "#22c55e",
}

// Day-range options for the throughput window. "all" = beyond 90 days.
const RANGE_OPTIONS: { key: string; label: string; title: string }[] = [
  { key: "1d", label: "1", title: "Last 1 day" },
  { key: "2d", label: "2", title: "Last 2 days" },
  { key: "3d", label: "3", title: "Last 3 days" },
  { key: "5d", label: "5", title: "Last 5 days" },
  { key: "7d", label: "7", title: "Last 7 days" },
  { key: "15d", label: "15", title: "Last 15 days" },
  { key: "30d", label: "30", title: "Last 30 days" },
  { key: "90d", label: "90", title: "Last 90 days" },
  { key: "all", label: "90+", title: "Beyond 90 days (all time)" },
]

// ── Small presentational helpers ─────────────────────────────────────────────
function KpiCard({
  icon, label, value, sub, color, bg, onClick,
}: {
  icon: React.ReactNode; label: string; value: React.ReactNode
  sub?: React.ReactNode; color: string; bg: string; onClick?: () => void
}) {
  const clickable = !!onClick
  return (
    <div onClick={onClick}
      style={{
        background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb",
        padding: "10px 12px", display: "flex", alignItems: "center", gap: 10,
        boxShadow: "0 1px 2px rgba(0,0,0,.04)", minWidth: 0,
        cursor: clickable ? "pointer" : "default",
        transition: clickable ? "box-shadow .15s, border-color .15s" : undefined,
      }}
      onMouseEnter={clickable ? (e) => { (e.currentTarget as HTMLElement).style.borderColor = color; (e.currentTarget as HTMLElement).style.boxShadow = "0 3px 10px rgba(0,0,0,.08)" } : undefined}
      onMouseLeave={clickable ? (e) => { (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb"; (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 2px rgba(0,0,0,.04)" } : undefined}
      title={clickable ? "Click to view in Order Monitoring" : undefined}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 8, background: bg, color,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#111827", lineHeight: 1.1 }}>{value}</div>
        {sub != null && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

function SectionCard({ title, right, children, height }: {
  title: string; right?: React.ReactNode; children: React.ReactNode; height?: number
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb",
      boxShadow: "0 1px 2px rgba(0,0,0,.04)", display: "flex", flexDirection: "column",
      minWidth: 0, overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 12px", borderBottom: "1px solid #f3f4f6", display: "flex",
        alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{title}</span>
        {right}
      </div>
      <div style={{ padding: 10, flex: 1, minHeight: height, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  )
}

const tooltipStyle = {
  fontSize: 11, borderRadius: 6, border: "1px solid #e5e7eb",
  boxShadow: "0 4px 12px rgba(0,0,0,.1)",
}

// ─────────────────────────────────────────────────────────────────────────────
export default function WoMonitoring({ tree, canViewAll, orders, onDetail, liveIndicator, now, onDrilldown }: Props) {
  const [data, setData] = useState<MonitoringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [range, setRange] = useState<string>("30d")
  const [orgId, setOrgId] = useState("")
  const [orgFilterOpen, setOrgFilterOpen] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef    = useRef<AbortController | null>(null)

  // fetchMonitoring has NO synchronous setState before its first await, so it
  // is safe to call from an effect body (React 19 set-state-in-effect rule).
  const fetchMonitoring = useCallback(async () => {
    // Cancel any in-flight request so a stale response can't overwrite a newer
    // one, and so unmount/range-change releases the HTTP connection at once.
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const params = new URLSearchParams({ range })
    if (orgId) params.set("orgId", orgId)
    try {
      const res = await fetch(`/api/workorders/monitoring?${params}`, { signal: ac.signal })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || `Failed (${res.status})`)
      }
      const json: MonitoringData = await res.json()
      setData(json)
      setLastUpdated(Date.now())
      setError("")
    } catch (e) {
      if (ac.signal.aborted) return // ignore cancellations
      setError(e instanceof Error ? e.message : "Failed to load monitoring data")
    } finally {
      if (!ac.signal.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [range, orgId])

  // Initial load + refetch when range / org filter change
  useEffect(() => { fetchMonitoring() }, [fetchMonitoring])

  // On unmount: cancel any in-flight fetch + pending debounce so we free the
  // HTTP connection immediately and never setState after unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Live: refetch (debounced) on any work-order event
  useLiveChannel<{ event: string }>("/api/workorders/events", () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setRefreshing(true)
      fetchMonitoring()
    }, 600)
  })

  // Safety auto-refresh every 60 s
  useEffect(() => {
    const i = setInterval(() => {
      setRefreshing(true)
      fetchMonitoring()
    }, 60_000)
    return () => clearInterval(i)
  }, [fetchMonitoring])

  function handleRefresh() {
    setRefreshing(true)
    fetchMonitoring()
  }

  // ── Chart datasets ────────────────────────────────────────────────────────
  const statusPieData = useMemo(
    () => (data?.byStatus || []).map((s) => ({
      name: STATUS_META[s.status]?.label || s.status,
      key: s.status,
      value: s.count,
      color: STATUS_CHART_COLOR[s.status] || "#9ca3af",
    })),
    [data]
  )

  const priorityData = useMemo(
    () => (data?.byPriority || []).map((p) => ({
      name: p.priority,
      value: p.count,
      color: PRIORITY_CHART_COLOR[p.priority] || "#9ca3af",
    })),
    [data]
  )

  const orgChartData = useMemo(
    () => (data?.byOrgUnit || [])
      .slice()
      .sort((a, b) => b.open - a.open)
      .map((o) => ({ name: o.name.length > 18 ? o.name.slice(0, 17) + "…" : o.name, open: o.open, total: o.total })),
    [data]
  )

  const assigneeChartData = useMemo(
    () => (data?.assigneeWorkload || [])
      .filter((a) => a.open > 0)
      .map((a) => ({ name: a.name.length > 16 ? a.name.slice(0, 15) + "…" : a.name, open: a.open, total: a.total })),
    [data]
  )

  const agingChartData = useMemo(
    () => (data?.aging.byStatus || [])
      .map((a) => ({ name: STATUS_META[a.status]?.label || a.status, hours: Math.round(a.avgMs / 3_600_000 * 10) / 10, count: a.count }))
      .sort((a, b) => b.hours - a.hours),
    [data]
  )

  const tsData = useMemo(
    () => (data?.timeseries || []).map((d) => ({ ...d, label: shortDate(d.date) })),
    [data]
  )

  const t = data?.totals
  const tp = data?.throughput

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "#9ca3af" }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: "#2d7d32", animation: `bounce .9s ${i * 0.15}s ease-in-out infinite` }} />
        ))}
      </div>
      <span style={{ fontSize: 12 }}>Loading monitoring data…</span>
      <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
    </div>
  )

  if (error && !data) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", fontSize: 13 }}>
      {error}
    </div>
  )

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f5f5f5" }}>
      {/* ══ CONTROL BAR ══════════════════════════════════════════════════ */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "7px 10px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 8,
        position: "relative", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#334155", whiteSpace: "nowrap" }}>WorkOrder Monitoring</span>
          <span style={{
            fontSize: 10, background: canViewAll ? "#dcfce7" : "#fef3c7",
            color: canViewAll ? "#15803d" : "#92400e", borderRadius: 10, padding: "2px 9px", fontWeight: 600,
            whiteSpace: "nowrap",
          }}>
            {data?.scope === "all" ? "All org units" : "Own org subtree"}
          </span>
          {orgId && (
            <span style={{ fontSize: 10, background: "#eff6ff", color: "#1e40af", borderRadius: 10, padding: "2px 9px", fontWeight: 600, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
              Filtered org unit
              <button onClick={() => setOrgId("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#1e40af", padding: 0, display: "flex" }}><X size={11} /></button>
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {/* Range selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, whiteSpace: "nowrap" }}>Days</span>
            <div style={{ display: "flex", border: "1px solid #d1d5db", borderRadius: 5, overflow: "hidden" }}>
              {RANGE_OPTIONS.map((r, i) => (
                <button key={r.key} onClick={() => setRange(r.key)} title={r.title}
                  style={{
                    padding: "4px 8px", fontSize: 11, fontWeight: range === r.key ? 700 : 400,
                    background: range === r.key ? "#496b18" : "#fff", color: range === r.key ? "#fff" : "#374151",
                    border: "none", borderRight: i !== RANGE_OPTIONS.length - 1 ? "1px solid #d1d5db" : "none", cursor: "pointer",
                  }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Org filter */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setOrgFilterOpen((v) => !v)}
              style={{
                padding: "4px 10px", fontSize: 11, fontWeight: 600, background: orgId ? "#eff6ff" : "#fff",
                color: orgId ? "#1e40af" : "#374151", border: "1px solid #d1d5db", borderRadius: 5,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
              }}>
              <Filter size={12} /> Org Unit
            </button>
            {orgFilterOpen && (
              <>
                <div onClick={() => setOrgFilterOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 51, background: "#fff",
                  border: "1px solid #d1d5db", borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,.12)",
                  width: 260, maxHeight: 340, overflowY: "auto", padding: "6px 6px",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", padding: "2px 4px 6px", textTransform: "uppercase", letterSpacing: ".05em" }}>
                    Filter by Org Unit
                  </div>
                  {tree ? (
                    <OrgTree node={tree} selected={orgId} onSelect={(id) => { setOrgId(id === orgId ? "" : id); setOrgFilterOpen(false) }} />
                  ) : (
                    <div style={{ fontSize: 11, color: "#9ca3af", padding: 8 }}>No org tree available</div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Refresh */}
          <button onClick={handleRefresh} disabled={refreshing}
            style={{
              padding: "4px 10px", fontSize: 11, fontWeight: 600, background: "#fff", color: "#374151",
              border: "1px solid #d1d5db", borderRadius: 5, cursor: refreshing ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 5, opacity: refreshing ? 0.6 : 1, whiteSpace: "nowrap",
            }}>
            <RefreshCw size={12} className={refreshing ? "wo-spin" : ""} /> Refresh
          </button>

          {/* Live */}
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: liveIndicator ? "#16a34a" : "#9ca3af", whiteSpace: "nowrap" }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", background: liveIndicator ? "#16a34a" : "#cbd5e1",
              display: "inline-block", animation: liveIndicator ? "pulse 1.5s infinite" : "none",
            }} />
            {liveIndicator ? "LIVE" : "live"}
          </span>
          {lastUpdated && (
            <span style={{ fontSize: 10, color: "#9ca3af" }}>· updated {formatDuration(now - lastUpdated)} ago</span>
          )}
        </div>
      </div>

      {/* ══ SCROLL BODY ════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 6, padding: "6px 10px", fontSize: 11 }}>
            {error}
          </div>
        )}

        {/* ── KPI ROW ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 6 }}>
          <KpiCard icon={<Layers size={20} />} label="Total Orders" value={t?.total ?? 0} color="#1d4ed8" bg="#dbeafe"
            onClick={() => onDrilldown({})} />
          <KpiCard icon={<Activity size={20} />} label="Open / Active" value={t?.open ?? 0}
            sub={`${t?.inProgress ?? 0} in progress`} color="#7c3aed" bg="#ede9fe"
            onClick={() => onDrilldown({ open: true })} />
          <KpiCard icon={<Clock size={20} />} label="In Progress" value={t?.inProgress ?? 0} color="#b45309" bg="#fef3c7"
            onClick={() => onDrilldown({ status: "IN_PROGRESS" })} />
          <KpiCard icon={<CheckCircle2 size={20} />} label="Completed" value={t?.completed ?? 0}
            sub={`${t?.archived ?? 0} archived`} color="#15803d" bg="#dcfce7"
            onClick={() => onDrilldown({ status: "COMPLETED" })} />
          <KpiCard icon={<AlertTriangle size={20} />} label="Overdue" value={t?.overdue ?? 0}
            sub={t?.overdue ? "past scheduled date" : "on schedule"} color={t?.overdue ? "#dc2626" : "#6b7280"} bg={t?.overdue ? "#fee2e2" : "#f3f4f6"}
            onClick={() => onDrilldown({ overdue: true })} />
          <KpiCard icon={<Gauge size={20} />} label="Completion Rate" value={`${t?.completionRate ?? 0}%`}
            sub={`${t?.closed ?? 0} closed / ${t?.total ?? 0}`} color="#0ea5e9" bg="#e0f2fe" />
        </div>

        {/* ── THROUGHPUT STRIP ── */}
        <div style={{
          background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", padding: "8px 10px",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>
            Throughput · {(data?.rangeDays ?? 30) > 0 ? `last ${data?.rangeDays ?? 30} days` : "all time"}
          </span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Metric label="Created" value={tp?.createdInRange ?? 0} color="#2d7d32" />
            <Metric label="Completed" value={tp?.completedInRange ?? 0} color="#1d4ed8" />
            <Metric label="Avg Completion" value={`${tp?.avgCompletionHours ?? 0}h`} color="#7c3aed" />
            <Metric label="Avg Open Age" value={formatDuration(data?.aging.avgOpenAgeMs ?? 0)} color="#b45309" />
            <Metric label="Unassigned (open)" value={t?.unassignedOpen ?? 0} color="#64748b" />
          </div>
        </div>

        {/* ── CHARTS ROW 1 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
          {/* Status donut */}
          <SectionCard title="Status Distribution"
            right={<span style={{ fontSize: 10, color: "#9ca3af" }}>{t?.total ?? 0} orders</span>}>
            {statusPieData.length === 0 ? (
              <Empty />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minHeight: 180, flexDirection: "column" }}>
                <div style={{ width: "100%", height: 160, cursor: "pointer" }} title="Click a slice to filter Order Monitoring by status">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={statusPieData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={2}
                        onClick={(d) => { const key = (d as { key?: string; payload?: { key?: string } })?.key ?? (d as { payload?: { key?: string } })?.payload?.key; if (key) onDrilldown({ status: key }) }}>
                        {statusPieData.map((d) => <Cell key={d.key} fill={d.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", maxHeight: 160, width: "100%" }}>
                  {statusPieData.map((d) => (
                    <button key={d.key} onClick={() => onDrilldown({ status: d.key })}
                      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, background: "none", border: "none", cursor: "pointer", padding: "1px 0", textAlign: "left" }}
                      title={`Filter by ${d.name}`}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                      <span style={{ fontWeight: 700, color: "#111827" }}>{d.value}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Throughput time-series */}
          <SectionCard title={`${(data?.rangeDays ?? 30) > 0 ? "Daily" : "Monthly"} Throughput (Created vs Completed)`}
            right={
              <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#6b7280" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#2d7d32" }} />Created</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#1d4ed8" }} />Completed</span>
              </div>
            }>
            {tsData.length === 0 ? (
              <Empty />
            ) : (
              <div style={{ width: "100%", height: 180 }}>
                <ResponsiveContainer>
                  <BarChart data={tsData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} interval="preserveStartEnd" minTickGap={18} />
                    <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
                    <Bar dataKey="created" fill="#2d7d32" radius={[2, 2, 0, 0]} maxBarSize={16} />
                    <Bar dataKey="completed" fill="#1d4ed8" radius={[2, 2, 0, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── CHARTS ROW 2 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
          {/* Priority */}
          <SectionCard title="Priority Breakdown">
            {priorityData.length === 0 ? <Empty /> : (
              <div style={{ width: "100%", height: 170 }}>
                <ResponsiveContainer>
                  <BarChart data={priorityData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={48}>
                      {priorityData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          {/* Org units by open */}
          <SectionCard title="Top Org Units by Open Orders">
            {orgChartData.length === 0 ? <Empty /> : (
              <div style={{ width: "100%", height: 170 }}>
                <ResponsiveContainer>
                  <BarChart data={orgChartData} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: "#9ca3af" }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "#374151" }} width={110} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
                    <Bar dataKey="open" name="Open" fill="#2d7d32" radius={[0, 3, 3, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          {/* Assignee workload */}
          <SectionCard title="Assignee Workload (Open)"
            right={<span style={{ fontSize: 10, color: "#9ca3af" }}>{t?.unassignedOpen ?? 0} unassigned</span>}>
            {assigneeChartData.length === 0 ? <Empty /> : (
              <div style={{ width: "100%", height: 170 }}>
                <ResponsiveContainer>
                  <BarChart data={assigneeChartData} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: "#9ca3af" }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "#374151" }} width={100} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
                    <Bar dataKey="open" name="Open" fill="#7c3aed" radius={[0, 3, 3, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── AGING / SLA ── */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) 2fr", gap: 12 }}>
          <SectionCard title="SLA · Average Age by Status (hours)">
            {agingChartData.length === 0 ? <Empty /> : (
              <div style={{ width: "100%", height: 170 }}>
                <ResponsiveContainer>
                  <BarChart data={agingChartData} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: "#9ca3af" }} allowDecimals={false} unit="h" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "#374151" }} width={120} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} formatter={(v) => [`${v}h`, "Avg age"]} />
                    <Bar dataKey="hours" name="Avg age" fill="#b45309" radius={[0, 3, 3, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          {/* Overdue list */}
          <SectionCard title={`Overdue Work Orders (${data?.overdue.count ?? 0})`}
            right={data?.overdue.count ? <span style={{ fontSize: 10, color: "#dc2626", fontWeight: 600 }}>⚠ needs attention</span> : undefined}>
            {(data?.overdue.items.length ?? 0) === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "#16a34a", fontSize: 12, gap: 6 }}>
                <CheckCircle2 size={16} /> No overdue work orders — everything is on schedule.
              </div>
            ) : (
              <div style={{ flex: 1, overflow: "auto", maxHeight: 240 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                    <tr style={{ background: "#f9fafb" }}>
                      {["WO No.", "Subject", "Status", "Prio", "Scheduled", "Age", "Org Unit", "Assignee", ""].map((h, i) => (
                        <th key={i} style={{ padding: "5px 8px", textAlign: "left", fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".04em", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data!.overdue.items.map((o) => {
                      const sm = STATUS_META[o.status] ?? STATUS_META.CREATED
                      const pm = o.priority ? PRIORITY_META[o.priority as Priority] : null
                      return (
                        <tr key={o.id} style={{ borderBottom: "1px solid #f3f4f6" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#fef2f2" }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}>
                          <td style={{ padding: "5px 8px", fontFamily: "monospace", fontSize: 10, color: "#1d4ed8", fontWeight: 600, whiteSpace: "nowrap" }}>{o.workOrderNo || o.id.slice(0, 10)}</td>
                          <td style={{ padding: "5px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827" }}>{o.title || "—"}</td>
                          <td style={{ padding: "5px 8px" }}>
                            <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 2, color: sm.color, background: sm.bg, border: `1px solid ${sm.border}`, whiteSpace: "nowrap" }}>{sm.label}</span>
                          </td>
                          <td style={{ padding: "5px 8px" }}>
                            {pm ? <span style={{ fontSize: 9, fontWeight: 700, color: pm.color }}>● {o.priority}</span> : "—"}
                          </td>
                          <td style={{ padding: "5px 8px", fontSize: 10, color: "#6b7280", whiteSpace: "nowrap" }}>{o.scheduledAt ? shortDate(o.scheduledAt) : "—"}</td>
                          <td style={{ padding: "5px 8px", fontFamily: "monospace", fontSize: 10, color: "#dc2626", fontWeight: 600, whiteSpace: "nowrap" }}>{formatDuration(o.ageMs)}</td>
                          <td style={{ padding: "5px 8px", fontSize: 10, color: "#374151", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.orgUnit || "—"}</td>
                          <td style={{ padding: "5px 8px", fontSize: 10, color: "#374151", whiteSpace: "nowrap" }}>{o.assignee || "—"}</td>
                          <td style={{ padding: "5px 8px" }}>
                            <button onClick={() => {
                              const full = orders.find((x) => x.id === o.id)
                              if (full) onDetail(full)
                            }} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 2, background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>View</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        .wo-spin{animation:wo-spin 0.8s linear infinite}
        @keyframes wo-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
      `}</style>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: React.ReactNode; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
      <span style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color }}>{value}</span>
    </div>
  )
}

function Empty() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "#9ca3af", fontSize: 11, minHeight: 120 }}>
      No data
    </div>
  )
}
