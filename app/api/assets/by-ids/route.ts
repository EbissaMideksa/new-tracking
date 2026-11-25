import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { ids } = await req.json()

    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json({ error: "Invalid ids" }, { status: 400 })
    }

    const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)

    const assets = await prisma.asset.findMany({
      where: {
        OR: [
          { tagNumber: { in: ids } },
          { serialNumber: { in: ids } }
        ],
        ...(isAdmin ? {} : { orgUnit: { path: { startsWith: user.orgUnit.path } } }),
      },
      select: {
        id: true,
        itemCode: true,
        description: true,
        tagNumber: true,
        serialNumber: true
      }
    })

    return NextResponse.json(assets)

  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 })
  }
}
