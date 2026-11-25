// components/workorders/types.ts
// ── Shared types, constants, and style helpers ────────────────────────────────

import type { WorkOrder } from "@/hooks/useWorkOrders"
export type { WorkOrder }

export type Priority  = "LOW" | "MEDIUM" | "HIGH"
export type AppView   = "ORDER_MONITORING" | "TASK_CENTER" | "WO_MONITORING"
export type TaskTab   = "TO_PROCESS" | "PROCESSING"
export type OmTab     = "ACTIVE" | "ARCHIVED"
export type ActAction = "checkout" | "start" | "complete" | "checkin" | "assign"

export type LifecyclePerms = {
  canCheckout    : boolean
  canStart       : boolean
  canComplete    : boolean
  canCheckin     : boolean
  canForceArchive: boolean
  canDelete      : boolean
}

export type SearchFields = {
  woNo     : string
  title    : string
  asset    : string
  status   : string
  priority : string
  orgId    : string
  assignee : string
  createdBy: string
}

export const EMPTY_SEARCH: SearchFields = {
  woNo: "", title: "", asset: "", status: "",
  priority: "", orgId: "", assignee: "", createdBy: "",
}

export const STATUS_META: Record<string, {
  label: string; color: string; bg: string; border: string
}> = {
  CREATED    : { label: "Initialization State", color: "#92400e", bg: "#fef3c7", border: "#fcd34d" },
  ASSIGNED   : { label: "Assigned",             color: "#1d4ed8", bg: "#dbeafe", border: "#93c5fd" },
  CHECKED_OUT: { label: "Processing",           color: "#7c3aed", bg: "#ede9fe", border: "#c4b5fd" },
  IN_PROGRESS: { label: "In Progress",          color: "#b45309", bg: "#fef3c7", border: "#fcd34d" },
  COMPLETED  : { label: "Successful",           color: "#15803d", bg: "#dcfce7", border: "#86efac" },
  ARCHIVED   : { label: "Order Archive",        color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" },
}

export const PRIORITY_META: Record<Priority, { color: string }> = {
  HIGH  : { color: "#ef4444" },
  MEDIUM: { color: "#f59e0b" },
  LOW   : { color: "#22c55e" },
}

export const ACTIVITY_LABEL: Record<string, string> = {
  CREATED    : "Assign / Checkout",
  ASSIGNED   : "Survey Resource",
  CHECKED_OUT: "Access Device Config",
  IN_PROGRESS: "Backbone Config",
  COMPLETED  : "Order Archive",
  ARCHIVED   : "Archived",
}

export const NAV_ITEMS: [AppView, string, string, string][] = [
  ["ORDER_MONITORING", "O", "Order Monitoring",  "All work orders — full visibility"],
  ["TASK_CENTER",      "T", "Task Center (OM)",  "Your org unit work queues"],
  ["WO_MONITORING",   "W", "WO Monitoring",      "Coming soon"],
]

