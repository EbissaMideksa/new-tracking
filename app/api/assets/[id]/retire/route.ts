// app/api/assets/[id]/retire/route.ts
// Retire or dispose of an asset. Sets active=false, operational=false,
// records retirement date, reason, and disposal method.

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { broadcastScoped } from "@/lib/broadcast"
import { createAuditLog } from "@/lib/audit"
import { recordAssetEvent, ASSET_EVENT } from "@/lib/assetEvents"

export const dynamic = "force-dynamic"

function parseCustom(raw: string | null): Record<string, any> {
  if (!raw) return {}
  try {
    const p = JSON.parse(raw)
    return p && typeof p === "object" ? p : {}
  } catch {
    return {}
  }
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

  const { reason, disposalMethod, disposalDate } = body
  if (!reason) return NextResponse.json({ error: "Reason required" }, { status: 400 })

  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { tagNumber: true, serialNumber: true, orgUnit: { select: { path: true } } },
  })
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Org-scope check
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
  if (!isAdmin && !asset.orgUnit?.path?.startsWith(user.orgUnit.path)) {
    return NextResponse.json({ error: "Outside your scope" }, { status: 403 })
  }

  // Store retirement info in customFields
  const retirementInfo = {
    retiredAt: new Date().toISOString(),
    retiredById: user.id,
    retiredByName: user.name,
    reason,
    disposalMethod: disposalMethod || "STORED",
    disposalDate: disposalDate || new Date().toISOString(),
  }

  const existingCustom = await prisma.asset.findUnique({ where: { id }, select: { customFields: true } })
  const customFields = { ...parseCustom(existingCustom?.customFields ?? null), _retirement: retirementInfo }

  const updated = await prisma.asset.update({
    where: { id },
    data: {
      active: false,
      operational: false,
      customFields: JSON.stringify(customFields),
    },
  })

  await createAuditLog({
    performedById: user.id,
    action: `Retired asset ${asset.tagNumber || asset.serialNumber}: ${reason} (disposal: ${disposalMethod || "STORED"})`,
    actionType: "ASSET_ASSIGNMENT",
    targetAssetId: id,
    targetAssetTag: asset.tagNumber || asset.serialNumber,
  })

  await recordAssetEvent({
    assetId: id,
    type: ASSET_EVENT.RETIRED,
    summary: `Retired — ${reason}`,
    detail: {
      reason,
      disposalMethod: disposalMethod || "STORED",
      disposalDate: disposalDate || new Date().toISOString(),
    },
    performedById: user.id,
    performedByName: user.name,
    orgUnitPath: asset.orgUnit?.path,
  })

  broadcastScoped("assets", { event: "updated", asset: updated }, asset.orgUnit?.path)
  return NextResponse.json({ success: true, asset: updated })
}

// Reactivate a retired asset
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
  if (!isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const existingCustom = await prisma.asset.findUnique({
    where: { id },
    // orgUnit is selected so the live event can carry the asset's scope path.
    select: { customFields: true, orgUnit: { select: { path: true } } },
  })
  const customFields = { ...parseCustom(existingCustom?.customFields ?? null) }
  delete customFields._retirement

  const updated = await prisma.asset.update({
    where: { id },
    data: { active: true, operational: true, customFields: JSON.stringify(customFields) },
  })

  const retired = parseCustom(existingCustom?.customFields ?? null)._retirement
  await recordAssetEvent({
    assetId: id,
    type: ASSET_EVENT.REACTIVATED,
    summary: "Reactivated and returned to service",
    detail: {
      previousReason: retired?.reason ?? null,
      retiredAt: retired?.retiredAt ?? null,
    },
    performedById: user.id,
    performedByName: user.name,
    orgUnitPath: existingCustom?.orgUnit?.path,
  })

  broadcastScoped("assets", { event: "updated", asset: updated }, existingCustom?.orgUnit?.path)
  return NextResponse.json({ success: true, asset: updated })
}
