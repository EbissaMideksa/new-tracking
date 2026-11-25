// app/dashboard/audit/page.tsx
"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { usePermissions } from "@/context/PermissionsContext"
import { usePermissionGuard } from "@/hooks/usePermissionGuard"
import { useLiveChannel } from "@/hooks/useLiveChannel"
import { useTree } from "@/components/useTree"
import OrgStructureModal from "@/components/OrgStructureModal"
import {
  Users, Package, ClipboardList, Activity, Search, Download, RefreshCw,
  X, Lock, Mail, Building2, FileJson, Filter,
  ShieldCheck, Settings, LogIn, ClipboardCheck, PackagePlus,
} from "lucide-react"

// ── Types ───────────────────────────────────────────────────────────────────
type AuditEntry = {
  id: string
  action: string
  actionType: string
  performedByName: string
  performedByEmail: string | null
  performedByOrgUnit: string | null
  targetUserName: string | null
  targetUserEmail: string | null
  targetAssetId: string | null
  targetAsset: string | null
  timestamp: string
  metadata: unknown
}
type Summary = { total: number; byType: { actionType: string; count: number }[] }

// ── Action-type metadata ────────────────────────────────────────────────────
const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  USER_MANAGEMENT: { label: "User Management", icon: <Users size={15} />, color: "#1d4ed8", bg: "#dbeafe", border: "#bfdbfe" },
  ASSET_ASSIGNMENT: { label: "Asset Assignment", icon: <Package size={15} />, color: "#15803d", bg: "#dcfce7", border: "#bbf7d0" },
  ASSET_MANAGEMENT: { label: "Asset Management", icon: <PackagePlus size={15} />, color: "#0891b2", bg: "#cffafe", border: "#a5f3fc" },
  WORK_ORDER_ASSIGNMENT: { label: "Work Order Assignment", icon: <ClipboardList size={15} />, color: "#7c3aed", bg: "#ede9fe", border: "#ddd6fe" },
  WORK_ORDER: { label: "Work Order", icon: <ClipboardCheck size={15} />, color: "#b45309", bg: "#fef3c7", border: "#fcd34d" },
  PERMISSION_MANAGEMENT: { label: "Permissions", icon: <ShieldCheck size={15} />, color: "#be123c", bg: "#ffe4e6", border: "#fecdd3" },
  SETTINGS: { label: "Settings", icon: <Settings size={15} />, color: "#0ea5e9", bg: "#e0f2fe", border: "#bae6fd" },
  AUTH: { label: "Authentication", icon: <LogIn size={15} />, color: "#64748b", bg: "#f1f5f9", border: "#e2e8f0" },
}
function typeMeta(t: string) {
  return TYPE_META[t] || { label: t.replace(/_/g, " "), icon: <Activity size={15} />, color: "#64748b", bg: "#f1f5f9", border: "#e2e8f0" }
}

