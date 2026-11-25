// app/api/search/route.ts
// Global search across assets, work orders, and users.

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  if (!q || q.length < 2) return NextResponse.json({ assets: [], workOrders: [], users: [] })

  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
  const orgFilter = isAdmin ? undefined : { orgUnit: { path: { startsWith: user.orgUnit.path } } }

  const [assets, workOrders, users] = await Promise.all([
    prisma.asset.findMany({
      where: {
        ...orgFilter,
        OR: [
          { tagNumber: { contains: q } },
          { serialNumber: { contains: q } },
          { itemCode: { contains: q } },
          { assetDescription: { contains: q } },
        ],
      },
      select: { id: true, tagNumber: true, serialNumber: true, itemCode: true, assetDescription: true, category: true },
      take: 10,
    }),
    prisma.workOrder.findMany({
      where: {
        ...orgFilter,
        OR: [
          { title: { contains: q } },
          { workOrderNo: { contains: q } },
          { description: { contains: q } },
        ],
      },
      select: { id: true, workOrderNo: true, title: true, status: true, priority: true },
      take: 10,
    }),
    isAdmin
      ? prisma.user.findMany({
          where: { OR: [{ name: { contains: q } }, { email: { contains: q } }] },
          select: { id: true, name: true, email: true, role: true },
          take: 5,
        })
      : Promise.resolve([]),
  ])

  return NextResponse.json({ assets, workOrders, users })
}
