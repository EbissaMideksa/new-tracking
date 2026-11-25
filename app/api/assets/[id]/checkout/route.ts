// app/api/assets/[id]/checkout/route.ts
// Check out an asset to an individual user, or check it back in.

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { broadcast, broadcastScoped } from "@/lib/broadcast"
import { createAuditLog } from "@/lib/audit"
import { recordAssetEvent, ASSET_EVENT } from "@/lib/assetEvents"

export const dynamic = "force-dynamic"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  let body: any = {}
  try { body = await req.json() } catch {}

  const action = body.action || "checkout"
  const asset = await prisma.asset.findUnique({ where: { id }, include: { orgUnit: { select: { path: true } } } })
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Org-scope check
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
  if (!isAdmin && !asset.orgUnit?.path?.startsWith(user.orgUnit.path)) {
    return NextResponse.json({ error: "Outside your scope" }, { status: 403 })
  }

  if (action === "checkout") {
    const targetUserId = body.userId
    if (!targetUserId) return NextResponse.json({ error: "userId required" }, { status: 400 })

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { name: true, email: true } })
    if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const updated = await prisma.asset.update({
      where: { id },
      data: { checkedOut: true, assignedToId: targetUserId, startedAt: new Date() },
    })

    await createAuditLog({
      performedById: user.id,
      action: `Checked out asset ${asset.tagNumber || asset.serialNumber} to ${targetUser.name}`,
      actionType: "ASSET_ASSIGNMENT",
      targetAssetId: id,
      targetAssetTag: asset.tagNumber || asset.serialNumber,
    })

    // Transaction log — this is what makes "Checked Out" a follow-up report
    // rather than a bare flag: the timeline records who has it and since when.
    await recordAssetEvent({
      assetId: id,
      type: ASSET_EVENT.CHECKED_OUT,
      summary: `Checked out to ${targetUser.name}`,
      detail: { toUserId: targetUserId, toUserName: targetUser.name, toUserEmail: targetUser.email },
      performedById: user.id,
      performedByName: user.name,
      orgUnitPath: asset.orgUnit?.path,
    })

    broadcastScoped("assets", { event: "updated", asset: updated }, asset.orgUnit?.path)
    return NextResponse.json({ success: true, asset: updated })
  }

  if (action === "checkin") {
    const updated = await prisma.asset.update({
      where: { id },
      data: { checkedOut: false, assignedToId: null, startedAt: null },
    })

    await createAuditLog({
      performedById: user.id,
      action: `Checked in asset ${asset.tagNumber || asset.serialNumber}`,
      actionType: "ASSET_ASSIGNMENT",
      targetAssetId: id,
      targetAssetTag: asset.tagNumber || asset.serialNumber,
    })

    // The checked-out flag is cleared above; the log keeps the duration, so the
    // follow-up report can show how long the asset was out.
    const outSince = asset.startedAt ?? null
    await recordAssetEvent({
      assetId: id,
      type: ASSET_EVENT.CHECKED_IN,
      summary: outSince
        ? `Checked in after ${formatDuration(Date.now() - new Date(outSince).getTime())}`
        : "Checked in",
      detail: { outSince: outSince?.toISOString() ?? null, previousHolderId: asset.assignedToId },
      performedById: user.id,
      performedByName: user.name,
      orgUnitPath: asset.orgUnit?.path,
    })

    broadcastScoped("assets", { event: "updated", asset: updated }, asset.orgUnit?.path)
    return NextResponse.json({ success: true, asset: updated })
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}

/**
 * Compact "how long was it out" for the check-in summary. Local rather than
 * imported: the existing formatDuration helpers live in client components.
 */
function formatDuration(ms: number): string {
  if (ms <= 0) return "—"
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return "less than a minute"
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} d`
  return `${Math.floor(days / 30)} mo`
}
