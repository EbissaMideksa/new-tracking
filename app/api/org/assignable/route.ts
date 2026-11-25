
// app/api/org/assignable/route.ts
import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { safeParseBody, assignSchema } from "@/lib/validate"
import { canAccess } from "@/lib/rbac"
import { broadcastGlobal } from "@/lib/broadcast"
import { getPoliticalAreaForOrg } from "@/lib/assetUpload"
import { ASSET_EVENT } from "@/lib/assetEvents"
import { targetTypesFor, describeTargets } from "@/lib/orgStructure"

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const parsed = safeParseBody(assignSchema, body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { assetIds, assignToId } = parsed.data

  const target = await prisma.orgUnit.findUnique({ where: { id: assignToId } })
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 })

  if (!canAccess(user.orgUnit.path, target.path)) {
    return NextResponse.json({ error: "Target is outside your scope" }, { status: 403 })
  }

  const isFullAdmin = ["ADMIN","SUPER_ADMIN"].includes(user.role)

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

  // Same rule as the single-asset move: a batch move re-derives every moved
  // asset's political area for its new home, and records one transaction each
  // so the per-asset trail is not left with a hole where a bulk move happened.
  const newArea = await getPoliticalAreaForOrg(target)

  try {
    const moved = await prisma.$transaction(async (tx) => {
      const assets = await tx.asset.findMany({
        where: { id: { in: assetIds } },
        select: { id: true, tagNumber: true, serialNumber: true, orgUnit: { select: { id: true, name: true, path: true } } }
      })

      const outOfScope = assets.filter(a => !a.orgUnit?.path?.startsWith(user.orgUnit.path))
      if (outOfScope.length > 0) {
        throw new Error(`${outOfScope.length} asset(s) are outside your org scope`)
      }

      await tx.asset.updateMany({
        where: { id: { in: assetIds } },
        // Same guard as the single move: only write a resolved area, so a target
        // unit with no region/zone above it cannot blank sourced values.
        data: newArea
          ? { orgUnitId: assignToId, politicalArea: newArea }
          : { orgUnitId: assignToId },
      })

      const preview = assets.slice(0, 5).map(a => a.tagNumber || a.serialNumber).join(", ")

      await tx.audit.create({
        data: {
          action: `Batch assigned ${assets.length} assets to ${target.name}: ${preview}`,
          actionType: "ASSET_ASSIGNMENT",
          performedById: user.id,
          metadata: JSON.stringify({ assetIds, targetName: target.name, targetId: target.id })
        }
      })

      // Transaction-log rows. Written inside the transaction so a failed batch
      // leaves no half-logged moves behind.
      if (assets.length > 0) {
        await tx.assetEvent.createMany({
          data: assets.map(a => ({
            assetId: a.id,
            type: ASSET_EVENT.MOVED,
            summary: `Moved from ${a.orgUnit?.name ?? "unknown"} to ${target.name}`,
            detail: JSON.stringify({
              fromOrgUnitId: a.orgUnit?.id ?? null,
              fromOrgUnit: a.orgUnit?.name ?? null,
              toOrgUnitId: target.id,
              toOrgUnit: target.name,
              batch: true,
            }),
            performedById: user.id,
            performedByName: user.name,
            orgUnitPath: target.path,
            createdAt: new Date(),
          })),
        })
      }

      return assets
    })

    broadcastGlobal("assets", { event: "invalidate" })
    broadcastGlobal("audit", { event: "invalidate" })

    return NextResponse.json({ success: true, moved: moved.length, politicalArea: newArea })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Assignment failed" }, { status: 403 })
  }
}
