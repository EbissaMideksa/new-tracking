
// lib/adminGrants.ts
// Defines all permission identifiers and the default grant matrix.
// This is the single source of truth for what permissions exist.
// The live matrix is stored in DB and loaded via lib/permissions.ts.

export type AdminAction =
  | "manage_users"
  | "assets_page"
  | "grant_admin"
  | "upload_assets"
  | "assign_assets"
  | "edit_asset_tags"
  | "export_assets"
  | "view_all_assets"
  | "view_work_orders"
  | "manage_work_orders"
  | "view_analytics"
  | "view_audit"
  | "export_audit"
  | "manage_org_units"
  // Organization Structure feature (spec: org.hierarchy.manage). Distinct from
  // manage_org_units — that gates the raw OrgUnit tree editor, this gates the
  // geography/local-unit writes (create unit, assign operational director).
  | "org_hierarchy_manage"
  | "manage_permissions"
  | "manage_wo_permissions"
  | "system_settings"

export type GrantMatrix = Record<string, AdminAction[]>

export const DEFAULT_GRANT_MATRIX: GrantMatrix = {
  SUPER_ADMIN: [
    "manage_users", "grant_admin",
    "assets_page", "upload_assets", "assign_assets", "edit_asset_tags",
    "export_assets", "view_all_assets",
    "view_work_orders", "manage_work_orders",
    "view_analytics", "view_audit", "export_audit",
    "manage_org_units", "org_hierarchy_manage", "manage_permissions", "manage_wo_permissions", "system_settings",
  ],
  ADMIN: [
    "manage_users",
    "assets_page", "upload_assets", "assign_assets", "edit_asset_tags",
    "export_assets", "view_all_assets",
    "view_work_orders", "manage_work_orders",
    "view_analytics", "view_audit", "export_audit",
    "manage_org_units", "org_hierarchy_manage", "manage_wo_permissions",
  ],
  CHIEF: [
    "assets_page", "upload_assets", "assign_assets", "export_assets", "view_all_assets",
    "view_work_orders", "manage_work_orders",
  ],
  DIRECTOR: [
    "assets_page", "upload_assets", "assign_assets", "export_assets", "view_all_assets",
    "view_work_orders", "manage_work_orders",
    "view_analytics", "view_audit",
  ],
  MANAGER: [
    "assets_page", "upload_assets", "assign_assets", "edit_asset_tags", "export_assets", "view_all_assets",
    "view_work_orders", "manage_work_orders",
  ],
  SUPERVISOR: [
    "assets_page", "export_assets", "view_all_assets",
    "view_work_orders", "manage_work_orders",
  ],
  USER: [
    "assets_page", "view_all_assets",
    "view_work_orders",
  ],
}

// Alias — keeps any existing `import { GRANT_MATRIX }` working
export const GRANT_MATRIX = DEFAULT_GRANT_MATRIX

/**
 * Client-side permission check.
 * Use via usePermissions().can() in components — never call this directly.
 */
export function canWithMatrix(
  matrix: GrantMatrix,
  role: string,
  action: AdminAction
): boolean {
  return matrix[role]?.includes(action) ?? false
}

// ── Human-readable descriptions for tooltips / hover help in the matrix UI ─────
export const ADMIN_ACTION_DESC: Record<AdminAction, string> = {
  manage_users:        "Create, edit, and manage user accounts",
  assets_page:         "Access the assets page",
  grant_admin:         "Grant admin-level roles to other users",
  upload_assets:       "Upload new assets (bulk import / files)",
  assign_assets:       "Assign assets to org units or users",
  edit_asset_tags:     "Edit asset tags and metadata",
  export_assets:       "Export the asset list to CSV / report",
  view_all_assets:     "View assets across all org units",
  view_work_orders:    "View the work orders section",
  manage_work_orders:  "Edit, reassign, and manage work orders",
  view_analytics:      "View analytics dashboards",
  view_audit:          "View the audit log",
  export_audit:        "Export the audit log",
  manage_org_units:    "Create, edit, and restructure organizational units",
  org_hierarchy_manage:"Create geography workforce units and assign operational directors",
  manage_permissions:  "Edit the admin permission matrix",
  manage_wo_permissions:"Edit the work order action permission matrix",
  system_settings:     "Change global system settings",
}
