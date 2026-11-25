// app/api/tasks/route.ts
import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

const ACTIVE_STATUSES = ["ASSIGNED", "CHECKED_OUT", "IN_PROGRESS", "COMPLETED"]

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tasks = await prisma.workOrder.findMany({
    where: {
      assignedToId: user.id,
      status: { in: ACTIVE_STATUSES },
    },
    select: {
      id:             true,
      workOrderNo:    true,
      title:          true,
      description:    true,
      status:         true,
      priority:       true,
      orgUnitId:      true,
      scheduledAt:    true,
      startedAt:      true,
      completedAt:    true,
      createdAt:      true,
      checkedOutById: true,    // ← needed so start-button only shows to checkout owner
      assignedToId:   true,
      orgUnit:   { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      asset:     { select: { tagNumber: true, serialNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(tasks)
}
