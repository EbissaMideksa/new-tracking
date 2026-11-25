
// app/api/assets/assign/route.ts
import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { safeParseBody, singleAssignSchema } from "@/lib/validate"
import { canAccess } from "@/lib/rbac"
import { broadcastScoped, broadcastGlobal } from "@/lib/broadcast"
import { getPoliticalAreaForOrg } from "@/lib/assetUpload"
import { recordAssetEvent, ASSET_EVENT } from "@/lib/assetEvents"
import { targetTypesFor, describeTargets } from "@/lib/orgStructure"

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const parsed = safeParseBody(singleAssignSchema, body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { assetId, targetOrgUnitId } = parsed.data

  const [asset, target] = await Promise.all([
    prisma.asset.findUnique({ where: { id: assetId }, include: { orgUnit: true } }),
    prisma.orgUnit.findUnique({ where: { id: targetOrgUnitId } }),
  ])

  if (!asset)  return NextResponse.json({ error: "Asset not found" },  { status: 404 })
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 })

  if (!canAccess(user.orgUnit.path, asset.orgUnit.path)) {
    return NextResponse.json({ error: "Asset is outside your scope" }, { status: 403 })
  }
  if (!canAccess(user.orgUnit.path, target.path)) {
    return NextResponse.json({ error: "Target is outside your scope" }, { status: 403 })
  }

  const isFullAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
  if (!isFullAdmin) {
    const allowedTypes = targetTypesFor(user.role)
    if (allowedTypes.length === 0) {
      return NextResponse.json({ error: "Your role cannot perform assignments" }, { status: 403 })
    }
    if (!allowedTypes.includes(target.type as any)) {
      return NextResponse.json(
        { error: `${user.role} can only assign to ${describeTargets(user.role)} units` },
        { status: 403 }
      )
    }
  }

  // An asset's "Area (Political Admin)" is a property of WHERE it sits, not of
  // what the spreadsheet said at upload time. Re-derive it on every move, or the
  // stored column (and therefore every export and report built on it) keeps
  // pointing at the unit the asset used to live in.
  const [newArea, newAreaForOld] = await Promise.all([
    getPoliticalAreaForOrg(target),
    getPoliticalAreaForOrg(asset.orgUnit),
  ])

  const updated = await prisma.asset.update({
    where: { id: assetId },
    data:  {
      orgUnitId: targetOrgUnitId,
      // A resolved area always wins. When the new home has no region/zone/
      // corporate above it, the existing value is kept rather than blanked —
      // it came from the uploaded spreadsheet and nulling it would lose source
      // data instead of correcting a stale derivation.
      ...(newArea ? { politicalArea: newArea } : {}),
      // Keep the human-readable address aligned with the new area when the row
      // carried the derived area name (upload leaves it null for free text).
      ...(newArea && asset.address === newAreaForOld ? { address: newArea } : {}),
    },
    include: { orgUnit: { select: { id: true, name: true, type: true, path: true } } },
  })

  // Transaction log — the asset register's operational trail.
  await recordAssetEvent({
    assetId: updated.id,
    type: ASSET_EVENT.MOVED,
    summary: `Moved from ${asset.orgUnit.name} to ${target.name}`,
    detail: {
      fromOrgUnitId: asset.orgUnitId,
      fromOrgUnit: asset.orgUnit.name,
      toOrgUnitId: target.id,
      toOrgUnit: target.name,
      fromPoliticalArea: newAreaForOld ?? null,
      toPoliticalArea: newArea ?? null,
    },
    performedById: user.id,
    performedByName: user.name,
    orgUnitPath: updated.orgUnit?.path,
  })

  // Audit trail row (the live "audit" channel only carries an invalidate signal
  // so no audit data is broadcast outside the gated /api/audit endpoint).
  await prisma.audit.create({
    data: {
      action:         `Assigned asset ${updated.tagNumber || updated.serialNumber} to ${target.name}`,
      actionType:     "ASSET_ASSIGNMENT",
      performedById:  user.id,
      targetAssetId:  updated.id,
      targetAssetTag: updated.tagNumber || updated.serialNumber,
    },
  })

  // ── Live updates ──────────────────────────────────────────────────────────
  // assets → scoped to the asset's new org path so only viewers whose scope
  // contains it receive the record. audit/analytics → data-free signals.
  broadcastScoped("assets",  { event: "updated",    asset: updated }, updated.orgUnit?.path)
  broadcastGlobal("audit",   { event: "invalidate" })
  broadcastGlobal("analytics", { event: "invalidate" })
  // ─────────────────────────────────────────────────────────────────────────


  return NextResponse.json({ success: true })
}


export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get("org")

  if (orgId) {
    const targetOrg = await prisma.orgUnit.findUnique({ where: { id: orgId } })
    if (!targetOrg || !targetOrg.path.startsWith(user.orgUnit.path)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const where = orgId
    ? { orgUnitId: orgId }
    : { orgUnit: { path: { startsWith: user.orgUnit.path } } }

  const assets = await prisma.asset.findMany({
    where,
    include: { orgUnit: { select: { id: true, name: true, type: true, path: true } } },
    orderBy: { createdAt: "desc" },
    take: 2000,
  })

  return NextResponse.json(assets)
}
