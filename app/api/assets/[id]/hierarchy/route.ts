
// app/api/assets/[id]/hierarchy/route.ts
//
// The asset hierarchy — "Parent Asset Number" as a real relationship.
//
// The register treats an asset's parent as a location-as-an-asset or a BOM item
// it belongs under. This endpoint maintains that link and records the change on
// BOTH assets, because a re-parent is two facts: the child gained/lost a parent,
// and the parent gained/lost a child. Logging only the child would leave the
// parent's own trail incomplete.
//
//   POST   { parentAssetId }  → set or move this asset's parent (null clears it)
//   DELETE                    → clear this asset's parent

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccess } from "@/lib/rbac"
import { recordAssetEvent, ASSET_EVENT } from "@/lib/assetEvents"
import { z } from "zod"

export const dynamic = "force-dynamic"

const setParentSchema = z.object({
  parentAssetId: z.string().uuid().nullable(),
})

const brief = { id: true, tagNumber: true, serialNumber: true } as const
type Brief = { id: string; tagNumber: string | null; serialNumber: string }
const label = (a: Brief | null) => a?.tagNumber || a?.serialNumber || a?.id?.slice(0, 8) || "?"

function loadAsset(id: string) {
  return prisma.asset.findUnique({
    where: { id },
    select: { ...brief, parentAssetId: true, orgUnit: { select: { path: true } } },
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const asset = await loadAsset(id)
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!canAccess(user.orgUnit.path, asset.orgUnit.path)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const [parent, children] = await Promise.all([
    asset.parentAssetId
      ? prisma.asset.findUnique({ where: { id: asset.parentAssetId }, select: brief })
      : Promise.resolve(null),
    prisma.asset.findMany({
      where: { parentAssetId: id },
      select: brief,
      orderBy: { tagNumber: "asc" },
      take: 200,
    }),
  ])

  return NextResponse.json({ parent, children })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const parsed = setParentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 }
    )
  }

  const asset = await loadAsset(id)
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!canAccess(user.orgUnit.path, asset.orgUnit.path)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const nextParentId = parsed.data.parentAssetId

  if (nextParentId === id) {
    return NextResponse.json({ error: "An asset cannot be its own parent" }, { status: 400 })
  }

  let newParent: (Brief & { orgUnit: { path: string } }) | null = null
  if (nextParentId) {
    newParent = await prisma.asset.findUnique({
      where: { id: nextParentId },
      select: { ...brief, orgUnit: { select: { path: true } } },
    })
    if (!newParent) return NextResponse.json({ error: "Parent asset not found" }, { status: 404 })
    if (!canAccess(user.orgUnit.path, newParent.orgUnit.path)) {
      return NextResponse.json({ error: "Parent is outside your scope" }, { status: 403 })
    }
  }

  // Reject a cycle: walk up from the proposed parent; meeting this asset again
  // means the link would close a loop that no traversal could terminate.
  if (nextParentId) {
    let cursor: string | null = nextParentId
    const seen = new Set<string>([id])
    for (let hops = 0; hops < 64 && cursor; hops++) {
      if (seen.has(cursor)) {
        return NextResponse.json(
          { error: "That parent would create a hierarchy loop" },
          { status: 400 }
        )
      }
      seen.add(cursor)
      const up: { parentAssetId: string | null } | null = await prisma.asset.findUnique({
        where: { id: cursor },
        select: { parentAssetId: true },
      })
      cursor = up?.parentAssetId ?? null
    }
  }

  const oldParent = asset.parentAssetId
    ? await prisma.asset.findUnique({ where: { id: asset.parentAssetId }, select: brief })
    : null

  const updated = await prisma.asset.update({
    where: { id },
    data: {
      parentAssetId: nextParentId,
      // Keep the denormalised parent columns the table displays in step with
      // the relation, so the register never shows a stale parent.
      parentAsset: newParent ? (newParent.tagNumber ?? newParent.serialNumber) : null,
      parentSerial: newParent ? newParent.serialNumber : null,
    },
    select: { ...brief, parentAssetId: true, parentAsset: true, parentSerial: true },
  })

  // The child's own trail.
  await recordAssetEvent({
    assetId: id,
    type: nextParentId ? ASSET_EVENT.PARENT_SET : ASSET_EVENT.PARENT_REMOVED,
    summary: nextParentId
      ? (oldParent
          ? `Parent changed ${label(oldParent)} → ${label(newParent)}`
          : `Parent set to ${label(newParent)}`)
      : (oldParent ? `Parent removed (was ${label(oldParent)})` : "Parent removed"),
    detail: {
      fromParentId: oldParent?.id ?? null,
      fromParent: oldParent ? label(oldParent) : null,
      toParentId: nextParentId,
      toParent: newParent ? label(newParent) : null,
    },
    performedById: user.id,
    performedByName: user.name,
    orgUnitPath: asset.orgUnit.path,
  })

  // The other side of the relationship, so the parent's trail is complete too.
  if (oldParent && oldParent.id !== nextParentId) {
    await recordAssetEvent({
      assetId: oldParent.id,
      type: ASSET_EVENT.CHILD_REMOVED,
      summary: `Child ${label(updated)} removed`,
      detail: { childId: id, child: label(updated) },
      performedById: user.id,
      performedByName: user.name,
    })
  }
  if (nextParentId) {
    await recordAssetEvent({
      assetId: nextParentId,
      type: ASSET_EVENT.CHILD_ADDED,
      summary: `Child ${label(updated)} added`,
      detail: { childId: id, child: label(updated) },
      performedById: user.id,
      performedByName: user.name,
      orgUnitPath: newParent?.orgUnit.path,
    })
  }

  return NextResponse.json({ success: true, asset: updated })
}

/** Clearing the parent is the same operation as POSTing a null parent. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return POST(
    new NextRequest("http://localhost/api/assets/hierarchy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentAssetId: null }),
    }),
    { params }
  )
}
