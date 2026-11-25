// app/api/activity-feed/route.ts
// Returns recent system-wide activity for the dashboard feed.

import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)

  // Recent audit logs (scoped)
  const audits = await prisma.audit.findMany({
    where: isAdmin ? undefined : { performedByUser: { orgUnit: { path: { startsWith: user.orgUnit.path } } } },
    select: {
      id: true, action: true, actionType: true, createdAt: true,
      performedByUser: { select: { name: true } },
      targetAssetTag: true,
    },
    orderBy: { createdAt: "desc" },
    take: 15,
  })

  // Recent work orders (scoped)
  const workOrders = await prisma.workOrder.findMany({
    where: isAdmin ? undefined : { orgUnit: { path: { startsWith: user.orgUnit.path } } },
    select: {
      id: true, workOrderNo: true, title: true, status: true, createdAt: true,
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  // Merge and sort
  type FeedItem = { id: string; type: string; title: string; user: string | null; time: string }
  const items: FeedItem[] = []

  for (const a of audits) {
    items.push({
      id: a.id,
      type: a.actionType === "ASSET_ASSIGNMENT" ? "asset" : "system",
      title: a.action,
      user: a.performedByUser?.name || null,
      time: a.createdAt.toISOString(),
    })
  }

  for (const w of workOrders) {
    items.push({
      id: w.id,
      type: "workorder",
      title: `WO ${w.workOrderNo || w.id.slice(0, 8)} created: ${w.title || "Untitled"}`,
      user: w.createdBy?.name || null,
      time: w.createdAt.toISOString(),
    })
  }

  items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  return NextResponse.json({ items: items.slice(0, 20) })
}
