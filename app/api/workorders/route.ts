
// app/api/workorders/route.ts
import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { broadcastScoped } from "@/lib/broadcast"
import { WO_INCLUDE } from "@/lib/woInclude"        // ← shared
import { generateWorkOrderNo } from "@/lib/woNumber" // ← shared
import { recordWorkOrderAssetEvent, ASSET_EVENT } from "@/lib/assetEvents"

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)

  const orders = await prisma.workOrder.findMany({
    where: isAdmin
      ? undefined
      : { orgUnit: { path: { startsWith: user.orgUnit.path } } },
    include:  WO_INCLUDE,
    orderBy:  { createdAt: "desc" },
    take:     500,
  })

  return NextResponse.json(orders)
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const { title, description, orgUnitId, priority, scheduledAt, assetId } = body
  if (!title)     return NextResponse.json({ error: "Title required" },     { status: 400 })
  if (!orgUnitId) return NextResponse.json({ error: "orgUnitId required" }, { status: 400 })

  // Org-scope check: non-admins can only create WOs in their own org subtree
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
  if (!isAdmin) {
    const targetOrg = await prisma.orgUnit.findUnique({
      where: { id: orgUnitId },
      select: { path: true },
    })
    if (!targetOrg) return NextResponse.json({ error: "Org unit not found" }, { status: 404 })
    if (!targetOrg.path.startsWith(user.orgUnit.path)) {
      return NextResponse.json({ error: "Cannot create work order outside your org scope" }, { status: 403 })
    }
  }

  // If assetId provided, capture snapshot now
  let assetSnapshot: any = null
  if (assetId) {
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: { orgUnit: { select: { id: true, name: true, type: true, path: true } } },
    })
    if (asset) assetSnapshot = asset
  }

  const wo = await prisma.workOrder.create({
    data: {
      workOrderNo:   generateWorkOrderNo(),
      title,
      description:   description  || null,
      orgUnitId,
      priority:      priority     || "MEDIUM",
      scheduledAt:   scheduledAt  ? new Date(scheduledAt) : null,
      status:        "CREATED",
      createdById:   user.id,
      assetId:       assetId      || null,
      assetSnapshot: assetSnapshot ? JSON.stringify(assetSnapshot) : undefined,
    },
    include: WO_INCLUDE,
  })

  await broadcastScoped("workorders", { event: "created", workOrder: wo }, wo.orgUnit?.path)

  // The asset's transaction log records that work was raised against it — the
  // first entry in the trail an approver reads for a follow-up report. No-ops
  // when the work order is not asset-backed.
  await recordWorkOrderAssetEvent({
    order: wo,
    type: ASSET_EVENT.WO_CREATED,
    performedById: user.id,
    performedByName: user.name,
    extra: { priority: wo.priority, scheduledAt: wo.scheduledAt },
  })

  return NextResponse.json(wo, { status: 201 })
}
