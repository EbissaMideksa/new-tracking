
// hooks/useWorkOrders.ts
"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useLiveChannel } from "@/hooks/useLiveChannel"
import type { WorkOrder } from "@/app/dashboard/(workorders)/workorders/_components/types"

export type { WorkOrder } // re-export so existing `import { WorkOrder } from "@/hooks/useWorkOrders"` call sites keep working

// ── Stable merge helpers ──────────────────────────────────────────────────────

function upsertOrder(prev: WorkOrder[], incoming: WorkOrder): WorkOrder[] {
  const exists = prev.some(o => o.id === incoming.id)
  if (exists) return prev.map(o => o.id === incoming.id ? incoming : o)
  return [incoming, ...prev]
}

function deduplicateOrders(orders: WorkOrder[]): WorkOrder[] {
  const seen = new Set<string>()
  return orders.filter(o => {
    if (seen.has(o.id)) return false
    seen.add(o.id)
    return true
  })
}

// ─────────────────────────────────────────────────────────────────────────────

export function useWorkOrders() {
  const [orders,        setOrders]        = useState<WorkOrder[]>([])
  const [loading,       setLoading]       = useState(true)
  const [liveIndicator, setLiveIndicator] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/workorders")
      if (!res.ok) return
      const data = await res.json()
      setOrders(deduplicateOrders(Array.isArray(data) ? data : []))
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function flashLive() {
    setLiveIndicator(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setLiveIndicator(false), 2_000)
  }

  useLiveChannel<{ event: string; workOrder?: WorkOrder; orderId?: string }>(
    "/api/workorders/events",
    (payload) => {
      flashLive()
      if (payload.event === "created" && payload.workOrder)
        setOrders(prev => deduplicateOrders(upsertOrder(prev, payload.workOrder!)))
      if (payload.event === "updated" && payload.workOrder)
        setOrders(prev => deduplicateOrders(upsertOrder(prev, payload.workOrder!)))
      if (payload.event === "task_assigned" && payload.workOrder)
        setOrders(prev => deduplicateOrders(upsertOrder(prev, payload.workOrder!)))
      if (payload.event === "task_updated" && payload.workOrder)
        setOrders(prev => deduplicateOrders(upsertOrder(prev, payload.workOrder!)))
      if (payload.event === "deleted" && payload.orderId)
        setOrders(prev => prev.filter(o => o.id !== payload.orderId))
    }
  )

  async function mutate(id: string, action: string, body?: any): Promise<WorkOrder> {
    const res = await fetch(`/api/workorders/${id}/${action}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error || `Action "${action}" failed`)
    }
    const updated: WorkOrder = await res.json()
    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
    return updated
  }

  async function create(data: Partial<WorkOrder> & { assetId?: string }): Promise<WorkOrder> {
    const res = await fetch("/api/workorders", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(data),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error || "Failed to create work order")
    }
    const created: WorkOrder = await res.json()
    setOrders(prev => deduplicateOrders(upsertOrder(prev, created)))
    return created
  }

  return { orders, loading, liveIndicator, mutate, create, refetch: load }
}
