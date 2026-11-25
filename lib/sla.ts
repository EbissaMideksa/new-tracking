// lib/sla.ts
// SLA (Service Level Agreement) tracking utilities — client-safe (no server imports).
// The server-side getSLAHours is in lib/slaServer.ts.

export type SLAStatus = "on_track" | "warning" | "breached" | "completed" | "no_sla"

export interface SLAInfo {
  status: SLAStatus
  label: string
  color: string
  bg: string
  hoursElapsed: number
  hoursRemaining: number | null
}

const SLA_CONFIG: Record<SLAStatus, { label: string; color: string; bg: string }> = {
  on_track:  { label: "On Track",  color: "#059669", bg: "#ecfdf5" },
  warning:   { label: "Warning",   color: "#d97706", bg: "#fffbeb" },
  breached:  { label: "Breached",  color: "#dc2626", bg: "#fef2f2" },
  completed: { label: "Completed", color: "#6b7280", bg: "#f9fafb" },
  no_sla:    { label: "No SLA",    color: "#9ca3af", bg: "#f9fafb" },
}

export function computeSLA(
  createdAt: Date | string,
  status: string,
  completedAt: Date | string | null,
  slaWarningHours: number
): SLAInfo {
  if (["COMPLETED", "ARCHIVED"].includes(status)) {
    return { status: "completed", ...SLA_CONFIG.completed, hoursElapsed: 0, hoursRemaining: null }
  }

  const created = new Date(createdAt)
  const now = new Date()
  const hoursElapsed = (now.getTime() - created.getTime()) / (1000 * 60 * 60)
  const breachHours = slaWarningHours * 2

  if (hoursElapsed >= breachHours) {
    return { status: "breached", ...SLA_CONFIG.breached, hoursElapsed: Math.round(hoursElapsed), hoursRemaining: 0 }
  }

  if (hoursElapsed >= slaWarningHours) {
    return { status: "warning", ...SLA_CONFIG.warning, hoursElapsed: Math.round(hoursElapsed), hoursRemaining: Math.round(breachHours - hoursElapsed) }
  }

  return { status: "on_track", ...SLA_CONFIG.on_track, hoursElapsed: Math.round(hoursElapsed), hoursRemaining: Math.round(slaWarningHours - hoursElapsed) }
}

export function getSLABadge(sla: SLAInfo): { label: string; color: string; bg: string } {
  return { label: sla.label, color: sla.color, bg: sla.bg }
}
