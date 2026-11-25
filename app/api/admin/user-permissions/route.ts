// app/api/admin/user-permissions/route.ts
//
// GET  ?userId=xxx
//      Returns the target user's role plus their personal overrides
//      (admin + wo). The caller's own canManageAdmin/canManageWo flags come
//      back too so the UI knows which of the two boxes it may edit.
//
// POST — body: { userId, admin?: { granted:string[], revoked:string[] },
//                 wo?: { granted:string[], revoked:string[] } }
//      Only the piece(s) included in the body are updated/authorized:
//        - including `admin`  requires the manage_permissions grant
//        - including `wo`     requires the manage_wo_permissions grant
//      SUPER_ADMIN users can't receive overrides — their permissions stay
//      locked to the (immutable) role baseline, same as the role matrices.
//      Persists, audit-logs, and broadcasts via SSE on the "user_permissions"
//      channel so effective-permission checks elsewhere in the app can pick
//      up the change live for that user's active sessions.

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { loadPermissionsFromDB } from "@/lib/permissions"
//import { canWithMatrix as effectiveCan } from "@/lib/adminGrants"
import  prisma  from "@/lib/prisma"
import { loadUserOverrides, saveUserOverrides } from "@/lib/userPermissions"
import { publish } from "@/lib/broadcast"
import { createAuditLog } from "@/lib/audit"
import { z } from "zod"
import { loadUserOverrides as loadCallerOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"
import { canAdministerUser } from "@/lib/rbac"


const overrideSchema = z.object({
  granted: z.array(z.string()),
  revoked: z.array(z.string()),
})

const bodySchema = z.object({
  userId: z.string().min(1),
  admin: overrideSchema.optional(),
  wo: overrideSchema.optional(),
})

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = req.nextUrl.searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 })

  const grants = await loadPermissionsFromDB()
 const callerOverrides = await loadCallerOverrides(user.id)
 const canManageAdmin = effectiveCan(grants, user.role, "manage_permissions", callerOverrides.admin)
  const canManageWo = effectiveCan(grants, user.role, "manage_wo_permissions", callerOverrides.admin)
  if (!canManageAdmin && !canManageWo) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, role: true,
      orgUnit: { select: { id: true, name: true, path: true } },
      department: { select: { id: true, name: true, path: true } },
    },
  })
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // Jurisdiction check. The picker is scoped to the approver's org subtree, but
  // this endpoint is reachable directly with any userId, so the boundary has to
  // be enforced here too or the scoping is cosmetic.
  if (!canAdministerUser(user, target)) {
    return NextResponse.json(
      { error: "That account is outside your org jurisdiction" },
      { status: 403 },
    )
  }

  const overrides = await loadUserOverrides(userId)

  return NextResponse.json({ user: target, canManageAdmin, canManageWo, overrides })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let json: unknown
  try { json = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.issues }, { status: 400 })
  }
  const { userId, admin, wo } = parsed.data
  if (!admin && !wo) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const grants = await loadPermissionsFromDB()
  const callerOverrides = await loadCallerOverrides(user.id)
  const canManageAdmin = effectiveCan(grants, user.role, "manage_permissions", callerOverrides.admin)
  const canManageWo = effectiveCan(grants, user.role, "manage_wo_permissions", callerOverrides.admin)
  if (admin && !canManageAdmin) {
    return NextResponse.json({ error: "You do not have permission to edit admin permissions" }, { status: 403 })
  }
  if (wo && !canManageWo) {
    return NextResponse.json({ error: "You do not have permission to edit work order permissions" }, { status: 403 })
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, role: true, name: true, email: true,
      orgUnit: { select: { id: true, name: true, path: true } },
      department: { select: { id: true, name: true, path: true } },
    },
  })
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // Jurisdiction check, before anything is written. Without it an approver with
  // manage_permissions could grant or revoke admin/work-order overrides for any
  // account in the system simply by supplying its id — including accounts in
  // other regions, and including escalating a user beyond their own unit.
  if (!canAdministerUser(user, target)) {
    return NextResponse.json(
      { error: "That account is outside your org jurisdiction" },
      { status: 403 },
    )
  }

  if (target.role === "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "SUPER_ADMIN permissions are immutable and cannot be overridden" },
      { status: 400 },
    )
  }

  const current = await loadUserOverrides(userId)
  const nextBundle = {
    admin: admin ?? current.admin,
    wo: wo ?? current.wo,
  }

  const savedOverrides = await saveUserOverrides(userId, nextBundle, user.id)

  const changedParts: string[] = []
  if (admin) changedParts.push("admin permissions")
  if (wo) changedParts.push("work order permissions")

  await createAuditLog({
    performedById: user.id,
    action: `Updated ${changedParts.join(" & ")} override for ${target.name ?? target.email ?? target.id}`,
    actionType: "PERMISSION_MANAGEMENT",
    metadata: { kind: "user_permission_override", targetUserId: userId, overrides: savedOverrides },
  })
  publish("audit", { event: "invalidate" })

  // Broadcast so effective-permission checks (sidebar, guards, action
  // buttons, etc.) refresh live for this user's active sessions.
  publish("user_permissions", { event: "updated", userId, overrides: savedOverrides })

  return NextResponse.json({ success: true, overrides: savedOverrides })
}


