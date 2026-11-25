// app/api/maintenance-schedules/route.ts
// CRUD for preventive maintenance schedules.
// GET  — list all schedules (scoped to user's org)
// POST — create a new schedule

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { broadcastScoped } from "@/lib/broadcast"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
  const schedules = await prisma.maintenanceSchedule.findMany({
    where: isAdmin ? undefined : { orgUnit: { path: { startsWith: user.orgUnit.path } } },
    include: {
      asset: { select: { tagNumber: true, serialNumber: true, itemCode: true } },
      orgUnit: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { nextRunAt: "asc" },
  })

  return NextResponse.json(schedules)
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const { title, description, templateId, assetId, orgUnitId, intervalDays, priority, nextRunAt } = body
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 })
  if (!orgUnitId) return NextResponse.json({ error: "orgUnitId required" }, { status: 400 })

  // Org-scope check. The org unit is now always resolved (not just for
  // non-admins) so the live event can carry its path and so a bad orgUnitId
  // fails cleanly instead of hitting a foreign-key error.
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
  const targetOrg = await prisma.orgUnit.findUnique({
    where:  { id: orgUnitId },
    select: { path: true },
  })
  if (!targetOrg) return NextResponse.json({ error: "Org unit not found" }, { status: 404 })
  if (!isAdmin && !targetOrg.path.startsWith(user.orgUnit.path)) {
    return NextResponse.json({ error: "Outside your org scope" }, { status: 403 })
  }

  const schedule = await prisma.maintenanceSchedule.create({
    data: {
      title,
      description: description || null,
      templateId: templateId || null,
      assetId: assetId || null,
      orgUnitId,
      intervalDays: intervalDays || 90,
      priority: priority || "MEDIUM",
      nextRunAt: nextRunAt ? new Date(nextRunAt) : new Date(Date.now() + (intervalDays || 90) * 86400000),
      createdById: user.id,
    },
  })

  broadcastScoped("workorders", { event: "schedule_created", schedule }, targetOrg.path)
  return NextResponse.json(schedule, { status: 201 })
}
