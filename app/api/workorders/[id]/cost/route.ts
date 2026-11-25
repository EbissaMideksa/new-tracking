// app/api/workorders/[id]/cost/route.ts
// Get and update cost tracking for a work order.

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
    select: { estimatedCost: true, actualCost: true, partsCost: true, laborHours: true },
  })
  if (!wo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    estimatedCost: wo.estimatedCost ? parseFloat(wo.estimatedCost.toString()) : null,
    actualCost: wo.actualCost ? parseFloat(wo.actualCost.toString()) : null,
    partsCost: wo.partsCost ? parseFloat(wo.partsCost.toString()) : null,
    laborHours: wo.laborHours ? parseFloat(wo.laborHours.toString()) : null,
  })
}

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

  const updated = await prisma.workOrder.update({
    where: { id },
    data: {
      ...(body.estimatedCost !== undefined && { estimatedCost: body.estimatedCost || null }),
      ...(body.actualCost !== undefined && { actualCost: body.actualCost || null }),
      ...(body.partsCost !== undefined && { partsCost: body.partsCost || null }),
    },
    // orgUnit is required so the live event carries its scope path — without it
    // the scoped SSE handler would (correctly) refuse to deliver the payload.
    include: { orgUnit: { select: { id: true, name: true, path: true } } },
  })

  broadcastScoped("workorders", { event: "updated", workOrder: updated }, updated.orgUnit?.path)
  return NextResponse.json({ success: true })
}
