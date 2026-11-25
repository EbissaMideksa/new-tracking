
import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const orgId = searchParams.get("org")

    if (!orgId) return NextResponse.json([])

    /* ---------------- GET CHILD ORG UNITS ---------------- */
    const children = await prisma.orgUnit.findMany({
      where: {
        parentId: orgId,
        path: {
          startsWith: user.orgUnit.path // ✅ RBAC scope
        }
      }
    })

    if (children.length === 0) return NextResponse.json([])

    const childIds = children.map(c => c.id)

    /* ---------------- GROUP ASSETS (FAST) ---------------- */
    const grouped = await prisma.asset.groupBy({
      by: ["orgUnitId"],
      _count: true,
      where: {
        orgUnitId: { in: childIds }
      }
    })

    const countMap = new Map(
      grouped.map(g => [g.orgUnitId, g._count])
    )

    /* ---------------- MERGE ---------------- */
    const result = children.map(child => ({
      id: child.id,
      name: child.name,
      type: child.type,
      totalAssets: countMap.get(child.id) || 0
    }))

    return NextResponse.json(result)

  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    )
  }
}