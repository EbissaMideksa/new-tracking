
// app/api/admin/permissions/route.ts
//
// GET  — returns the active matrix to ANY authenticated user.
//        All roles need it for client-side can() checks.
//        Only roles with the manage_permissions grant see the edit UI,
//        but every role reads it.
//
// POST — any role granted manage_permissions (e.g. SUPER_ADMIN, ADMIN) may write.
//        Access is driven by the live admin grant matrix, matching the sidebar
//        gate.  Persists + broadcasts via SSE.  SUPER_ADMIN row is immutable.

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { loadPermissionsFromDB, savePermissionsToDB } from "@/lib/permissions"
import { DEFAULT_GRANT_MATRIX, GrantMatrix, canWithMatrix } from "@/lib/adminGrants"
import { publish } from "@/lib/broadcast"
import { createAuditLog, diffPermissionMatrix } from "@/lib/audit"
import { z } from "zod"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"

const matrixSchema = z.record(z.string(), z.array(z.string()))

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Every authenticated user gets the matrix — they need it for can() on the client.
  // The edit UI (GrantMatrixTable page) is separately guarded by the page itself.
  const matrix = await loadPermissionsFromDB()
  return NextResponse.json({ matrix })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const grants = await loadPermissionsFromDB()
  const overrides = await loadUserOverrides(user.id)
 if (!effectiveCan(grants, user.role, "manage_permissions", overrides.admin)) {
    return NextResponse.json(
      { error: "You do not have permission to modify the permission matrix" },
      { status: 403 }
    )
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Accept both { matrix: {...} } and raw {...}
  const raw = (body as any)?.matrix != null ? (body as any).matrix : body

  const parsed = matrixSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid matrix shape", details: parsed.error.issues },
      { status: 400 }
    )
  }

  const matrix = parsed.data as GrantMatrix
  // SUPER_ADMIN is always immutable — enforce server-side
  matrix["SUPER_ADMIN"] = [...DEFAULT_GRANT_MATRIX["SUPER_ADMIN"]]

  await savePermissionsToDB(matrix)

  const permChanges = diffPermissionMatrix(grants as Record<string, string[]>, matrix as Record<string, string[]>)
  await createAuditLog({
    performedById: user.id,
    action: permChanges.length
      ? `Updated admin permission matrix — ${permChanges.length} role(s) changed`
      : "Updated admin permission matrix (no effective changes)",
    actionType: "PERMISSION_MANAGEMENT",
    metadata: { kind: "permissions", matrix: "admin", changes: permChanges },
  })
  publish("audit", { event: "invalidate" })

  // Push new matrix to ALL connected SSE clients (every role)
  publish("permissions", { event: "updated", matrix })

  return NextResponse.json({ success: true, matrix })
}
