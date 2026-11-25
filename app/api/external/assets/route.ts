// app/api/external/assets/route.ts
// External API: list assets (requires X-API-Key header).
// Used by ERP/CMMS integrations.

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getApiKeyUser } from "@/lib/apiKeyAuth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const user = await getApiKeyUser(req)
  if (!user) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get("org")
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 1000)

  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)
  const where = orgId
    ? { orgUnitId: orgId }
    : isAdmin ? undefined : { orgUnit: { path: { startsWith: user.orgUnit.path } } }

  const assets = await prisma.asset.findMany({
    where,
    select: {
      id: true, tagNumber: true, serialNumber: true, itemCode: true,
      itemCodeDescription: true, assetDescription: true, category: true,
      active: true, operational: true, checkedOut: true,
      warrantyExpiration: true, photoUrl: true,
      orgUnit: { select: { id: true, name: true, type: true } },
      vendor: { select: { id: true, name: true } },
      purchaseDate: true, purchaseCost: true, poNumber: true,
      customFields: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return NextResponse.json({
    total: assets.length,
    assets: assets.map((a) => {
      let customFields: unknown = {}
      if (typeof a.customFields === "string" && a.customFields) {
        try {
          customFields = JSON.parse(a.customFields)
        } catch {
          customFields = {}
        }
      }
      return { ...a, customFields }
    }),
  })
}
