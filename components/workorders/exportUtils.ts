// components/workorders/exportUtils.ts
// ── Client-side CSV export ────────────────────────────────────────────────────

import type { WorkOrder } from "./types"

export function exportOrdersCSV(orders: WorkOrder[], filename?: string) {
  const headers = [
    "WO Number", "Title", "Status", "Priority",
    "Org Unit", "Assigned To", "Created By",
    "Scheduled At", "Started At", "Completed At", "Created At",
  ]

  const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`

  const rows = orders.map(o => [
    o.workOrderNo || o.id,
    o.title || "",
    o.status,
    o.priority || "",
    o.orgUnit?.name || "",
    o.assignedTo?.name || (o.orgUnit?.name ? `${o.orgUnit.name} (unit)` : ""),
    (o as any).createdBy?.name || "",
    o.scheduledAt  ? new Date(o.scheduledAt).toLocaleString()  : "",
    o.startedAt    ? new Date(o.startedAt).toLocaleString()    : "",
    o.completedAt  ? new Date(o.completedAt).toLocaleString()  : "",
    new Date(o.createdAt).toLocaleString(),
  ])

  const csv = [headers, ...rows]
    .map(row => row.map(escape).join(","))
    .join("\n")

  const blob = new Blob(["\uFEFF" + csv, /* UTF-8 BOM for Excel */], {
    type: "text/csv;charset=utf-8",
  })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = filename ?? `work-orders-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

