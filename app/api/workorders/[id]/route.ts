// app/api/workorders/[id]/route.ts
// DELETE export — allows hard-deleting work orders in safe statuses.
//
// Rationale:
//   - CREATED/ASSIGNED/CHECKED_OUT: not yet being actively worked; safe to delete
//   - COMPLETED: finished but not archived; can delete if needed
//   - ARCHIVED: final state; safe to delete
//   - IN_PROGRESS: currently being worked on; EXCLUDE to prevent accidental loss
//
// Permission: wo_delete (via WoPermissionsContext matrix)

//app/api/workorders/[id]/route.ts
import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { broadcastScoped } from "@/lib/broadcast"
import { loadWoPermissionsFromDB } from "@/lib/woPermissions"
import { canWoWithMatrix } from "@/lib/workOrderGrants"
import { WO_INCLUDE } from "@/lib/woInclude"
import { createAuditLog } from "@/lib/audit"
import { publish } from "@/lib/broadcast"
import { checkoutLockBlocked } from "@/lib/woCheckout"
  

// Statuses that MAY be deleted. IN_PROGRESS excluded (active work).
const DELETABLE_STATUSES = ["CREATED", "ASSIGNED", "CHECKED_OUT", "COMPLETED", "ARCHIVED"] as const
type DeletableStatus = typeof DELETABLE_STATUSES[number]

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Server-side WO permission check using live DB matrix
  const matrix    = await loadWoPermissionsFromDB()
  const permitted = canWoWithMatrix(matrix, user.role, "wo_delete")
  if (!permitted) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await context.params

  const order = await prisma.workOrder.findUnique({
    where:  { id },
    select: { id: true, status: true, workOrderNo: true, checkedOutById: true, orgUnit: { select: { path: true } } },
  })
  if (!order) return NextResponse.json({ error: "Work order not found" }, { status: 404 })

  // Scope check
  if (!order.orgUnit.path.startsWith(user.orgUnit.path))
    return NextResponse.json({ error: "Out of scope" }, { status: 403 })

  // Checkout lock — only the holder may delete a checked-out WO
  const blocked = checkoutLockBlocked(order, user)
  if (blocked) return blocked

  // Only IN_PROGRESS is blocked (active work)
  if (order.status === "IN_PROGRESS") {
    return NextResponse.json(
      {
        error: `Cannot delete a work order in "IN_PROGRESS" state. ` +
               `Complete it first, then delete. All other statuses are deletable.`,
      },
      { status: 409 }
    )
  }

  if (!(DELETABLE_STATUSES as readonly string[]).includes(order.status)) {
    return NextResponse.json(
      {
        error: `Cannot delete work order in "${order.status}" state. ` +
               `Deletable statuses: ${DELETABLE_STATUSES.join(", ")}.`,
      },
      { status: 409 }
    )
  }

  await prisma.workOrder.delete({ where: { id } })

  await createAuditLog({
    performedById: user.id,
    action: `Deleted work order ${order.workOrderNo ?? id}`,
    actionType: "WORK_ORDER",
    targetAssetTag: order.workOrderNo ?? null,
  })
  publish("audit", { event: "invalidate" })

  // Broadcast deletion — SSE handler in useWorkOrders filters on event:"deleted"
  // Scoped so only viewers whose subtree contains the (now deleted) work order
  // are told about it.
  await broadcastScoped("workorders", { event: "deleted", orderId: id }, order.orgUnit.path)

  return NextResponse.json({ success: true, id, workOrderNo: order.workOrderNo })
}