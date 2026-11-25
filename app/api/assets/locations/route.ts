// app/api/assets/locations/route.ts
// Returns assets grouped by location (locationName, locationCode, address).

import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
  const assets = await prisma.asset.findMany({
    where: isAdmin ? undefined : { orgUnit: { path: { startsWith: user.orgUnit.path } } },
    select: {
      id: true, tagNumber: true, serialNumber: true, itemCode: true,
      assetDescription: true, category: true, active: true, checkedOut: true,
      locationName: true, locationCode: true, address: true,
      orgUnit: { select: { name: true } },
    },
    take: 2000,
  })

  // Group by locationName (fall back to locationCode, then address, then "Unknown")
  const groups: Record<string, any[]> = {}
  for (const a of assets) {
    const key = a.locationName || a.locationCode || a.address || "Unknown Location"
    if (!groups[key]) groups[key] = []
    groups[key].push(a)
  }

  const result = Object.entries(groups)
    .map(([location, items]) => ({
      location,
      count: items.length,
      active: items.filter(a => a.active).length,
      checkedOut: items.filter(a => a.checkedOut).length,
      categories: [...new Set(items.map(a => a.category).filter(Boolean))],
      assets: items,
    }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({ locations: result, totalAssets: assets.length, totalLocations: result.length })
}
