// app/api/assets/bulk-update/route.ts
// Bulk update assets: change active status, operational flag, or category.

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { broadcastGlobal } from "@/lib/broadcast"
import { createAuditLog } from "@/lib/audit"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const { assetIds, updates } = body
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return NextResponse.json({ error: "assetIds array required" }, { status: 400 })
  }
  if (!updates || typeof updates !== "object") {
    return NextResponse.json({ error: "updates object required" }, { status: 400 })
  }

  // Build the update data (only allow safe fields)
  const updateData: any = {}
  if (updates.active !== undefined) updateData.active = updates.active
  if (updates.operational !== undefined) updateData.operational = updates.operational
  if (updates.category !== undefined) updateData.category = updates.category
  if (updates.criticality !== undefined) updateData.criticality = updates.criticality
  if (updates.maintainable !== undefined) updateData.maintainable = updates.maintainable

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  // Org-scope check: verify all assets are within the user's scope
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
  if (!isAdmin) {
    const assets = await prisma.asset.findMany({
      where: { id: { in: assetIds } },
      select: { id: true, orgUnit: { select: { path: true } } },
    })
    const outOfScope = assets.filter(a => !a.orgUnit?.path?.startsWith(user.orgUnit.path))
    if (outOfScope.length > 0) {
      return NextResponse.json({ error: `${outOfScope.length} asset(s) outside your scope` }, { status: 403 })
    }
  }

  const result = await prisma.asset.updateMany({
    where: { id: { in: assetIds } },
    data: updateData,
  })

  // Audit log
  const updateDesc = Object.entries(updateData).map(([k, v]) => `${k}=${v}`).join(", ")
  await createAuditLog({
    performedById: user.id,
    action: `Bulk updated ${result.count} assets: ${updateDesc}`,
    actionType: "ASSET_ASSIGNMENT",
  })

  broadcastGlobal("assets", { event: "invalidate" })
  broadcastGlobal("audit", { event: "invalidate" })

  return NextResponse.json({ success: true, updated: result.count })
}
