

// app/api/assets/route.ts
import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import type { Prisma } from "@/app/generated/prisma/client"

// Hard ceiling on a single request. The old value was 2000 with no pagination
// and no total, so a 1M-row inventory silently showed only the newest 2000
// records with no indication that data was missing. Requests are now paged.
const MAX_PAGE_SIZE = 200
const DEFAULT_PAGE_SIZE = 50
// Only used by the legacy (un-paged) response shape, kept for callers that
// have not been migrated yet. Surfaces the real total via headers.
const LEGACY_TAKE = 2000

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get("org")

  // If orgId provided, verify it's within the user's scope before using it
  if (orgId) {
    const targetOrg = await prisma.orgUnit.findUnique({ where: { id: orgId } })
    if (!targetOrg || !targetOrg.path.startsWith(user.orgUnit.path)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  // Server-side search. Previously the assets page downloaded up to 2000 rows
  // and filtered them in the browser, so search could never match anything
  // outside that slice.
  const q = (searchParams.get("q") || "").trim()

  const filters: Prisma.AssetWhereInput[] = [
    orgId
      ? { orgUnitId: orgId }
      : { orgUnit: { path: { startsWith: user.orgUnit.path } } },
  ]
  if (q) {
    filters.push({
      OR: [
        { tagNumber:          { contains: q } },
        { serialNumber:       { contains: q } },
        { itemCode:           { contains: q } },
        { assetDescription:   { contains: q } },
        { itemCodeDescription:{ contains: q } },
      ],
    })
  }
  const where: Prisma.AssetWhereInput = { AND: filters }

  const orderBy: Prisma.AssetOrderByWithRelationInput =
    searchParams.get("sort") === "tagNumber"
      ? { tagNumber: "asc" }
      : { createdAt: "desc" }

  const include = {
    orgUnit: { select: { id: true, name: true, type: true, path: true } },
    // The table's "Checked Out" column shows who holds the asset and since when,
    // so the current holder has to travel with each row.
    assignedTo: { select: { id: true, name: true } },
  }

  // ── Paged response ────────────────────────────────────────────────────────
  // Triggered by ?page=… — returns { items, total, page, pageSize, totalPages }
  // so the UI can show real totals and navigate instead of receiving a
  // truncated array.
  if (searchParams.has("page")) {
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1)
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
    )

    const [total, items] = await Promise.all([
      prisma.asset.count({ where }),
      prisma.asset.findMany({
        where,
        include,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  }

  // ── Legacy response (array) ───────────────────────────────────────────────
  // Kept for callers not yet migrated. The true total is exposed via headers so
  // truncation is observable rather than silent.
  const [total, assets] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({ where, include, orderBy, take: LEGACY_TAKE }),
  ])

  return NextResponse.json(assets, {
    headers: {
      "X-Total-Count": String(total),
      "X-Truncated": String(total > LEGACY_TAKE),
      "X-Returned": String(assets.length),
    },
  })
}

