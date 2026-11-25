
// app/dashboard/(workorders)/workorders/_components/types.ts

export type Priority  = "LOW" | "MEDIUM" | "HIGH"
export type AppView   = "ORDER_MONITORING" | "TASK_CENTER" | "ORG_ORDERS" | "WO_MONITORING"
export type TaskTab   = "TO_PROCESS" | "PROCESSING"
export type OmTab     = "ACTIVE" | "ARCHIVED"
export type ActAction = "checkout" | "start" | "complete" | "checkin" | "assign" | "delete"

export type SearchFields = {
  woNo:      string
  title:     string
  asset:     string
  status:    string
  priority:  string
  orgId:     string
  assignee:  string
  createdBy: string
}

export const EMPTY_SEARCH: SearchFields = {
  woNo: "", title: "", asset: "", status: "",
  priority: "", orgId: "", assignee: "", createdBy: "",
}

export type LifecyclePerms = {
  canCheckout:     boolean
  canStart:        boolean
  canComplete:     boolean
  canCheckin:      boolean
  canForceArchive: boolean
  canDelete:       boolean
}

export const EMPTY_LIFECYCLE_PERMS: LifecyclePerms = {
  canCheckout: false, canStart: false, canComplete: false,
  canCheckin: false, canForceArchive: false, canDelete: false,
}

// ── Full asset fields (from WO_INCLUDE) ──────────────────────────────────────
export type WorkOrderAsset = {
  id?:                  string
  itemCode?:            string | null
  itemCodeDescription?: string | null
  tagNumber?:           string | null
  serialNumber?:        string
  assetDescription?:    string | null
  category?:            string | null
  owningDepartment?:    string | null
  criticality?:         string | null
  wipClass?:            string | null
  politicalArea?:       string | null
  maintainable?:        boolean | null
  active?:              boolean | null
  productionOrg?:       string | null
  equipmentItem?:       string | null
  eqpSerial?:           string | null
  faCategory?:          string | null
  faNumber?:            string | null
  parentAsset?:         string | null
  parentSerial?:        string | null
  locationName?:        string | null
  locationCode?:        string | null
  address?:             string | null
  warrantyExpiration?:  string | null
  checkedOut?:          boolean | null
  faSynced?:            boolean | null
  operational?:         boolean | null
  customFlag?:          boolean | null
  wirelessSiteId?:      string | null
  orgUnit?: {
    id: string
    name: string
    type?: string
    path?: string
  }
}

// ── WorkOrder type ────────────────────────────────────────────────────────────
export type WorkOrder = {
  id:           string
  workOrderNo?: string | null
  title?:       string | null
  description?: string | null
  status:       string
  priority?:    string | null
  scheduledAt?: string | null
  startedAt?:   string | null
  completedAt?: string | null
  archivedAt?:  string | null
  createdAt:    string
  orgUnitId:    string
  assetId?:     string | null
  assignedToId?: string | null
  createdById?: string | null
  checkedOutById?: string | null
  checkedOutAt?:  string | null
  checkedOutBy?:   { id: string; name: string } | null
  completedBy?:    { id: string; name: string } | null
  assetSnapshot?: WorkOrderAsset | null   // ← NEW: full asset at WO creation time

  orgUnit?: { id: string; name: string; path?: string; type?: string }
  assignedTo?: { id: string; name: string } | null
  createdBy?:  { id: string; name: string } | null
  asset?:      WorkOrderAsset | null
}

export const STATUS_META: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  CREATED:     { label: "Created",             color: "#92400e", bg: "#fef3c7", border: "#fcd34d" },
  ASSIGNED:    { label: "Assigned",             color: "#1d4ed8", bg: "#dbeafe", border: "#93c5fd" },
  CHECKED_OUT: { label: "Processing",           color: "#7c3aed", bg: "#ede9fe", border: "#c4b5fd" },
  IN_PROGRESS: { label: "Processing",           color: "#b45309", bg: "#fef3c7", border: "#fcd34d" },
  COMPLETED:   { label: "Completed",            color: "#15803d", bg: "#dcfce7", border: "#86efac" },
  ARCHIVED:    { label: "Checked In",           color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" },
}

export const PRIORITY_META: Record<Priority, { color: string }> = {
  HIGH:   { color: "#ef4444" },
  MEDIUM: { color: "#f59e0b" },
  LOW:    { color: "#22c55e" },
}

export function findOrgName(node: any, id: string): string {
  if (!node) return ""
  if (node.id === id) return node.name
  for (const c of node.children ?? []) {
    const found = findOrgName(c, id)
    if (found) return found
  }
  return ""
}
