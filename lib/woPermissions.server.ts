// lib/woPermissions.server.ts

import { loadWoPermissionsFromDB } from "@/lib/woPermissions"
import { canWoWithMatrix, WoAction } from "@/lib/workOrderGrants"

export async function canWoServer(
  role: string,
  action: WoAction
): Promise<boolean> {
  if (role === "SUPER_ADMIN") return true

  const matrix = await loadWoPermissionsFromDB()

  return canWoWithMatrix(
    matrix,
    role,
    action
  )
}