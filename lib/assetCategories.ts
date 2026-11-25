// lib/assetCategories.ts
// Asset category definitions with icons, colors, and descriptions.
// Used across the assets page, asset detail, and reports.

export interface CategoryDef {
  code: string
  label: string
  icon: string
  color: string
  bg: string
}

const CATEGORIES: Record<string, CategoryDef> = {
  "TRX.OTN":     { code: "TRX.OTN",     label: "Optical Transport Network",    icon: "🔌", color: "#2563eb", bg: "#eff6ff" },
  "TRX.DWDM":    { code: "TRX.DWDM",    label: "DWDM Equipment",               icon: "📡", color: "#7c3aed", bg: "#f5f3ff" },
  "TRX.SDH":     { code: "TRX.SDH",     label: "SDH Equipment",                icon: "📡", color: "#7c3aed", bg: "#f5f3ff" },
  "TRX.EDGE":    { code: "TRX.EDGE",    label: "Edge Network Equipment",       icon: "📶", color: "#0891b2", bg: "#ecfeff" },
  "WLN.RAN":     { code: "WLN.RAN",     label: "Radio Access Network",         icon: "📡", color: "#059669", bg: "#ecfdf5" },
  "WLN.CORE":    { code: "WLN.CORE",    label: "Core Network",                 icon: "🖥️", color: "#4f46e5", bg: "#eef2ff" },
  "WLN.TRANSPORT": { code: "WLN.TRANSPORT", label: "Transport Network",        icon: "🔗", color: "#0d9488", bg: "#f0fdfa" },
  "PWR.GEN":     { code: "PWR.GEN",     label: "Power Generator",              icon: "⚡", color: "#d97706", bg: "#fffbeb" },
  "PWR.UPS":     { code: "PWR.UPS",     label: "UPS System",                   icon: "🔋", color: "#d97706", bg: "#fffbeb" },
  "PWR.BATT":    { code: "PWR.BATT",    label: "Battery System",               icon: "🔋", color: "#d97706", bg: "#fffbeb" },
  "COOL.AC":     { code: "COOL.AC",     label: "Air Conditioning",             icon: "❄️", color: "#0284c7", bg: "#f0f9ff" },
  "COOL.FAN":    { code: "COOL.FAN",    label: "Cooling Fan",                  icon: "🌀", color: "#0284c7", bg: "#f0f9ff" },
  "TOOL.GEN":    { code: "TOOL.GEN",    label: "General Tool",                 icon: "🔧", color: "#6b7280", bg: "#f9fafb" },
  "TOOL.TEST":   { code: "TOOL.TEST",   label: "Test Equipment",               icon: "🧪", color: "#6b7280", bg: "#f9fafb" },
  "VEH":         { code: "VEH",         label: "Vehicle",                      icon: "🚗", color: "#dc2626", bg: "#fef2f2" },
}

const DEFAULT_CATEGORY: CategoryDef = {
  code: "OTHER",
  label: "Other",
  icon: "📦",
  color: "#6b7280",
  bg: "#f9fafb",
}

export function getCategoryDef(category: string | null | undefined): CategoryDef {
  if (!category) return { ...DEFAULT_CATEGORY, code: "UNCATEGORIZED", label: "Uncategorized" }
  return CATEGORIES[category] || { ...DEFAULT_CATEGORY, code: category, label: category }
}

export function getCategoryBadge(category: string | null | undefined): { icon: string; label: string; color: string; bg: string } {
  const def = getCategoryDef(category)
  return { icon: def.icon, label: def.label, color: def.color, bg: def.bg }
}

export function getAllCategories(): CategoryDef[] {
  return Object.values(CATEGORIES)
}
