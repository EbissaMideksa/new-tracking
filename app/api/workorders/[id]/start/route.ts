// app/api/workorders/[id]/start/route.ts
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
import { canOverrideWoLock } from "@/lib/woCheckoutClient"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withAuth(async (_req, user) => {
    const { id } = await context.params

    const matrix = await loadWoPermissionsFromDB()
    const overrides = await loadUserOverrides(user.id)
    if (!effectiveCan(matrix, user.role, "wo_start", overrides.wo))
          return NextResponse.json({ error: "Forbidden — no start permission" }, { status: 403 })

    const order = await prisma.workOrder.findUnique({
      where: { id }, include: { orgUnit: true },
    })
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!order.orgUnit.path.startsWith(user.orgUnit.path))
      return NextResponse.json({ error: "Out of scope" }, { status: 403 })
    if (!canOverrideWoLock(user.role) && order.checkedOutById !== user.id)
      return NextResponse.json({ error: "Not checked out by you" }, { status: 403 })
    if (order.status !== "CHECKED_OUT")
      return NextResponse.json({ error: "Must be checked out first" }, { status: 400 })

    const updated = await prisma.workOrder.update({
      where: { id },
      data:  { status: "IN_PROGRESS", startedAt: new Date() },
      include: {
        assignedTo:    { select: { id: true, name: true } },
        orgUnit:       { select: { id: true, name: true, path: true } },
        createdBy:     { select: { id: true, name: true } },
        asset:         { select: { tagNumber: true, serialNumber: true } },
      },
    })

    if (updated.assetId) {
      await prisma.asset.update({
        where: { id: updated.assetId },
        data:  { status: "IN_PROGRESS", startedAt: new Date(), assignedToId: user.id },
      })
    }

    await broadcastScoped("workorders", { event: "updated", workOrder: updated }, updated.orgUnit?.path)
    await recordWorkOrderAssetEvent({
      order: updated,
      type: ASSET_EVENT.WO_STARTED,
      performedById: user.id,
      performedByName: user.name,
    })
    notifyWoStatusChange(updated, updated.status, user).catch(() => {})
    if (updated.assignedToId) {
      await broadcast(`user:${updated.assignedToId}`, { event: "task_updated", workOrder: updated })
    }

    await createAuditLog({
      performedById: user.id,
      action: `Started work order ${updated.workOrderNo ?? id}`,
      actionType: "WORK_ORDER",
      targetAssetTag: updated.workOrderNo ?? null,
    })
    publish("audit", { event: "invalidate" })

    return NextResponse.json(updated)
  }, "view_work_orders")(req)   // ← was manage_work_orders — assigned users need this
}
