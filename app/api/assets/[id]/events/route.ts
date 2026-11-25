
// app/api/assets/[id]/events/route.ts
//
// The asset transaction log — read and append.
//
// GET  → the timeline for one asset (paged), the data behind the "Operational
//        Flag" trail and the follow-up report for department approvers.
// POST → records the transaction kinds that have no other trigger yet: meter
//        readings, service up/down, downtime acknowledgement, downtime duration.
//        Lifecycle events (checkout, work orders, moves, retire) are written by
//        the routes that perform them and are rejected here, so a caller cannot
//        fabricate a checkout that never happened.

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccess } from "@/lib/rbac"
import { recordAssetEvent, ASSET_EVENT } from "@/lib/assetEvents"
import { Prisma } from "../../../../generated/prisma/client"
import { z } from "zod"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 100

const recordSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(ASSET_EVENT.METER_READING),
    meter: z.string().min(1).max(120),
    reading: z.number().finite(),
    unit: z.string().max(24).optional(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal(ASSET_EVENT.UP),
    reason: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal(ASSET_EVENT.DOWN),
    reason: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal(ASSET_EVENT.ACKNOWLEDGE),
    note: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal(ASSET_EVENT.DOWNTIME),
    minutes: z.number().int().min(0).max(60 * 24 * 365),
    note: z.string().max(500).optional(),
  }),
])

/** One-line, human-readable summary per kind — stored so the timeline reads well. */
function summarise(d: z.infer<typeof recordSchema>): string {
  switch (d.type) {
    case ASSET_EVENT.METER_READING:
      return `Meter ${d.meter}: ${d.reading}${d.unit ? ` ${d.unit}` : ""}`
    case ASSET_EVENT.UP:
      return d.reason ? `Service up — ${d.reason}` : "Service up"
    case ASSET_EVENT.DOWN:
      return d.reason ? `Service down — ${d.reason}` : "Service down"
    case ASSET_EVENT.ACKNOWLEDGE:
      return d.note ? `Acknowledged — ${d.note}` : "Acknowledged"
    case ASSET_EVENT.DOWNTIME:
      return d.minutes >= 60
        ? `Downtime recorded: ${Math.floor(d.minutes / 60)} h ${d.minutes % 60} min`
        : `Downtime recorded: ${d.minutes} min`
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { id: true, tagNumber: true, serialNumber: true, orgUnit: { select: { path: true } } },
  })
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!canAccess(user.orgUnit.path, asset.orgUnit.path)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1) || 1)
  const typeFilter = req.nextUrl.searchParams.get("type")

  const where: { assetId: string; type?: string } = { assetId: id }
  if (typeFilter) where.type = typeFilter

  const [events, total] = await Promise.all([
    prisma.assetEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.assetEvent.count({ where }),
  ])

  return NextResponse.json({
    asset: { id: asset.id, tagNumber: asset.tagNumber, serialNumber: asset.serialNumber },
    events,
    total,
    page,
    pageSize: PAGE_SIZE,
  })
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

  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { id: true, orgUnit: { select: { path: true } } },
  })
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!canAccess(user.orgUnit.path, asset.orgUnit.path)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = recordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 }
    )
  }

  const d = parsed.data
  await recordAssetEvent({
    assetId: id,
    type: d.type,
    summary: summarise(d),
    // zod has already stripped unknown keys, so the stored payload is exactly
    // the fields the kind defines.
    detail: d as unknown,
    performedById: user.id,
    performedByName: user.name,
    orgUnitPath: asset.orgUnit.path,
  })

  return NextResponse.json({ success: true })
}
