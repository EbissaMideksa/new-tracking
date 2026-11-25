// app/api/org/metrics/route.ts
//
// Per-org-unit counts for a given metric, used to make the org-structure
// picker show data relevant to the page it is filtering:
//
//   metric=workorders  → work orders on the Work Orders page
//   metric=users       → users on the User Management page
//   metric=audit       → audit entries on the Audit page
//   metric=assets      → assets on the Analytics / Assets pages
//
// Counts are DIRECT counts for each unit (not rolled up); the picker rolls
// them up along the tree so a parent shows its whole subtree.
//
// Scope: always the caller's own org-unit subtree. The counts are intentionally
// NOT narrowed by any active `?org=` filter, so the picker always shows the
// full distribution across the branch.

import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { functionalPlacements } from "@/lib/org/functionalPlacement"


export const dynamic = "force-dynamic"

type Metric = "workorders" | "users" | "audit" | "assets"
const METRICS: Metric[] = ["workorders", "users", "audit", "assets"]

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const metric = (searchParams.get("metric") || "assets") as Metric
  if (!METRICS.includes(metric)) {
    return NextResponse.json({ error: "Unknown metric" }, { status: 400 })
  }

  const path = user.orgUnit.path
  const counts: Record<string, number> = {}

  if (metric === "workorders") {
    const rows = await prisma.workOrder.groupBy({
      by: ["orgUnitId"],
      where: { orgUnit: { path: { startsWith: path } } },
      _count: { _all: true },
    })
    for (const r of rows) counts[r.orgUnitId] = r._count._all
  } else if (metric === "users") {
    const rows = await prisma.user.groupBy({
      by: ["orgUnitId"],
      where: { orgUnit: { path: { startsWith: path } } },
      _count: { _all: true },
    })
    for (const r of rows) counts[r.orgUnitId] = r._count._all
  } else if (metric === "assets") {
    const rows = await prisma.asset.groupBy({
      by: ["orgUnitId"],
      where: { orgUnit: { path: { startsWith: path } } },
      _count: { _all: true },
    })
    for (const r of rows) counts[r.orgUnitId] = r._count._all
  } else {
    // Audit rows carry no orgUnitId — group by the performer's org unit.
    // Raw SQL (parameterised) because Prisma groupBy cannot group by a
    // relation's field. `left(...)` compares an exact prefix, so `_`/`%` in a
    // path can never widen the scope.
    const rows = await prisma.$queryRaw<{ id: string; count: number }[]>`
      SELECT u."orgUnitId" AS id, COUNT(*)::int AS count
        FROM "Audit" a
        JOIN "User" u ON u.id = a."performedById"
        JOIN "OrgUnit" o ON o.id = u."orgUnitId"
       WHERE left(o.path, length(${path})) = ${path}
       GROUP BY 1
    `
    for (const r of rows) counts[r.id] = Number(r.count)
  }

    // Functional placement of field workers (their department's mirrored Zones/Regions
  // nodes). Returned separately so callers add it only where a department is shown;
  // adding it everywhere would double-count the common ancestors (the country root).
  let functionalCounts: Record<string, number> | undefined
  if (metric === "users") {
    functionalCounts = {}
    for (const p of (await functionalPlacements()).values()) {
      if (!p.path.startsWith(path)) continue
      functionalCounts[p.orgUnitId] = (functionalCounts[p.orgUnitId] ?? 0) + 1
    }
  }

  const total = Object.values(counts).reduce((n, c) => n + c, 0)

    return NextResponse.json(
    { metric, counts, functionalCounts, total },
    { headers: { "Cache-Control": "no-store" } }
  )
}