const DATE_RANGES = [
  { key: "all", label: "All time" },
  { key: "1d", label: "Last 1 day" },
  { key: "2d", label: "Last 2 days" },
  { key: "3d", label: "Last 3 days" },
  { key: "5d", label: "Last 5 days" },
  { key: "7d", label: "Last 7 days" },
  { key: "15d", label: "Last 15 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "beyond90", label: "Beyond 90 days" },
] as const
type DateRange = (typeof DATE_RANGES)[number]["key"]

const DAY_MS = 86_400_000
const PAGE_SIZE = 25

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatRelative(ms: number): string {
  if (ms < 0) return "just now"
  const s = Math.floor(ms / 1000)
  if (s < 60) return "just now"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return ""
}
function formatAbs(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
function targetLabel(e: AuditEntry): string {
  if (e.targetUserName) return e.targetUserName
  if (e.targetAsset) return e.targetAsset
  if (e.targetAssetId) return e.targetAssetId.slice(0, 8)
  return "—"
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AuditPage() {
  const { canSelf } = usePermissions()
  const { ready, allowed, myRole } = usePermissionGuard("view_audit")

  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, byType: [] })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")

  const [typeFilter, setTypeFilter] = useState("")
  const [search, setSearch] = useState("")
  const [performer, setPerformer] = useState("")
  const [dateRange, setDateRange] = useState<DateRange>("all")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AuditEntry | null>(null)
  const [now, setNow] = useState(0)

  // ── Org-structure filter ──────────────────────────────────────────────────
  // Audit rows carry no unit of their own, so this narrows by the PERFORMER's
  // org-unit subtree (`performedByOrgUnitId` on the API). Counts in the picker
  // come from /api/org/metrics?metric=audit.
  const { tree }        = useTree()
  const [orgId,         setOrgId]         = useState("")
  const [orgFilterOpen, setOrgFilterOpen] = useState(false)
  const [orgCounts,     setOrgCounts]     = useState<Record<string, number> | null>(null)

  // Node id → display name, for the filter button's active-state label.
  const orgLabels = useMemo(() => {
    const out: Record<string, string> = {}
    function walk(n: { id: string; name: string; children?: unknown[] }) {
      out[n.id] = n.name
      for (const c of (n.children ?? []) as { id: string; name: string; children?: unknown[] }[]) walk(c)
    }
    if (tree) walk(tree)
    return out
  }, [tree])

  // Audit-entries-per-unit counts — loaded the first time the picker opens.
  useEffect(() => {
    if (!orgFilterOpen || orgCounts) return
    fetch("/api/org/metrics?metric=audit")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.counts) setOrgCounts(d.counts as Record<string, number>) })
      .catch(() => {})
  }, [orgFilterOpen, orgCounts])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // fetchAudit has no synchronous setState before its first await.
  const fetchAudit = useCallback(async () => {
    const params = new URLSearchParams()
    if (typeFilter) params.set("type", typeFilter)
    if (orgId)      params.set("performedByOrgUnitId", orgId)
    try {
      const res = await fetch(`/api/audit?${params}`)
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const json: { logs: AuditEntry[]; summary: Summary } = await res.json()
      setLogs(json.logs)
      setSummary(json.summary)
      setError("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit logs")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [typeFilter, orgId])

  useEffect(() => {
    if (allowed) fetchAudit()
  }, [allowed, fetchAudit])

  // Live: debounced refetch on any audit event (created / invalidate).
  // The SSE "created" payload is a raw audit row (different shape), so we
  // refetch rather than prepend to keep the data consistent.
  useLiveChannel<{ event: string }>("/api/audit/events", () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setRefreshing(true)
      fetchAudit()
    }, 600)
  })

  // "x ago" ticker (setState only inside the interval callback)
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  function handleRefresh() {
    setRefreshing(true)
    fetchAudit()
  }

  // ── All hooks below MUST stay above any early return (rules-of-hooks) ──────

  // Performer options (from loaded logs)
  const performers = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of logs) map.set(e.performedByEmail || e.performedByName, e.performedByName)
    return [...map.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [logs])

  // Date filter bound (uses `now` state, not Date.now(), to stay pure).
  // "Nd" → last N days (lower bound); "beyond90" → older than 90 days (upper bound).
  const dateBound = useMemo<{ from: number; to: number }>(() => {
    if (dateRange === "all" || !now) return { from: 0, to: Number.MAX_SAFE_INTEGER }
    if (dateRange === "beyond90") return { from: 0, to: now - 90 * DAY_MS }
    const m = /^(\d+)d$/.exec(dateRange)
    const n = m ? Number(m[1]) : 0
    return { from: now - n * DAY_MS, to: Number.MAX_SAFE_INTEGER }
  }, [dateRange, now])

  // Filtered dataset
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return logs.filter((e) => {
      if (typeFilter && e.actionType !== typeFilter) return false
      if (performer && e.performedByName !== performer) return false
      const ts = new Date(e.timestamp).getTime()
      if (ts < dateBound.from || ts > dateBound.to) return false
      if (q) {
        const hay = [e.action, e.performedByName, e.performedByEmail, e.targetUserName, e.targetUserEmail, e.targetAsset, e.actionType]
          .filter(Boolean).join(" ").toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [logs, typeFilter, performer, dateBound, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // ── Filter handlers reset pagination (no effect needed) ───────────────────
  const changeType = (v: string) => { setTypeFilter(v); setPage(1) }
  const changeSearch = (v: string) => { setSearch(v); setPage(1) }
  const changePerformer = (v: string) => { setPerformer(v); setPage(1) }
  const changeDate = (v: DateRange) => { setDateRange(v); setPage(1) }
  const clearFilters = () => { setTypeFilter(""); setSearch(""); setPerformer(""); setDateRange("all"); setOrgId(""); setPage(1) }

  // ── Guards (after all hooks) ──────────────────────────────────────────────
  if (!ready) return <Spinner color="#2d7d32" />
  if (!allowed) return <AccessDenied />

  const canExport = myRole ? canSelf("export_audit") : false

  // ── Export ────────────────────────────────────────────────────────────────
  function exportCSV() {
    const headers = ["Timestamp", "Type", "Action", "Performed By", "Email", "Org Unit", "Target", "Target Email/Asset"]
    const rows = filtered.map((e) => [
      formatAbs(e.timestamp), e.actionType, e.action, e.performedByName,
      e.performedByEmail ?? "", e.performedByOrgUnit ?? "",
      e.targetUserName ?? "", e.targetUserEmail ?? e.targetAsset ?? "",
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // ── Loading / error (after hooks + guards) ────────────────────────────────
  if (loading) return <Spinner color="#2d7d32" />
  if (error && logs.length === 0) return (
    <div className="p-6 text-[13px] text-red-500">{error}</div>
  )

  // Always show every known category (incl. User Management) even at 0 count,
  // then append any action types present in the data that aren't predefined.
  const countMap = new Map(summary.byType.map((b) => [b.actionType, b.count]))
  const knownTypes = Object.keys(TYPE_META)
  const knownSet = new Set(knownTypes)
  const typeChips = [
    { actionType: "", count: summary.total },
    ...knownTypes.map((actionType) => ({ actionType, count: countMap.get(actionType) ?? 0 })),
    ...summary.byType.filter((b) => !knownSet.has(b.actionType)).map((b) => ({ actionType: b.actionType, count: b.count })),
  ]

  return (
    <div className="mx-auto flex max-w-[1300px] flex-col gap-3.5 px-5 pt-[18px] pb-7 [font-family:system-ui,sans-serif]">
      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 flex items-center gap-2 text-[22px] font-extrabold text-gray-900">
            <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <ClipboardList size={18} />
            </span>
            Audit Logs
          </h1>
          <p className="m-0 mt-1 flex items-center gap-2 text-xs text-gray-500">
            Viewing as <span className="font-semibold text-slate-700">{myRole}</span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold" style={{ color: refreshing ? "#16a34a" : "#9ca3af" }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: refreshing ? "#16a34a" : "#cbd5e1" }} />
              {refreshing ? "LIVE" : "live"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
          {canExport && (
            <button onClick={exportCSV} className="flex items-center gap-1.5 rounded-lg border-0 bg-[#2d7d32] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer">
              <Download size={13} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {/* ══ TYPE CHIPS / STATS ═══════════════════════════════════════════════ */}
      <div className="flex flex-wrap gap-2">
        {typeChips.map((c) => {
          const isAll = c.actionType === ""
          const meta = isAll ? null : typeMeta(c.actionType)
          const active = typeFilter === c.actionType
          return (
            <button key={c.actionType || "all"} onClick={() => changeType(c.actionType)}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-all"
              style={{
                borderColor: active ? (meta ? meta.color : "#2d7d32") : "#e5e7eb",
                backgroundColor: active ? (meta ? meta.bg : "#dcfce7") : "#fff",
              }}>
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-md"
                style={{ backgroundColor: meta ? meta.bg : "#f1f5f9", color: meta ? meta.color : "#64748b" }}>
                {meta ? meta.icon : <Activity size={15} />}
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span className="text-xs font-bold" style={{ color: active ? (meta ? meta.color : "#15803d") : "#334155" }}>{isAll ? "All Activity" : meta!.label}</span>
                <span className="text-[10px] text-gray-400">{c.count} {c.count === 1 ? "entry" : "entries"}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* ══ FILTER BAR ═══════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => changeSearch(e.target.value)} placeholder="Search action, user, email, asset…"
            className="w-full box-border rounded-lg border border-gray-200 py-[7px] pl-[30px] pr-3 text-xs outline-none" />
        </div>
        {/* Performer */}
        <select value={performer} onChange={(e) => changePerformer(e.target.value)}
          className="max-w-[200px] rounded-lg border border-gray-200 bg-white px-2.5 py-[7px] text-xs text-gray-700 cursor-pointer">
          <option value="">All performers</option>
          {performers.map((p) => <option key={p.key} value={p.name}>{p.name}</option>)}
        </select>
        {/* Date range dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-gray-400">Date</span>
          <select value={dateRange} onChange={(e) => changeDate(e.target.value as DateRange)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-[7px] text-xs text-gray-700 cursor-pointer">
            {DATE_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        {/* Org-structure filter (performer's unit + sub-units) */}
        <button onClick={() => setOrgFilterOpen(true)} title="Filter by org structure"
          className="flex items-center gap-1.5 rounded-lg border px-[11px] py-[7px] text-[11px] font-semibold cursor-pointer"
          style={{
            backgroundColor: orgId ? "#eff6ff" : "#fff",
            color: orgId ? "#1d4ed8" : "#374151",
            borderColor: orgId ? "#bfdbfe" : "#e5e7eb",
          }}>
          <Filter size={12} /> {orgId ? orgLabels[orgId] || "Org unit" : "Org structure"}
        </button>
        {(typeFilter || search || performer || dateRange !== "all" || orgId) && (
          <button onClick={clearFilters}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-[11px] py-[7px] text-[11px] font-semibold text-gray-500 cursor-pointer">
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* ══ TABLE ════════════════════════════════════════════════════════════ */}
      <div className="overflow-hidden rounded-[10px] border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50">
                {["Action", "Performed By", "Target", "When"].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-gray-200 px-3.5 py-[9px] text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-[44px] text-center text-[13px] text-gray-400">
                    <div className="flex flex-col items-center gap-1.5">
                      <ClipboardList size={26} className="text-slate-300" />
                      No audit entries match your filters
                    </div>
                  </td>
                </tr>
              ) : pageRows.map((e) => {
                const meta = typeMeta(e.actionType)
                const rel = now ? formatRelative(now - new Date(e.timestamp).getTime()) : ""
                return (
                  <tr key={e.id} onClick={() => setSelected(e)}
                    className="cursor-pointer border-b border-gray-100 odd:bg-white even:bg-gray-50 hover:bg-green-50">
                    <td className="max-w-[360px] px-3.5 py-[9px]">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: meta.bg, color: meta.color }}>{meta.icon}</span>
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium text-gray-900">{e.action}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-[9px]">
                      <div className="font-semibold text-slate-700">{e.performedByName}</div>
                      <div className="flex items-center gap-1 text-[10px] text-gray-400">
                        {e.performedByEmail && <><Mail size={9} /> {e.performedByEmail}</>}
                        {e.performedByOrgUnit && <><span className="mx-1">·</span><Building2 size={9} /> {e.performedByOrgUnit}</>}
                      </div>
                    </td>
                    <td className="px-3.5 py-[9px] text-slate-600">
                      {targetLabel(e) === "—" ? <span className="text-slate-300">—</span> : <span className="font-medium">{targetLabel(e)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-[9px]">
                      <div className="text-[11px] text-slate-700">{formatAbs(e.timestamp)}</div>
                      {rel && <div className="text-[10px] text-gray-400">{rel}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gray-50 px-3.5 py-2 text-[11px] text-gray-500">
          <span>
            {filtered.length === 0 ? "0 entries" : <>{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} entries</>}
            {typeFilter && summary.total > filtered.length && <span className="text-gray-400"> · {summary.total} total in scope</span>}
          </span>
          <div className="flex items-center gap-1">
            <PagerBtn label="‹" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} />
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i
              return p <= totalPages ? (
                <button key={p} onClick={() => setPage(p)}
                  className="h-6 w-[26px] rounded border text-[11px] cursor-pointer"
                  style={{
                    backgroundColor: p === currentPage ? "#2d7d32" : "#fff",
                    color: p === currentPage ? "#fff" : "#374151",
                    borderColor: p === currentPage ? "#2d7d32" : "#e5e7eb",
                    fontWeight: p === currentPage ? 700 : 400,
                  }}>{p}</button>
              ) : null
            })}
            <PagerBtn label="›" onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} />
          </div>
        </div>
      </div>

      {/* ══ DETAIL MODAL ══════════════════════════════════════════════════════ */}
      {selected && <DetailModal entry={selected} onClose={() => setSelected(null)} now={now} />}

      {/* Org-structure filter — narrows by the performer's unit subtree. */}
      {orgFilterOpen && tree && (
        <OrgStructureModal
          node={tree}
          scopeRoot={tree}
          activeOrgId={orgId || null}
          onFilter={(id) => { setOrgId(id ?? ""); setOrgFilterOpen(false); setPage(1) }}
          onClose={() => setOrgFilterOpen(false)}
          countsByOrg={orgCounts ?? undefined}
          countLabel="Audit entries"
          filterHint="Filtering narrows this audit list to entries performed by users in the selected unit and its sub-units."
        />
      )}
    </div>
  )
}

// ── Small components ─────────────────────────────────────────────────────────
function Spinner({ color }: { color: string }) {
  return (
    <div className="flex h-[300px] items-center justify-center">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[9px] w-[9px] rounded-full animate-bounce" style={{ backgroundColor: color, animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  )
}

function AccessDenied() {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center gap-2.5 text-gray-400">
      <Lock size={32} className="text-slate-300" />
      <div className="text-sm font-semibold text-gray-700">Access denied</div>
      <div className="text-xs">You don&apos;t have permission to view audit logs.</div>
    </div>
  )
}

function PagerBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="h-6 w-[26px] rounded border border-gray-200 bg-white text-xs text-gray-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
      {label}
    </button>
  )
}

function DetailModal({ entry, onClose, now }: { entry: AuditEntry; onClose: () => void; now: number }) {
  const meta = typeMeta(entry.actionType)
  const rel = now ? formatRelative(now - new Date(entry.timestamp).getTime()) : ""
  const hasMeta = entry.metadata != null && entry.metadata !== ""
  const metaObj = (typeof entry.metadata === "object" && entry.metadata !== null ? (entry.metadata as Record<string, unknown>) : null)
  const isPermissions = metaObj?.kind === "permissions"
  const permChanges: { role: string; added: string[]; removed: string[] }[] =
    isPermissions && Array.isArray(metaObj?.changes) ? (metaObj!.changes as { role: string; added: string[]; removed: string[] }[]) : []
  const fieldChanges: { field: string; from: unknown; to: unknown }[] =
    !isPermissions && Array.isArray(metaObj?.changes) ? (metaObj!.changes as { field: string; from: unknown; to: unknown }[]) : []
  const matrixLabel = metaObj?.matrix === "work_order" ? "work-order matrix" : metaObj?.matrix === "admin" ? "admin matrix" : ""

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Action", value: entry.action },
    { label: "Type", value: <span className="rounded border px-[7px] py-0.5 text-[10px] font-bold" style={{ backgroundColor: meta.bg, color: meta.color, borderColor: meta.border }}>{meta.label}</span> },
    { label: "When", value: <>{formatAbs(entry.timestamp)}{rel && <span className="ml-1.5 text-gray-400">({rel})</span>}</> },
    { label: "Performed by", value: <div>{entry.performedByName}{entry.performedByEmail && <div className="text-[11px] text-gray-400">{entry.performedByEmail}</div>}</div> },
    { label: "Org unit", value: entry.performedByOrgUnit || "—" },
    { label: "Target user", value: entry.targetUserName ? `${entry.targetUserName}${entry.targetUserEmail ? ` (${entry.targetUserEmail})` : ""}` : "—" },
    { label: "Target asset", value: entry.targetAsset || (entry.targetAssetId ? entry.targetAssetId.slice(0, 8) : "—") },
  ]

  return (
    <div onClick={onClose} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4">
      <div onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-[540px] max-w-[95vw] overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-gray-100 bg-white px-[18px] py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: meta.bg, color: meta.color }}>{meta.icon}</span>
            <div>
              <div className="text-sm font-bold text-gray-900">Audit Entry</div>
              <div className="text-[11px] text-gray-400">{meta.label}</div>
            </div>
          </div>
          <button onClick={onClose} className="flex bg-transparent border-0 p-1 text-gray-400 cursor-pointer"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="px-[18px] pt-2 pb-[18px]">
          <div className="flex flex-col border-t border-gray-100">
            {rows.map((r) => (
              <div key={r.label} className="flex gap-3 border-b border-gray-100 py-2.5">
                <div className="w-[110px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{r.label}</div>
                <div className="flex-1 break-words text-xs text-gray-900">{r.value}</div>
              </div>
            ))}
          </div>

          {/* Permission changes (specific per-role added/removed) */}
          {isPermissions && (
            <div className="mt-3.5">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Permission Changes{matrixLabel ? ` · ${matrixLabel}` : ""}
              </div>
              {permChanges.length === 0 ? (
                <div className="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2 text-xs text-gray-500">
                  No effective changes
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {permChanges.map((c) => (
                    <div key={c.role} className="rounded-md border border-gray-100 bg-gray-50 p-2.5">
                      <div className="mb-1.5 text-xs font-bold text-slate-700">{c.role}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {c.added.map((p) => (
                          <span key={`a-${p}`} title={p} className="rounded border border-green-200 bg-green-100 px-[7px] py-0.5 font-mono text-[10px] font-semibold text-green-700">+ {p}</span>
                        ))}
                        {c.removed.map((p) => (
                          <span key={`r-${p}`} title={p} className="rounded border border-red-200 bg-red-100 px-[7px] py-0.5 font-mono text-[10px] font-semibold text-red-700 line-through">− {p}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Field-level changes (e.g. user management updates) */}
          {fieldChanges.length > 0 && (
            <div className="mt-3.5">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Changes
              </div>
              <div className="flex flex-col gap-1.5">
                {fieldChanges.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-xs">
                    <span className="min-w-[70px] font-bold capitalize text-slate-700">{c.field}</span>
                    <span className="font-mono text-[11px] text-red-700 line-through">{String(c.from ?? "—")}</span>
                    <span className="text-gray-400">→</span>
                    <span className="font-mono text-[11px] font-semibold text-green-700">{String(c.to ?? "—")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          {hasMeta && (
            <div className="mt-3.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                <FileJson size={13} /> Metadata
              </div>
              <pre className="m-0 max-h-[240px] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-2.5 font-mono text-[11px] text-slate-700">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}