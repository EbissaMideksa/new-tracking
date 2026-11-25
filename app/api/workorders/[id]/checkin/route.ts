
// app/api/workorders/[id]/checkin/route.ts
import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { broadcast, broadcastScoped } from "@/lib/broadcast"
import { getCurrentUser } from "@/lib/auth"
import { loadWoPermissionsFromDB } from "@/lib/woPermissions"
import { canWoWithMatrix } from "@/lib/workOrderGrants"
import { WO_INCLUDE } from "@/lib/woInclude"
import { Prisma } from "@/app/generated/prisma/browser"
import { createAuditLog } from "@/lib/audit"
import { recordWorkOrderAssetEvent, ASSET_EVENT } from "@/lib/assetEvents"
import { publish } from "@/lib/broadcast"
import { checkoutLockBlocked } from "@/lib/woCheckout"

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const matrix    = await loadWoPermissionsFromDB()
  const permitted = canWoWithMatrix(matrix, user.role, "wo_checkin")
  if (!permitted) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await context.params

  const order = await prisma.workOrder.findUnique({
    where:   { id },
    include: { orgUnit: true, asset: true },
  })
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (!order.orgUnit.path.startsWith(user.orgUnit.path))
    return NextResponse.json({ error: "Out of scope" }, { status: 403 })

  const blocked = checkoutLockBlocked(order, user)
  if (blocked) return blocked

  if (!["CHECKED_OUT", "IN_PROGRESS", "COMPLETED"].includes(order.status))
    return NextResponse.json({ error: "Work order must be checked out first" }, { status: 400 })

  // ── Archive the work order ──────────────────────────────────────────────
  // Keep checkedOutById for historical reference (don't null it)
  // The lock is released by setting status to ARCHIVED — no one can act on it
  const updated = await prisma.workOrder.update({
    where: { id },
    data:  {
      status: "ARCHIVED",
      completedById: order.checkedOutById || user.id,
      archivedAt: new Date(),
      completedAt: order.completedAt || new Date(),
      assignedToId: order.assignedToId || user.id,
    },
    include: WO_INCLUDE,
  })

  // ── Push asset to Assets page ───────────────────────────────────────────
  // Strategy:
  //   1. If WO has assetId → asset already exists; sync its orgUnit to WO's current orgUnit.
  //   2. If no assetId but assetSnapshot exists → upsert asset from snapshot.
  //   3. Neither → nothing to do.
  
  const snap = order.assetSnapshot ? (JSON.parse(order.assetSnapshot) as Record<string, any>) : null

  if (order.assetId && order.asset) {
    // Case 1: asset exists — sync orgUnit to WO's current orgUnit
    await prisma.asset.update({
      where: { id: order.assetId },
      data:  { orgUnitId: order.orgUnitId },
    })
    broadcastScoped("assets", { event: "updated", asset: { ...order.asset, orgUnitId: order.orgUnitId } }, order.orgUnit.path)

  } else if (!order.assetId && snap?.serialNumber) {
    // Case 2: WO was created without linking an asset (e.g. from an older flow)
    // Build a clean asset record from the snapshot (omit WO-specific keys)
    const {
      id: _snapId, orgUnitName: _orgName,
      // strip any non-asset keys
      ...assetFields
    } = snap

    try {
  const upserted = await prisma.asset.upsert({
    where:  { serialNumber: snap.serialNumber },
    create: { ...assetFields, orgUnitId: order.orgUnitId } as Prisma.AssetUncheckedCreateInput,
    update: { ...assetFields, orgUnitId: order.orgUnitId } as Prisma.AssetUpdateInput,
    include: { orgUnit: { select: { id: true, name: true, type: true, path: true } } },
  })
 } catch (upsertErr) {
      console.error("Asset upsert failed on checkin:", upsertErr)
      // Non-fatal: WO is still archived
    }
  }

  // ── Broadcast WO update ────────────────────────────────────────────────
  await broadcastScoped("workorders", { event: "updated", workOrder: updated }, updated.orgUnit?.path)
  await recordWorkOrderAssetEvent({
    order: updated,
    type: ASSET_EVENT.WO_ARCHIVED,
    performedById: user.id,
    performedByName: user.name,
  })

  if (updated.assignedToId) {
    await broadcast(`user:${updated.assignedToId}`, {
      event: "openWorkOrdersUpdated",
      userId: updated.assignedToId,
    })
  }

  await createAuditLog({
    performedById: user.id,
    action: `Archived (checked in) work order ${updated.workOrderNo ?? id}`,
    actionType: "WORK_ORDER",
    targetAssetTag: updated.workOrderNo ?? null,
  })
  publish("audit", { event: "invalidate" })

  return NextResponse.json(updated)
}
