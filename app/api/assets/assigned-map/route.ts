//app/api/assets/assigned-map/route.ts
import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const grouped = await prisma.asset.groupBy({
    by: ["orgUnitId"],
    _count: { id: true }
  })

  const map: Record<string, number> = {}
  grouped.forEach(g => {
    map[g.orgUnitId] = g._count.id
  })

  return NextResponse.json(map)
}
