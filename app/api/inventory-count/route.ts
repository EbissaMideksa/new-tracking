// app/api/inventory-count/route.ts
// Inventory count feature — start a count session, mark assets as found/missing.

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { broadcast } from "@/lib/broadcast"
import { createAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

// GET — list all assets with their count status for a given org scope
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get("org")

  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
  const where = orgId
    ? { orgUnitId: orgId }
    : isAdmin ? undefined : { orgUnit: { path: { startsWith: user.orgUnit.path } } }

  const assets = await prisma.asset.findMany({
    where,
    select: {
      id: true, tagNumber: true, serialNumber: true, itemCode: true,
      assetDescription: true, category: true, active: true, checkedOut: true,
      orgUnit: { select: { name: true } },
    },
    orderBy: { tagNumber: "asc" },
    take: 2000,
  })

  return NextResponse.json({ assets, total: assets.length })
}

// POST — mark an asset as found or missing during inventory count
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const { assetId, status } = body
  if (!assetId || !["found", "missing", "uncertain"].includes(status)) {
    return NextResponse.json({ error: "assetId and status (found/missing/uncertain) required" }, { status: 400 })
  }

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { tagNumber: true, serialNumber: true },
  })
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await createAuditLog({
    performedById: user.id,
    action: `Inventory count: ${asset.tagNumber || asset.serialNumber} marked as ${status}`,
    actionType: "ASSET_ASSIGNMENT",
    targetAssetId: assetId,
    targetAssetTag: asset.tagNumber || asset.serialNumber,
  })

  broadcast("audit", { event: "invalidate" })
  return NextResponse.json({ success: true, assetId, status })
}
