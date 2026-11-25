//app/api/assets/search/route.ts
import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q") || ""

  if (!q) return NextResponse.json([])

  // Admins see all assets (mirrors the work-orders list); everyone else is
  // scoped to their org subtree.
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)

  const assets = await prisma.asset.findMany({
    where: {
      OR: [
        { id: { contains: q } },
        { tagNumber: { contains: q } },
        { serialNumber: { contains: q } },
        { itemCode: { contains: q } }
      ],
      ...(isAdmin ? {} : { orgUnit: { path: { startsWith: user.orgUnit.path } } }),
    },
    take: 20
  })

  return NextResponse.json(assets)
}
