
// app/api/workorders/[id]/assign/route.ts
//
// Mirrors /api/assets/assign EXACTLY:
//   - target is an OrgUnit (not a User)
//   - canAccess()       from lib/rbac
//   - role→tier gate    from lib/orgStructure (ROLE_TARGET_TYPES)
//
// Also handles reassignment from CHECKED_OUT — resets to ASSIGNED so the
// receiving org-unit's Task Center picks it up in "To Be Processed".

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { broadcast, broadcastScoped } from "@/lib/broadcast"
import { notifyWoAssignment } from "@/lib/notifications"
import { withAuth } from "@/lib/withAuth"
import { canAccess } from "@/lib/rbac"
import { targetTypesFor, describeTargets } from "@/lib/orgStructure"
import { z } from "zod"
import { WO_INCLUDE } from "@/lib/woInclude"
import { checkoutLockBlocked } from "@/lib/woCheckout"

const schema = z.object({
  targetOrgUnitId: z.string().uuid(),
})

// Statuses from which a work order may be reassigned to another org unit.
// ARCHIVED and IN_PROGRESS are intentionally excluded:
//   - ARCHIVED: final state, no further action.
//   - IN_PROGRESS: actively being worked on; use Complete first.
const ASSIGNABLE_STATUSES = ["CREATED", "ASSIGNED", "CHECKED_OUT"] as const
type AssignableStatus = typeof ASSIGNABLE_STATUSES[number]

/* const WO_INCLUDE = {
  orgUnit:    { select: { id: true, name: true, path: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  createdBy:  { select: { id: true, name: true } },
  asset:      { select: { tagNumber: true, serialNumber: true } },
} as const
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(async (_req, user) => {
    try {
      const { id } = await context.params

      let body: unknown
      try { body = await req.json() }
      catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

      const parsed = schema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: "targetOrgUnitId (UUID) is required" },
          { status: 400 }
        )
      }

      const { targetOrgUnitId } = parsed.data

      // 1. Load WO + current org
      const order = await prisma.workOrder.findUnique({
        where: { id },
        include: { orgUnit: { select: { id: true, name: true, path: true } } },
      })
      if (!order) {
        return NextResponse.json({ error: "Work order not found" }, { status: 404 })
      }

      // 1b. Checkout lock — only the holder may reassign a checked-out WO.
      const blocked = checkoutLockBlocked(order, user)
      if (blocked) return blocked

      // 2. Only assignable statuses may be moved
      if (!ASSIGNABLE_STATUSES.includes(order.status as AssignableStatus)) {
        return NextResponse.json(
          {
            error: `Cannot reassign a work order in status "${order.status}". ` +
                   `Allowed: ${ASSIGNABLE_STATUSES.join(", ")}.`,
          },
          { status: 400 }
        )
      }

      // 3. WO must currently sit in caller's subtree
      if (!canAccess(user.orgUnit.path, order.orgUnit.path)) {
        return NextResponse.json(
          { error: "Work order is outside your org scope" },
          { status: 403 }
        )
      }

      // 4. Target org unit
      const target = await prisma.orgUnit.findUnique({
        where: { id: targetOrgUnitId },
        select: { id: true, name: true, path: true, type: true },
      })
      if (!target) {
        return NextResponse.json({ error: "Target org unit not found" }, { status: 404 })
      }

      // 5. Target must be inside caller's subtree
      if (!canAccess(user.orgUnit.path, target.path)) {
        return NextResponse.json(
          { error: "Target is outside your org scope" },
          { status: 403 }
        )
      }

      // 6. Role-tier gate — IDENTICAL to /api/assets/assign
      const isFullAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
      if (!isFullAdmin) {
        const allowedTypes = targetTypesFor(user.role)
        if (allowedTypes.length === 0) {
          return NextResponse.json(
            { error: "Your role cannot assign work orders" },
            { status: 403 }
          )
        }
        if (!allowedTypes.includes(target.type as any)) {
          return NextResponse.json(
            { error: `${user.role} can only assign to ${describeTargets(user.role)} units` },
            { status: 403 }
          )
        }
      }

      // 7. Move WO into the target org unit.
      //    Always resets to ASSIGNED so the new unit's Task Center sees it in
      //    "To Be Processed" (CREATED/ASSIGNED bucket) regardless of prior status.
      //    checkedOutById is cleared because the checkout context belongs to the
      //    previous unit's operator.
      const updated = await prisma.workOrder.update({
        where: { id },
        data: {
          orgUnitId:      targetOrgUnitId,
          assignedToId:   null,
          checkedOutById: null,
          status:         "ASSIGNED",
        },
        include: WO_INCLUDE,
      })

      // 8. Audit
      await prisma.audit.create({
        data: {
          action:        `Assigned WO ${updated.workOrderNo ?? id} to ${target.name}`,
          actionType:    "WORK_ORDER_ASSIGNMENT",
          performedById: user.id,
          metadata: JSON.stringify({
            workOrderId:  id,
            previousStatus: order.status,
            targetId:     target.id,
            targetName:   target.name,
            targetType:   target.type,
          }),
        },
      }).catch(() => {})

      // 9. Broadcast — global feed + every member of the target subtree
      await broadcastScoped("workorders", { event: "updated", workOrder: updated }, updated.orgUnit?.path)

      const members = await prisma.user.findMany({
        where: { orgUnit: { path: { startsWith: target.path } } },
        select: { id: true },
      })
      await Promise.all(
        members.map(m =>
          broadcast(`user:${m.id}`, { event: "task_assigned", workOrder: updated })
        )
      )

      // 10. Email notification to assigned users
      const assignees = await prisma.user.findMany({
        where: { orgUnit: { path: { startsWith: target.path } } },
        select: { email: true, name: true },
      })
      for (const assignee of assignees) {
        notifyWoAssignment(updated, assignee, user).catch(() => {})
      }

      return NextResponse.json(updated)
    } catch (error) {
      console.error("[wo assign] Error:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }, "manage_work_orders")(req)
}
