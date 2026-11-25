// app/api/workorders/[id]/time-log/route.ts
// Log labor hours on a work order.

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { broadcastScoped } from "@/lib/broadcast"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: { laborHours: true, startedAt: true, completedAt: true },
  })
  if (!wo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Calculate elapsed hours if in progress
  let elapsedHours = null
  if (wo.startedAt && !wo.completedAt) {
    elapsedHours = (Date.now() - new Date(wo.startedAt).getTime()) / (1000 * 60 * 60)
  }

  return NextResponse.json({
    laborHours: wo.laborHours ? parseFloat(wo.laborHours.toString()) : null,
    startedAt: wo.startedAt,
    completedAt: wo.completedAt,
    elapsedHours: elapsedHours ? Math.round(elapsedHours * 100) / 100 : null,
  })
}

export async function POST(
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

  const hours = parseFloat(body.hours)
  if (isNaN(hours) || hours < 0) {
    return NextResponse.json({ error: "Valid hours required" }, { status: 400 })
  }

  const updated = await prisma.workOrder.update({
    where: { id },
    data: { laborHours: hours },
    // orgUnit is required so the live event carries its scope path.
    include: { orgUnit: { select: { id: true, name: true, path: true } } },
  })

  broadcastScoped("workorders", { event: "updated", workOrder: updated }, updated.orgUnit?.path)
  return NextResponse.json({ success: true, laborHours: hours })
}
