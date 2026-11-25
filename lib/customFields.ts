// lib/customFields.ts
// Custom field definitions stored in SystemSetting key "custom_field_defs".
// Admins define fields (name, label, type); assets store values in customFields JSONB.

export type CustomFieldType = "text" | "number" | "boolean" | "date" | "select"

export interface CustomFieldDef {
  id: string
  name: string
  label: string
  type: CustomFieldType
  options?: string[]
  required?: boolean
}

export const DEFAULT_CUSTOM_FIELDS: CustomFieldDef[] = [
  { id: "ip_address", name: "ip_address", label: "IP Address", type: "text" },
  { id: "firmware_version", name: "firmware_version", label: "Firmware Version", type: "text" },
  { id: "installation_date", name: "installation_date", label: "Installation Date", type: "date" },
  { id: "rack_location", name: "rack_location", label: "Rack Location", type: "text" },
  { id: "redundant", name: "redundant", label: "Redundant", type: "boolean" },
]

export function parseFieldDefs(json: string | null): CustomFieldDef[] {
  if (!json) return DEFAULT_CUSTOM_FIELDS
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : DEFAULT_CUSTOM_FIELDS
  } catch {
    return DEFAULT_CUSTOM_FIELDS
  }
}
