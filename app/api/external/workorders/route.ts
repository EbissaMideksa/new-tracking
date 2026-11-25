// app/api/external/workorders/route.ts
// External API: list work orders (requires X-API-Key header).

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getApiKeyUser } from "@/lib/apiKeyAuth"
import { WO_INCLUDE } from "@/lib/woInclude"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const user = await getApiKeyUser(req)
  if (!user) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500)

  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
  const where = {
    ...(status ? { status } : {}),
    ...(isAdmin ? {} : { orgUnit: { path: { startsWith: user.orgUnit.path } } }),
  }

  const orders = await prisma.workOrder.findMany({
    where,
    include: WO_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return NextResponse.json({
    total: orders.length,
    workOrders: orders,
  })
}
