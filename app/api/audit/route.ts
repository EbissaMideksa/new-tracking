// app/api/audit/route.ts
//
// Audit log listing + summary.
//
// Scope:
//   - Requires the `view_audit` permission (via withAuth).
//   - SUPER_ADMIN sees every log; everyone else sees only logs performed by
//     users within their own org-unit subtree (relation filter in `where`).
//
// Query params:
//   - type:                    filter by actionType (e.g. USER_MANAGEMENT)
//   - performedByOrgUnitId:    only logs whose PERFORMER sits in this org unit
//                              (or any of its sub-units). Audit rows carry no
//                              orgUnitId of their own, so we resolve the unit's
//                              path and match it against the performer's unit.
//   - limit: max logs to return (default 500, capped at 2000)
//
// Response:
//   { logs: AuditEntry[], summary: { total, byType: [{ actionType, count }] } }
//   `summary` is computed across ALL scoped logs (type filter intentionally
//   ignored so tab badges keep showing true per-type counts, but the org filter
//   IS applied so badges match the narrowed list), so tab badges show counts.

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import type { Prisma } from "@/app/generated/prisma/client"
import { withAuth } from "@/lib/withAuth"

export const dynamic = "force-dynamic"

export const GET = withAuth(async (req, user) => {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type") || undefined
  const performedByOrgUnitId = searchParams.get("performedByOrgUnitId") || undefined
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 500, 1), 2000)

  // ── Scope filter (in-query, not post-fetch) ───────────────────────────────
  const scopeWhere =
    user.role === "SUPER_ADMIN"
      ? {}
      : { performedByUser: { orgUnit: { path: { startsWith: user.orgUnit.path } } } }

  // ── Org-structure filter (performer's unit + sub-units) ───────────────────
  let orgWhere: Prisma.AuditWhereInput = {}
  if (performedByOrgUnitId) {
    const unit = await prisma.orgUnit.findUnique({
      where: { id: performedByOrgUnitId },
      select: { path: true },
    })
    // Unknown unit → match nothing rather than silently dropping the filter.
    orgWhere = unit
      ? { performedByUser: { orgUnit: { path: { startsWith: unit.path } } } }
      : { performedByUser: { orgUnitId: "__no_such_org_unit__" } }
  }

  const where: Prisma.AuditWhereInput = {
    ...scopeWhere,
    ...orgWhere,
    ...(type ? { actionType: type } : {}),
  }
  // Summary ignores `type` (tab badges need every type's count) but honours
  // the org filter so badges agree with the filtered table.
  const summaryWhere: Prisma.AuditWhereInput = { ...scopeWhere, ...orgWhere }

  const [logs, byTypeRows] = await Promise.all([
    prisma.audit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        performedByUser: {
          select: {
            name: true,
            email: true,
            orgUnit: { select: { name: true, path: true } },
          },
        },
      },
    }),
    prisma.audit.groupBy({
      by: ["actionType"],
      where: summaryWhere,
      _count: { _all: true },
      orderBy: { actionType: "asc" },
    }),
  ])

  const summary = {
    total: byTypeRows.reduce((sum, r) => sum + r._count._all, 0),
    byType: byTypeRows.map((r) => ({ actionType: r.actionType, count: r._count._all })),
  }

  return NextResponse.json(
    {
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        actionType: log.actionType,
        performedByName: log.performedByUser?.name ?? "Unknown",
        performedByEmail: log.performedByUser?.email ?? null,
        performedByOrgUnit: log.performedByUser?.orgUnit?.name ?? null,
        targetUserName: log.targetUserName ?? null,
        targetUserEmail: log.targetUserEmail ?? null,
        targetAssetId: log.targetAssetId ?? null,
        targetAsset: log.targetAssetTag ?? null,
        timestamp: log.createdAt.toISOString(),
        metadata: log.metadata ?? null,
      })),
      summary,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}, "view_audit")
