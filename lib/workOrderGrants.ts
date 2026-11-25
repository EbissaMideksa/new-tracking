// lib/workOrderGrants.ts
// ──────────────────────────────────────────────────────────────────────────────
// Single source of truth for all work-order action identifiers and the default
// role → action grant matrix.
//
// Relationship to lib/adminGrants.ts
//   adminGrants  → page-level gates   (view_work_orders, manage_work_orders, …)
//   workOrderGrants → within-page action gates (who can checkout, start, etc.)
//
// The live matrix is persisted in DB via lib/woPermissions.ts under the key
// "wo_permission_matrix" and broadcast over SSE whenever a SUPER_ADMIN saves.
// ──────────────────────────────────────────────────────────────────────────────

export type WoAction =
  // ── Visibility ─────────────────────────────────────────────────────────────
  | "wo_view_all"        // see work orders across all org units (Order Monitoring)
  // ── Creation / Removal ─────────────────────────────────────────────────────
  | "wo_create"          // create a new work order
  | "wo_delete"          // hard-delete a work order (dangerous)
  | "wo_export"          // export work order list to CSV / report
  // ── Assignment ─────────────────────────────────────────────────────────────
  | "wo_assign"          // assign CREATED work order to an org unit
  | "wo_reassign"        // reassign already ASSIGNED / CHECKED_OUT work order
  // ── Lifecycle ──────────────────────────────────────────────────────────────
  | "wo_checkout"        // CREATED|ASSIGNED → CHECKED_OUT
  | "wo_start"           // CHECKED_OUT      → IN_PROGRESS (admin only for now)
  | "wo_complete"        // IN_PROGRESS      → COMPLETED (admin only for now)
  | "wo_checkin"         // CHECKED_OUT/IN_PROGRESS/COMPLETED → ARCHIVED
  | "wo_force_archive"   // any status       → ARCHIVED  (admin override)

export type WoGrantMatrix = Record<string, WoAction[]>

// ── Action groups for UI rendering ────────────────────────────────────────────
export const WO_ACTION_GROUPS: Record<string, WoAction[]> = {
  "Visibility": [
    "wo_view_all",
  ],
  "Creation & Management": [
    "wo_create",
    "wo_export",
    "wo_delete",
  ],
  "Assignment": [
    "wo_assign",
    "wo_reassign",
  ],
  "Lifecycle": [
    "wo_checkout",
    "wo_start",
    "wo_complete",
    "wo_checkin",
    "wo_force_archive",
  ],
}

export const ALL_WO_ACTIONS: WoAction[] = Object.values(WO_ACTION_GROUPS).flat()

// ── Human-readable labels ──────────────────────────────────────────────────────
export const WO_ACTION_LABELS: Record<WoAction, string> = {
  wo_view_all:      "View All Org Orders",
  wo_create:        "Create Work Order",
  wo_delete:        "Delete Work Order",
  wo_export:        "Export Work Orders",
  wo_assign:        "Assign to Org Unit",
  wo_reassign:      "Reassign Work Order",
  wo_checkout:      "Check Out (→ Processing)",
  wo_start:         "Start (→ In Progress)",
  wo_complete:      "Complete Work Order",
  wo_checkin:       "Check In (→ Archive)",
  wo_force_archive: "Force Archive (override)",
}

// ── Action descriptions for tooltip / help text ───────────────────────────────
export const WO_ACTION_DESC: Record<WoAction, string> = {
  wo_view_all:      "Can view work orders across all org units in Order Monitoring",
  wo_create:        "Can create new work orders and assign them to org units",
  wo_delete:        "Can hard-delete any work order (use with caution)",
  wo_export:        "Can export the work order list as a CSV / report",
  wo_assign:        "Can assign a CREATED work order to an org unit",
  wo_reassign:      "Can reassign an already ASSIGNED or CHECKED_OUT work order",
  wo_checkout:      "Can check out a work order, moving it from CREATED/ASSIGNED to CHECKED_OUT",
  wo_start:         "Can start a CHECKED_OUT work order, moving it to IN_PROGRESS",
  wo_complete:      "Can mark an IN_PROGRESS work order as COMPLETED",
  wo_checkin:       "Can check in a work order, archiving it",
  wo_force_archive: "Can force-archive a work order regardless of its current status",
}

// ── Default grant matrix ───────────────────────────────────────────────────────
// This is the fallback used if no DB record exists yet.
// Edit via the admin UI at /dashboard/admin/wo-permissions, not here.
export const DEFAULT_WO_GRANT_MATRIX: WoGrantMatrix = {
  SUPER_ADMIN: [...ALL_WO_ACTIONS],

  ADMIN: [
    "wo_view_all",
    "wo_create", "wo_export", "wo_delete",
    "wo_assign", "wo_reassign",
    "wo_checkout", "wo_start", "wo_complete", "wo_checkin", "wo_force_archive",
  ],

  CHIEF: [
    "wo_view_all",
    "wo_create", "wo_export",
    "wo_assign", "wo_reassign",
    "wo_checkout", "wo_checkin",
  ],

  DIRECTOR: [
    "wo_view_all",
    "wo_create", "wo_export",
    "wo_assign", "wo_reassign",
    "wo_checkout", "wo_checkin",
  ],

  MANAGER: [
    "wo_view_all",
    "wo_create", "wo_export",
    "wo_assign", "wo_reassign",
    "wo_checkout", "wo_checkin",
  ],

  SUPERVISOR: [
    "wo_create",
    "wo_assign",
    "wo_checkout", "wo_checkin",
  ],

  USER: [
    "wo_create",
    "wo_checkout", "wo_checkin",
  ],
}

// Alias for any legacy imports
export const WO_GRANT_MATRIX = DEFAULT_WO_GRANT_MATRIX

/**
 * Pure client-side permission check.
 * Prefer useWoPermissions().canWo() in components — this is the raw util.
 */
export function canWoWithMatrix(
  matrix: WoGrantMatrix,
  role: string,
  action: WoAction,
): boolean {
  return matrix[role]?.includes(action) ?? false
}
