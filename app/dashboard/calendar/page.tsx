"use client"

import { useEffect, useState, useMemo } from "react"
import { useToast } from "@/components/ToastProvider"

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  CREATED:     { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
  ASSIGNED:    { bg: "#f5f3ff", border: "#ddd6fe", text: "#7c3aed" },
  CHECKED_OUT: { bg: "#fffbeb", border: "#fde68a", text: "#d97706" },
  IN_PROGRESS: { bg: "#ecfeff", border: "#a5f3fc", text: "#0891b2" },
  COMPLETED:   { bg: "#f0fdf4", border: "#bbf7d0", text: "#16a34a" },
  ARCHIVED:    { bg: "#f9fafb", border: "#e5e7eb", text: "#6b7280" },
}

const PRIORITY_DOT: Record<string, string> = {
  HIGH: "#dc2626", MEDIUM: "#f59e0b", LOW: "#64748b",
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export default function CalendarPage() {
  const { showToast } = useToast()
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedWo, setSelectedWo] = useState<any | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/workorders/calendar?month=${monthKey}`)
      if (!res.ok) return
      const data = await res.json()
      setWorkOrders(data.workOrders || [])
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [monthKey])

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days: (Date | null)[] = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d))
    return days
  }, [year, month])

  // Group WOs by date
  const woByDate = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const wo of workOrders) {
      if (!wo.scheduledAt) continue
      const d = new Date(wo.scheduledAt)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map[key]) map[key] = []
      map[key].push(wo)
    }
    return map
  }, [workOrders])

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)) }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)) }
  function goToday() { setCurrentDate(new Date()) }

  const today = new Date()
  const isToday = (d: Date) => d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()

  // Stats
  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {}
    for (const wo of workOrders) {
      byStatus[wo.status] = (byStatus[wo.status] || 0) + 1
    }
    return { total: workOrders.length, byStatus }
  }, [workOrders])

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">Work Order Calendar</h1>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">← Prev</button>
          <button onClick={goToday} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">Today</button>
          <button onClick={nextMonth} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Next →</button>
        </div>
      </div>

      {/* Month title + stats */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">{MONTHS[month]} {year}</h2>
        <div className="flex gap-2 flex-wrap text-xs">
          <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">{stats.total} scheduled</span>
          {Object.entries(stats.byStatus).map(([status, count]) => {
            const c = STATUS_COLORS[status] || STATUS_COLORS.CREATED
            return <span key={status} className="px-2 py-1 rounded" style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>{status}: {count}</span>
          })}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b">
          {WEEKDAYS.map(d => (
            <div key={d} className="p-2 text-center text-xs font-bold text-gray-500 uppercase">{d}</div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7">
          {calendarDays.map((date, i) => {
            if (!date) return <div key={i} className="min-h-28 border-r border-b bg-gray-50" />
            const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
            const dayWOs = woByDate[key] || []
            const todayClass = isToday(date) ? "bg-blue-50" : ""
            return (
              <div key={i} className={`min-h-28 border-r border-b p-1.5 ${todayClass} ${dayWOs.length > 0 ? "" : "bg-gray-50/50"}`}>
                <div className={`text-xs font-semibold mb-1 ${isToday(date) ? "text-blue-600" : "text-gray-400"}`}>
                  {date.getDate()}
                </div>
                <div className="space-y-1">
                  {dayWOs.slice(0, 3).map(wo => {
                    const c = STATUS_COLORS[wo.status] || STATUS_COLORS.CREATED
                    return (
                      <div
                        key={wo.id}
                        onClick={() => setSelectedWo(wo)}
                        className="px-1.5 py-1 rounded text-xs cursor-pointer transition hover:opacity-80"
                        style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
                        title={`${wo.workOrderNo || wo.id.slice(0, 8)}: ${wo.title}`}
                      >
                        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: PRIORITY_DOT[wo.priority] || "#64748b", marginRight: 4 }} />
                        <span style={{ fontWeight: 600 }}>{wo.workOrderNo || wo.id.slice(0, 6)}</span>
                        <span className="hidden sm:inline"> {(wo.title || "").slice(0, 20)}</span>
                      </div>
                    )
                  })}
                  {dayWOs.length > 3 && (
                    <div className="text-xs text-gray-400 px-1">+{dayWOs.length - 3} more</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 flex-wrap text-xs">
        {Object.entries(STATUS_COLORS).map(([status, c]) => (
          <div key={status} className="flex items-center gap-1">
            <span style={{ width: 12, height: 12, borderRadius: 3, background: c.bg, border: `1px solid ${c.border}` }} />
            <span className="text-gray-500">{status}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_DOT.HIGH }} />
          <span className="text-gray-500">High</span>
        </div>
        <div className="flex items-center gap-1">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_DOT.MEDIUM }} />
          <span className="text-gray-500">Medium</span>
        </div>
        <div className="flex items-center gap-1">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_DOT.LOW }} />
          <span className="text-gray-500">Low</span>
        </div>
      </div>

      {/* WO Detail popup */}
      {selectedWo && (
        <div
          onClick={() => setSelectedWo(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, padding: 20, maxWidth: 400, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">{selectedWo.workOrderNo || selectedWo.id.slice(0, 8)}</h3>
              <button onClick={() => setSelectedWo(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-500">Title:</span> {selectedWo.title || "Untitled"}</div>
              <div>
                <span className="text-gray-500">Status:</span>{" "}
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 3, ...(STATUS_COLORS[selectedWo.status] || STATUS_COLORS.CREATED) }}>
                  {selectedWo.status}
                </span>
              </div>
              <div><span className="text-gray-500">Priority:</span> {selectedWo.priority || "MEDIUM"}</div>
              <div><span className="text-gray-500">Scheduled:</span> {new Date(selectedWo.scheduledAt).toLocaleString()}</div>
              {selectedWo.orgUnit?.name && <div><span className="text-gray-500">Org Unit:</span> {selectedWo.orgUnit.name}</div>}
              {selectedWo.assignedTo?.name && <div><span className="text-gray-500">Assigned to:</span> {selectedWo.assignedTo.name}</div>}
              {selectedWo.asset?.tagNumber && <div><span className="text-gray-500">Asset:</span> {selectedWo.asset.tagNumber}</div>}
            </div>
            <a
              href={`/dashboard/workorders`}
              className="block mt-4 px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold text-center hover:bg-blue-500"
            >
              Open in Work Orders
            </a>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-gray-400 text-center">Loading calendar...</p>}
    </div>
  )
}
