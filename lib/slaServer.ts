// lib/slaServer.ts
// Server-only SLA utilities (imports Prisma via systemSettings).
// Do NOT import this from client components.

import { getSetting } from "@/lib/systemSettings"

export async function getSLAHours(): Promise<number> {
  const val = await getSetting("sla_warning_hours")
  return val ? parseInt(val) : 24
}
