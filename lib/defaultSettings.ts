// lib/defaultSettings.ts
// Catalog of default system settings with categories, descriptions, and data types.
// Seeded on first boot; admins can override via /dashboard/admin/settings.

export type SettingType = "string" | "number" | "boolean" | "enum" | "json"

export interface SettingDef {
  key: string
  value: string
  category: string
  description: string
  type: SettingType
  options?: string[]
}

export const DEFAULT_SETTINGS: SettingDef[] = [
  // ── Branding ──────────────────────────────────────────────────────────────
  {
    key: "site_name",
    value: "Asset Tracking",
    category: "Branding",
    description: "Application name shown in the topbar and browser title",
    type: "string",
  },
  {
    key: "org_name",
    value: "Ethio Telecom",
    category: "Branding",
    description: "Organization name shown in footer and reports",
    type: "string",
  },
  {
    key: "timezone",
    value: "Africa/Addis_Ababa",
    category: "Branding",
    description: "Default timezone for date/time display",
    type: "string",
  },
  {
    key: "date_format",
    value: "YYYY-MM-DD",
    category: "Branding",
    description: "Date format for display (moment.js format string)",
    type: "string",
  },

  // ── Asset Configuration ───────────────────────────────────────────────────
  {
    key: "asset_tag_prefix",
    value: "ET",
    category: "Assets",
    description: "Prefix for auto-generated asset tag numbers",
    type: "string",
  },
  {
    key: "asset_tag_padding",
    value: "5",
    category: "Assets",
    description: "Number of digits for asset tag numbers (e.g. 5 = ET00001)",
    type: "number",
  },
  {
    key: "default_page_size",
    value: "20",
    category: "Assets",
    description: "Default number of rows per page in tables",
    type: "number",
  },
  {
    key: "max_export_rows",
    value: "10000",
    category: "Assets",
    description: "Maximum rows allowed in a single export",
    type: "number",
  },

  // ── Work Orders ───────────────────────────────────────────────────────────
  {
    key: "wo_number_prefix",
    value: "WO",
    category: "Work Orders",
    description: "Prefix for work order numbers",
    type: "string",
  },
  {
    key: "sla_warning_hours",
    value: "24",
    category: "Work Orders",
    description: "Hours before SLA breach to send a warning alert",
    type: "number",
  },
  {
    key: "wo_checkout_timeout_hours",
    value: "72",
    category: "Work Orders",
    description: "Auto-release checkout after this many hours (0 = disabled)",
    type: "number",
  },

  // ── Security ──────────────────────────────────────────────────────────────
  {
    key: "session_timeout_minutes",
    value: "480",
    category: "Security",
    description: "Session cookie max age in minutes (480 = 8 hours)",
    type: "number",
  },
  {
    key: "max_login_attempts",
    value: "5",
    category: "Security",
    description: "Failed login attempts before temporary lockout",
    type: "number",
  },
  {
    key: "lockout_duration_minutes",
    value: "15",
    category: "Security",
    description: "Account lockout duration in minutes after max failed attempts",
    type: "number",
  },
  {
    key: "password_min_length",
    value: "8",
    category: "Security",
    description: "Minimum password length",
    type: "number",
  },

  // ── File Uploads ──────────────────────────────────────────────────────────
  {
    key: "max_upload_size_mb",
    value: "10",
    category: "File Uploads",
    description: "Maximum file upload size in MB",
    type: "number",
  },
  {
    key: "avatar_max_size_mb",
    value: "4",
    category: "File Uploads",
    description: "Maximum avatar image size in MB",
    type: "number",
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  {
    key: "notify_on_wo_assignment",
    value: "true",
    category: "Notifications",
    description: "Send notification when a work order is assigned",
    type: "boolean",
  },
  {
    key: "notify_on_wo_status_change",
    value: "true",
    category: "Notifications",
    description: "Send notification when a work order status changes",
    type: "boolean",
  },
  {
    key: "notify_on_sla_breach",
    value: "true",
    category: "Notifications",
    description: "Send notification when an SLA breach occurs",
    type: "boolean",
  },

  // ── Backup ────────────────────────────────────────────────────────────────
  {
    key: "backup_retention_days",
    value: "7",
    category: "Backup",
    description: "Number of days to retain local database backups",
    type: "number",
  },
  {
    key: "backup_interval_hours",
    value: "24",
    category: "Backup",
    description: "Hours between automatic database backups",
    type: "number",
  },

  // ── Theme ─────────────────────────────────────────────────────────────────
  {
    key: "theme",
    value: "light",
    category: "Theme",
    description: "Default UI theme (light or dark). Users can override per-session.",
    type: "enum",
    options: ["light", "dark"],
  },
]

// Quick lookup map
export const SETTING_DEFS: Record<string, SettingDef> = Object.fromEntries(
  DEFAULT_SETTINGS.map(s => [s.key, s])
)

// Categories for UI grouping
export const SETTING_CATEGORIES = [...new Set(DEFAULT_SETTINGS.map(s => s.category))]

// Get a setting's definition (description, type, category)
export function getSettingDef(key: string): SettingDef | undefined {
  return SETTING_DEFS[key]
}

// Get default value for a key
export function getDefaultValue(key: string): string | undefined {
  return SETTING_DEFS[key]?.value
}
