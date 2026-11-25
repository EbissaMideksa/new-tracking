// components/NotificationBell.tsx
// Bell icon in the topbar that shows real-time notifications from SSE.
// Listens to /api/events/user for task_assigned and task_updated events.

"use client"

import { useState, useEffect, useRef } from "react"
import { useLiveChannel } from "@/hooks/useLiveChannel"
import { Bell } from "lucide-react"

interface Notification {
  id: string
  type: string
  title: string
  time: string
  read: boolean
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.read).length

  useLiveChannel<{ event: string; workOrder?: any }>(
    "/api/events/user",
    (payload) => {
      if (!payload.event || !payload.workOrder) return
      const wo = payload.workOrder
      let title = ""
      if (payload.event === "task_assigned") {
        title = `WO ${wo.workOrderNo || wo.id?.slice(0, 8)} assigned to your unit`
      } else if (payload.event === "task_updated") {
        title = `WO ${wo.workOrderNo || wo.id?.slice(0, 8)} updated — status: ${wo.status}`
      } else {
        title = payload.event
      }
      setNotifications(prev => [
        { id: Date.now().toString(), type: payload.event, title, time: new Date().toLocaleTimeString(), read: false },
        ...prev,
      ].slice(0, 20))
    }
  )

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => { setOpen(!open); if (!open) markAllRead() }}
        title="Notifications"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 8, border: "1px solid transparent",
          background: open ? "#f1f5f9" : "transparent", color: "#94a3b8",
          cursor: "pointer", transition: "all 0.15s", position: "relative",
        }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: 2, right: 2, minWidth: 16, height: 16,
            borderRadius: 8, background: "#ef4444", color: "#fff",
            fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center",
            justifyContent: "center", padding: "0 4px",
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 42, right: 0, width: 320,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,0.12)", zIndex: 100,
          maxHeight: 400, overflowY: "auto",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Notifications</span>
            {notifications.length > 0 && (
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{notifications.length} total</span>
            )}
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              No notifications yet
            </div>
          ) : (
            notifications.map(n => (
              <div key={n.id} style={{
                padding: "10px 16px", borderBottom: "1px solid #f8fafc",
                display: "flex", gap: 10, alignItems: "flex-start",
                background: n.read ? "transparent" : "#f0f9ff",
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", marginTop: 4, flexShrink: 0,
                  background: n.read ? "#cbd5e1" : "#3b82f6",
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#334155", fontWeight: n.read ? 400 : 600 }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{n.time}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
