// app/api/workorders/[id]/comments/route.ts
// Get and add comments on a work order.

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { broadcastScoped } from "@/lib/broadcast"
import { canAccess } from "@/lib/rbac"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const comments = await prisma.woComment.findMany({
    where: { workOrderId: id },
    include: { user: { select: { name: true, photo: true } } },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(comments)
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

  if (!body.text?.trim()) return NextResponse.json({ error: "Comment text required" }, { status: 400 })

  // Resolve the work order FIRST and authorise before writing. This handler
  // previously had no scope check at all, so any authenticated user could
  // comment on any work order in the country.
  const order = await prisma.workOrder.findUnique({
    where: { id },
    select: { orgUnit: { select: { path: true } } },
  })
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!canAccess(user.orgUnit.path, order.orgUnit.path)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const comment = await prisma.woComment.create({
    data: {
      workOrderId: id,
      userId: user.id,
      text: body.text.trim(),
    },
    include: { user: { select: { name: true, photo: true } } },
  })

  broadcastScoped(
    "workorders",
    { event: "comment_added", workOrderId: id, comment },
    order.orgUnit.path,
  )
  return NextResponse.json(comment, { status: 201 })
}
