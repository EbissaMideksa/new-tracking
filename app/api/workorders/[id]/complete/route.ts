
import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { broadcast, broadcastScoped } from "@/lib/broadcast"
import { notifyWoStatusChange } from "@/lib/notifications"
import { withAuth } from "@/lib/withAuth"
import { loadWoPermissionsFromDB } from "@/lib/woPermissions"
import { canWoWithMatrix } from "@/lib/workOrderGrants"
import { WO_INCLUDE } from "@/lib/woInclude"
import { createAuditLog } from "@/lib/audit"
import { recordWorkOrderAssetEvent, ASSET_EVENT } from "@/lib/assetEvents"
import { publish } from "@/lib/broadcast"
import { checkoutLockBlocked } from "@/lib/woCheckout"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withAuth(async (_req, user) => {
    const { id } = await context.params

    const matrix = await loadWoPermissionsFromDB()
    const overrides = await loadUserOverrides(user.id)
    if (!effectiveCan(matrix, user.role, "wo_complete", overrides.wo))
      return NextResponse.json({ error: "Forbidden — no complete permission" }, { status: 403 })

    const order = await prisma.workOrder.findUnique({
      where: { id }, include: { orgUnit: true },
    })
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!order.orgUnit.path.startsWith(user.orgUnit.path))
      return NextResponse.json({ error: "Out of scope" }, { status: 403 })
    const blocked = checkoutLockBlocked(order, user)
    if (blocked) return blocked
    if (order.status !== "IN_PROGRESS")
      return NextResponse.json({ error: "Must be in progress" }, { status: 400 })

    const updated = await prisma.workOrder.update({
      where: { id },
      data:  { status: "COMPLETED", completedAt: new Date() },
      include: {
        assignedTo: { select: { id: true, name: true } },
        orgUnit:    { select: { id: true, name: true, path: true } },
        createdBy:  { select: { id: true, name: true } },
        asset:      { select: { tagNumber: true, serialNumber: true } },
      },
    })

    if (updated.assetId) {
      await prisma.asset.update({
        where: { id: updated.assetId },
        data:  { checkedOut: false, status: null },
      })
    }

    await broadcastScoped("workorders", { event: "updated", workOrder: updated }, updated.orgUnit?.path)
    await recordWorkOrderAssetEvent({
      order: updated,
      type: ASSET_EVENT.WO_COMPLETED,
      performedById: user.id,
      performedByName: user.name,
    })
    notifyWoStatusChange(updated, updated.status, user).catch(() => {})
    if (updated.assignedToId) {
      await broadcast(`user:${updated.assignedToId}`, {
        event: "openWorkOrdersUpdated",
        userId: updated.assignedToId,
      })
    }

    await createAuditLog({
      performedById: user.id,
      action: `Completed work order ${updated.workOrderNo ?? id}`,
      actionType: "WORK_ORDER",
      targetAssetTag: updated.workOrderNo ?? null,
    })
    publish("audit", { event: "invalidate" })

    return NextResponse.json(updated)
  }, "view_work_orders")(req)   // ← was manage_work_orders
}
