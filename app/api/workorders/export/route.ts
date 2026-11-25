// app/api/workorders/export/route.ts
// GET /api/workorders/export?status=&priority=&orgId=
// ── Returns a UTF-8 CSV download of work orders the caller is allowed to see.
// ── BOM (\uFEFF) is prepended so Excel opens it without an import wizard.

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const statusFilter   = searchParams.get("status")   || undefined
  const priorityFilter = searchParams.get("priority") || undefined
  const orgIdFilter    = searchParams.get("orgId")    || undefined

  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)

  // Build where clause — admins see everything, others see own subtree
  const where: Record<string, any> = {}
  if (!isAdmin) {
    where.orgUnit = { path: { startsWith: user.orgUnit.path } }
  }
  if (statusFilter)   where.status    = statusFilter
  if (priorityFilter) where.priority  = priorityFilter
  if (orgIdFilter)    where.orgUnitId = orgIdFilter

  const orders = await prisma.workOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      // ── Asset: only fields that actually exist on the Asset model ──────
      // The Asset model has NO "name" field — use tagNumber / serialNumber / itemCode
      asset: {
        select: {
          tagNumber:    true,
          serialNumber: true,
          itemCode:     true,   // remove if your schema doesn't have this field
        },
      },
      orgUnit: {
        select: { name: true, path: true },
      },
      assignedTo: {
        select: { name: true, email: true },
      },
      createdBy: {
        select: { name: true, email: true },
      },
    },
    take: 10_000,
  })

  // ── Build CSV ────────────────────────────────────────────────────────────
  const HEADERS = [
    "Work Order No",
    "Title",
    "Status",
    "Priority",
    "Org Unit",
    "Asset Tag",
    "Serial No",
    "Item Code",
    "Assigned To",
    "Created By",
    "Scheduled At",
    "Started At",
    "Completed At",
    "Created At",
  ]

  /** Wrap in quotes, escape embedded quotes — safe for all cell values */
  function cell(v: string | null | undefined): string {
    return `"${String(v ?? "").replace(/"/g, '""')}"`
  }

  const rows = orders.map(o => [
    cell(o.workOrderNo),
    cell(o.title),
    cell(o.status),
    cell(o.priority),
    cell(o.orgUnit?.name),
    cell(o.asset?.tagNumber),
    cell(o.asset?.serialNumber),
    cell((o.asset as any)?.itemCode),
    cell(o.assignedTo?.name),
    cell((o as any).createdBy?.name),
    cell(o.scheduledAt  ? new Date(o.scheduledAt).toLocaleString()  : ""),
    cell((o as any).startedAt ? new Date((o as any).startedAt).toLocaleString() : ""),
    cell(o.completedAt  ? new Date(o.completedAt).toLocaleString()  : ""),
    cell(new Date(o.createdAt).toLocaleString()),
  ].join(","))

  const csv      = [HEADERS.map(h => cell(h)).join(","), ...rows].join("\r\n")
  const filename = `work-orders-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
    },
  })
}
