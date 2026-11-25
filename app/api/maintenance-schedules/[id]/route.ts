// app/api/maintenance-schedules/[id]/route.ts
// PATCH — update a schedule (pause, change interval, etc.)
// DELETE — delete a schedule

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const schedule = await prisma.maintenanceSchedule.findUnique({ where: { id } })
  if (!schedule) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.maintenanceSchedule.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.intervalDays !== undefined && { intervalDays: body.intervalDays }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.active !== undefined && { active: body.active }),
      ...(body.nextRunAt !== undefined && { nextRunAt: new Date(body.nextRunAt) }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  await prisma.maintenanceSchedule.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ success: true })
}
