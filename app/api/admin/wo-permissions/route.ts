// app/api/admin/wo-permissions/route.ts
// ──────────────────────────────────────────────────────────────────────────────
// GET  — returns the active WO action matrix to ANY authenticated user.
//        Every role needs it so canWo() checks work client-side.
//
// POST — any role granted manage_wo_permissions (e.g. SUPER_ADMIN, ADMIN) may
//        write.  Access is driven by the live admin grant matrix, matching the
//        sidebar gate.  Persists + broadcasts via SSE.
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { loadPermissionsFromDB } from "@/lib/permissions"
import { canWithMatrix } from "@/lib/adminGrants"
import { loadWoPermissionsFromDB, saveWoPermissionsToDB } from "@/lib/woPermissions"
import { DEFAULT_WO_GRANT_MATRIX, WoGrantMatrix } from "@/lib/workOrderGrants"
import { publish } from "@/lib/broadcast"
import { createAuditLog, diffPermissionMatrix } from "@/lib/audit"
import { z } from "zod"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"

const matrixSchema = z.record(z.string(), z.array(z.string()))

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const matrix = await loadWoPermissionsFromDB()
  return NextResponse.json({ matrix })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const grants = await loadPermissionsFromDB()
  const overrides = await loadUserOverrides(user.id)
if (!effectiveCan(grants, user.role, "manage_wo_permissions", overrides.admin)) {
    return NextResponse.json(
      { error: "You do not have permission to modify the WO permission matrix" },
      { status: 403 },
    )
  }

  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  // Accept both { matrix: {...} } and raw {...}
  const raw =
    body && typeof body === "object" && "matrix" in body
      ? (body as { matrix: unknown }).matrix
      : body

  const parsed = matrixSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid matrix shape", details: parsed.error.issues },
      { status: 400 },
    )
  }

  const matrix = parsed.data as WoGrantMatrix

  // SUPER_ADMIN is always immutable
  matrix["SUPER_ADMIN"] = [...DEFAULT_WO_GRANT_MATRIX["SUPER_ADMIN"]]

  const oldWo = await loadWoPermissionsFromDB()
  await saveWoPermissionsToDB(matrix)

  const permChanges = diffPermissionMatrix(oldWo as Record<string, string[]>, matrix as Record<string, string[]>)
  await createAuditLog({
    performedById: user.id,
    action: permChanges.length
      ? `Updated work-order permission matrix — ${permChanges.length} role(s) changed`
      : "Updated work-order permission matrix (no effective changes)",
    actionType: "PERMISSION_MANAGEMENT",
    metadata: { kind: "permissions", matrix: "work_order", changes: permChanges },
  })
  publish("audit", { event: "invalidate" })

  // Push new matrix to ALL connected SSE clients
  publish("wo_permissions", { event: "updated", matrix })

  return NextResponse.json({ success: true, matrix })
}
