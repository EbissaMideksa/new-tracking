// lib/systemSettings.ts
// Generic key/value system settings store (backed by the SystemSetting table).
//
// Reserved keys are managed by dedicated admin pages and must NOT be edited
// through the generic System Settings editor:
//   - grant_matrix           → /dashboard/admin/permissions
//   - wo_permission_matrix   → /dashboard/admin/wo-permissions

import prisma from "@/lib/prisma"

// Re-export client-safe constants so server consumers can import everything
// from this module, while the client editor imports from the constants file.
export { RESERVED_KEYS, isReservedKey } from "@/lib/systemSettings.constants"
import { isReservedKey } from "@/lib/systemSettings.constants"

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.systemSetting.findMany()
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value
  return map
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } })
  return row?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
}

export async function deleteSetting(key: string): Promise<void> {
  try {
    await prisma.systemSetting.delete({ where: { key } })
  } catch {
    /* already gone */
  }
}
