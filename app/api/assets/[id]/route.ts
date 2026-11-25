
// app/api/assets/[id]/route.ts
import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { broadcastScoped } from "@/lib/broadcast"
import { safeParseBody, patchTagSchema } from "@/lib/validate"
import { canAccess } from "@/lib/rbac"
import { recordAssetEvent, ASSET_EVENT } from "@/lib/assetEvents"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Only MANAGER and above can edit tag numbers
  if (!["ADMIN","SUPER_ADMIN","MANAGER"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const parsed = safeParseBody(patchTagSchema, body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { id } = await params

  // Verify asset exists and is within the caller's org scope
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: { orgUnit: true }
  })
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (!canAccess(user.orgUnit.path, asset.orgUnit.path)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const previousTag = asset.tagNumber
  const updated = await prisma.asset.update({
    where: { id },
    data: { tagNumber: parsed.data.tagNumber }
  })

  // Tag number is one of the few mutable identity fields, so the change is part
  // of the asset's history (the permanent serial is not editable).
  if ((previousTag ?? null) !== (parsed.data.tagNumber ?? null)) {
    await recordAssetEvent({
      assetId: id,
      type: ASSET_EVENT.TAG_CHANGED,
      summary: `Tag number ${previousTag || "(blank)"} → ${parsed.data.tagNumber || "(blank)"}`,
      detail: { from: previousTag ?? null, to: parsed.data.tagNumber ?? null },
      performedById: user.id,
      performedByName: user.name,
      orgUnitPath: asset.orgUnit.path,
    })
  }

  broadcastScoped("assets", { event: "updated", asset: updated }, asset.orgUnit.path)

  return NextResponse.json(updated)
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const asset = await prisma.asset.findUnique({
    where: { id },
    include: { orgUnit: true }
  })
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (!canAccess(user.orgUnit.path, asset.orgUnit.path)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return NextResponse.json(asset)
}
