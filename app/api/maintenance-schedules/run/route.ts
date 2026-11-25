// app/api/maintenance-schedules/run/route.ts
// Checks all due maintenance schedules and auto-creates work orders.
// Called by a cron job or manually via `make run-maintenance`.

import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { broadcastScoped } from "@/lib/broadcast"
import { generateWorkOrderNo } from "@/lib/woNumber"
import { WO_INCLUDE } from "@/lib/woInclude"

export const dynamic = "force-dynamic"

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
  if (!isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const now = new Date()
  const due = await prisma.maintenanceSchedule.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    include: { asset: { select: { id: true, tagNumber: true, serialNumber: true } } },
  })

  const created: string[] = []

  for (const schedule of due) {
    // Create a work order from the schedule
    const wo = await prisma.workOrder.create({
      data: {
        workOrderNo: generateWorkOrderNo(),
        title: `[PM] ${schedule.title}`,
        description: schedule.description || `Auto-generated from maintenance schedule: ${schedule.title}`,
        orgUnitId: schedule.orgUnitId,
        priority: schedule.priority,
        status: "CREATED",
        createdById: user.id,
        assetId: schedule.assetId || null,
        assetSnapshot: schedule.asset ? JSON.stringify(schedule.asset) : undefined,
      },
      include: WO_INCLUDE,
    })

    // Update the schedule: set lastRunAt and calculate nextRunAt
    await prisma.maintenanceSchedule.update({
      where: { id: schedule.id },
      data: {
        lastRunAt: now,
        nextRunAt: new Date(now.getTime() + schedule.intervalDays * 86400000),
      },
    })

    broadcastScoped("workorders", { event: "created", workOrder: wo }, wo.orgUnit?.path)
    created.push(wo.workOrderNo || wo.id.slice(0, 8))
  }

  return NextResponse.json({
    checked: due.length,
    created: created.length,
    workOrders: created,
  })
}
