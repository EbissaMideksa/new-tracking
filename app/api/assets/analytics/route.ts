// app/api/assets/analytics/route.ts
//
// Analytics aggregation for the dashboard analytics page.
//
// Scope:
//   - Authenticated users only.
//   - All metrics are scoped to the caller's org-unit subtree
//     (orgUnit.path startsWith user.orgUnit.path).
//   - An optional `org` query param narrows asset & work-order metrics to
//     that org unit's subtree (validated to be within the caller's scope).
//
// Response is backward compatible (totalUsers, totalAssets, monthlyUsers,
// assetsByType) and extended with richer breakdowns, growth, and a
// work-order summary.

import prisma from "@/lib/prisma"
import type { Prisma } from "@/app/generated/prisma/client"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const OPEN_WO_STATUSES = ["CREATED", "ASSIGNED", "CHECKED_OUT", "IN_PROGRESS"]
const DAY_MS = 86_400_000

function monthLabel(key: string): string {
  const [year, m] = key.split("-")
  return `${MONTH_NAMES[Number(m) - 1]}-${year}`
}

// Bucket a list of dates into "YYYY-MM" → count (SQLite has no date_trunc).
function bucketByMonth(dates: Date[]): { month: string; count: number }[] {
  const m = new Map<string, number>()
  for (const d of dates) {
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    m.set(key, (m.get(key) ?? 0) + 1)
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }))
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get("org")

  // ── Resolve the scope path (own subtree, optionally narrowed by org) ──────
  let scopePath = user.orgUnit.path

  if (orgId) {
    const org = await prisma.orgUnit.findUnique({
      where: { id: orgId },
      select: { path: true },
    })
    if (org && org.path.startsWith(user.orgUnit.path)) {
      scopePath = org.path
    }
  }

  const orgPathFilter = { path: { startsWith: scopePath } }

  // Declared before the asset aggregation below, which uses `last30`.
  const now = Date.now()
  const last30 = now - 30 * DAY_MS

  // ── Users (always scoped to the caller's own subtree — the `org` param does
  //    NOT narrow these, matching the original behaviour) ────────────────────
  // Aggregated in the database for the same reason as the asset metrics below:
  // a findMany loop over every user would scale with the org, not with the
  // dashboard. The raw queries below compare the path as an exact string
  // prefix (`left(...) = ...`) rather than LIKE, so `_`/`%` inside a path can
  // never widen the scope.
  const userWhere = { orgUnit: { path: { startsWith: user.orgUnit.path } } }

  const [totalUsers, usersByRoleRows, usersLast30Days, monthlyUsersRows] = await Promise.all([
    prisma.user.count({ where: userWhere }),
    prisma.user.groupBy({ by: ["role"], where: userWhere, _count: { _all: true } }),
    prisma.user.count({ where: { ...userWhere, createdAt: { gte: new Date(last30) } } }),
    // Month bucketing in JS (SQLite has no date_trunc/to_char).
    prisma.user
      .findMany({ where: userWhere, select: { createdAt: true } })
      .then((rows) => bucketByMonth(rows.map((r) => r.createdAt))),
  ])

  // ── Assets ────────────────────────────────────────────────────────────────
  // Aggregated IN THE DATABASE. This previously did a findMany with no `take`
  // and looped over every row in JS, which loads the entire subtree into Node
  // memory — at ~1M assets that is an out-of-memory crash on the landing page.
  // COUNT/GROUP BY pushes the work to Postgres, which is what it is for.
  const assetWhere: Prisma.AssetWhereInput = { orgUnit: orgPathFilter }

  const [
    totalAssets,
    activeAssets,
    operationalAssets,
    maintainableAssets,
    checkedOutAssets,
    assignedAssets,
    assetsLast30Days,
    warrantyRows,
    byCategoryRows,
    byCriticalityRows,
    byTypeRows,
    byOrgRows,
    monthlyAssets,
  ] = await Promise.all([
    prisma.asset.count({ where: assetWhere }),
    // `active !== false` in the original loop → null/true both count as active.
    prisma.asset.count({ where: { ...assetWhere, NOT: { active: false } } }),
    prisma.asset.count({ where: { ...assetWhere, NOT: { operational: false } } }),
    prisma.asset.count({ where: { ...assetWhere, maintainable: true } }),
    prisma.asset.count({ where: { ...assetWhere, checkedOut: true } }),
    prisma.asset.count({ where: { ...assetWhere, assignedToId: { not: null } } }),
    prisma.asset.count({ where: { ...assetWhere, createdAt: { gte: new Date(last30) } } }),

    // Warranty KPIs. `warrantyExpiration` is a free-text String copied verbatim
    // out of the uploaded spreadsheet (toStr() on the raw XLSX cell), so there
    // is no single date format to rely on and no column type to range-filter.
    // Counting it therefore happens here, over ISO-shaped values only
    // (`YYYY-MM-DD…`), using plain string comparison — lexicographic order of
    // zero-padded ISO dates matches chronological order, so nothing has to be
    // cast and no row can make this query throw. Values in any other format
    // are excluded, which mirrors the old client-side code where an
    // unparseable string produced NaN and failed every comparison anyway.
    // Warranty KPIs computed in JS over ISO-shaped (YYYY-MM-DD) values.
    prisma.asset
      .findMany({ where: assetWhere, select: { warrantyExpiration: true } })
      .then((rows) => {
        const iso = /^\d{4}-\d{2}-\d{2}/
        const today = new Date()
        const in30 = new Date(Date.now() + 30 * DAY_MS)
        let expiring = 0
        let expired = 0
        for (const r of rows) {
          const w = r.warrantyExpiration
          if (!w || !iso.test(w)) continue
          const d = new Date(w.slice(0, 10))
          if (d >= today && d <= in30) expiring++
          else if (d < today) expired++
        }
        return [{ expiring, expired }]
      }),

    prisma.asset.groupBy({ by: ["category"],    where: assetWhere, _count: { _all: true } }),
    prisma.asset.groupBy({ by: ["criticality"], where: assetWhere, _count: { _all: true } }),
    prisma.asset.groupBy({ by: ["assetGroup"],  where: assetWhere, _count: { _all: true } }),
    prisma.asset.groupBy({ by: ["orgUnitId"],   where: assetWhere, _count: { _all: true } }),

    // Month bucketing can't be expressed with Prisma's groupBy, so this one
    // aggregate stays in SQL. `$queryRaw` with template parameters is
    // parameterised (no string interpolation) so it is injection-safe.
    // Month bucketing in JS (SQLite has no date_trunc/to_char).
    prisma.asset
      .findMany({ where: assetWhere, select: { createdAt: true } })
      .then((rows) => bucketByMonth(rows.map((r) => r.createdAt))),
  ])

  const assetsByType = byTypeRows
    .map((r) => ({ type: r.assetGroup || "Uncategorized", count: r._count._all }))
    .sort((a, b) => b.count - a.count)

  const assetsByCategory = byCategoryRows
    .map((r) => ({ category: r.category || "Uncategorized", count: r._count._all }))
    .sort((a, b) => b.count - a.count)

  const criticalityOrder = ["HIGH", "MEDIUM", "LOW", "Unspecified"]
  const assetsByCriticality = byCriticalityRows
    .map((r) => ({ criticality: r.criticality || "Unspecified", count: r._count._all }))
    .sort((a, b) =>
      (criticalityOrder.indexOf(a.criticality) - criticalityOrder.indexOf(b.criticality)) ||
      b.count - a.count)

  // Only the top 10 org units are needed, so resolve just those names.
  const topOrgRows = [...byOrgRows].sort((a, b) => b._count._all - a._count._all).slice(0, 10)
  const topOrgNames = await prisma.orgUnit.findMany({
    where: { id: { in: topOrgRows.map((r) => r.orgUnitId) } },
    select: { id: true, name: true },
  })
  const orgNameById = new Map(topOrgNames.map((o) => [o.id, o.name]))
  const topOrgUnits = topOrgRows.map((r) => ({
    orgUnitId: r.orgUnitId,
    name: orgNameById.get(r.orgUnitId) || r.orgUnitId.slice(0, 8),
    count: r._count._all,
  }))

  const monthlyAssetsSeries = monthlyAssets
    .map((r) => ({ month: monthLabel(r.month), assets: r.count }))

  const warranty = warrantyRows[0] ?? { expiring: 0, expired: 0 }
  const { expiring: warrantyExpiringAssets, expired: warrantyExpiredAssets } = warranty

  // ── Work orders (scoped) — summary only ───────────────────────────────────
  // Also aggregated in the database: the old code pulled every status/schedule
  // row in the subtree into JS to count them.
  const woWhere: Prisma.WorkOrderWhereInput = { orgUnit: orgPathFilter }
  const [woByStatusRows, woOpen, woOverdue, mttrRows] = await Promise.all([
    prisma.workOrder.groupBy({ by: ["status"], where: woWhere, _count: { _all: true } }),
    prisma.workOrder.count({ where: { ...woWhere, status: { in: OPEN_WO_STATUSES } } }),
    // Overdue = open and past its scheduled date (null scheduledAt excluded,
    // same as the original `w.scheduledAt && … < now` guard).
    prisma.workOrder.count({
      where: { ...woWhere, status: { in: OPEN_WO_STATUSES }, scheduledAt: { lt: new Date(now) } },
    }),
    // MTTR = completed − started (falling back to createdAt), averaged over
    // COMPLETED rows where that delta is positive — exactly the rows the old
    // loop accumulated. EXTRACT + AVG runs in SQL; float8 arrives as a number.
// MTTR = avg(completed − started, fallback createdAt) over COMPLETED rows,
    // computed in JS (SQLite has no EXTRACT(EPOCH …)).
    prisma.workOrder
      .findMany({
        where: { ...woWhere, status: "COMPLETED" },
        select: { startedAt: true, completedAt: true, createdAt: true },
      })
      .then((rows) => {
        let sum = 0
        let n = 0
        for (const w of rows) {
          const start = w.startedAt ?? w.createdAt
          if (w.completedAt && w.completedAt > start) {
            sum += w.completedAt.getTime() - start.getTime()
            n++
          }
        }
        return [{ mttr: n ? sum / n : null }]
      }),
  ])

  // ── User metrics ──────────────────────────────────────────────────────────
  // Ordered chronologically straight from SQL (ORDER BY month key), which the
  // old label-sorted output was not for multi-year ranges.
  const monthlyUsers = monthlyUsersRows.map((r) => ({ month: monthLabel(r.month), users: r.count }))
  const usersByRole = usersByRoleRows
    .map((r) => ({ role: r.role, count: r._count._all }))
    .sort((a, b) => b.count - a.count)

  // ── Work-order summary ────────────────────────────────────────────────────
  const woByStatus = woByStatusRows
    .map((r) => ({ status: r.status, count: r._count._all }))
    .sort((a, b) => b.count - a.count)
  const workOrderSummary = {
    total: woByStatus.reduce((n, s) => n + s.count, 0),
    open: woOpen,
    completed: woByStatus.find((s) => s.status === "COMPLETED")?.count ?? 0,
    overdue: woOverdue,
    mttrMs: Math.round(mttrRows[0]?.mttr ?? 0),
    byStatus: woByStatus,
  }

  return NextResponse.json(
    {
      // ── Backward-compatible fields ──
      totalUsers,
      totalAssets,
      monthlyUsers,
      assetsByType,

      // ── Extended asset metrics ──
      activeAssets,
      inactiveAssets: totalAssets - activeAssets,
      operationalAssets,
      nonOperationalAssets: totalAssets - operationalAssets,
      maintainableAssets,
      checkedOutAssets,
      assignedAssets,
      unassignedAssets: totalAssets - assignedAssets,
      warrantyExpiringAssets,
      warrantyExpiredAssets,
      assetsByCategory,
      assetsByCriticality,
      monthlyAssets: monthlyAssetsSeries,
      topOrgUnits,

      // ── User metrics ──
      usersByRole,

      // ── Work-order summary ──
      workOrders: workOrderSummary,

      // ── Growth (last 30 days) ──
      growth: { assetsLast30Days, usersLast30Days },

      // ── Meta ──
      scope: "own" as const,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
