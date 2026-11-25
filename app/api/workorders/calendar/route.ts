// app/api/workorders/calendar/route.ts
// Returns work orders with scheduledAt dates for calendar view.

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { WO_INCLUDE } from "@/lib/woInclude"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = searchParams.get("month") // YYYY-MM format
  const orgId = searchParams.get("org")

  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)

  // Date range: if month provided, use that month; otherwise current month
  let startDate: Date, endDate: Date
  if (month) {
    const [y, m] = month.split("-").map(Number)
    startDate = new Date(y, m - 1, 1)
    endDate = new Date(y, m, 0, 23, 59, 59)
  } else {
    const now = new Date()
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  }

  const where = {
    scheduledAt: { gte: startDate, lte: endDate },
    ...(orgId ? { orgUnitId: orgId } : isAdmin ? {} : { orgUnit: { path: { startsWith: user.orgUnit.path } } }),
  }

  const workOrders = await prisma.workOrder.findMany({
    where,
    select: {
      id: true, workOrderNo: true, title: true, status: true, priority: true,
      scheduledAt: true, startedAt: true, completedAt: true,
      orgUnit: { select: { name: true } },
      assignedTo: { select: { name: true } },
      asset: { select: { tagNumber: true } },
    },
    orderBy: { scheduledAt: "asc" },
  })

  return NextResponse.json({ workOrders, month: month || `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}` })
}
