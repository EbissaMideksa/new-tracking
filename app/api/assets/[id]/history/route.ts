// app/api/assets/[id]/history/route.ts
// Returns a merged timeline of all events for an asset:
//   • the structured transaction log (AssetEvent) — authoritative, covers
//     checkout, work-order milestones, moves, hierarchy, meter readings,
//     up/down, downtime, retire
//   • legacy audit rows and work-order milestones, for history recorded before
//     the transaction log existed
//
// A work order that already has AssetEvent coverage is NOT also rendered from
// its own timestamps — otherwise every milestone recorded after the log landed
// would appear twice.

import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { id: true, tagNumber: true, serialNumber: true, createdAt: true, orgUnit: { select: { name: true } } },
  })
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Structured transaction log.
  const events = await prisma.assetEvent.findMany({
    where: { assetId: id },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  // Which work orders the log already covers — their derived milestones below
  // are suppressed so the same fact is not shown from two sources.
  const loggedWoIds = new Set<string>()
  for (const e of events) {
    const woId = (e.detail as { workOrderId?: string } | null)?.workOrderId
    if (typeof woId === "string") loggedWoIds.add(woId)
  }

  // Fetch audit logs for this asset
  const audits = await prisma.audit.findMany({
    where: { targetAssetId: id },
    select: {
      id: true,
      action: true,
      actionType: true,
      createdAt: true,
      performedByUser: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  // Fetch work orders linked to this asset
  const workOrders = await prisma.workOrder.findMany({
    where: { assetId: id },
    select: {
      id: true,
      workOrderNo: true,
      title: true,
      status: true,
      priority: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      checkedOutAt: true,
      archivedAt: true,
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  // Build timeline entries
  type Entry = { date: string; type: string; title: string; description: string; user: string | null }

  const entries: Entry[] = []

  // Asset creation
  entries.push({
    date: asset.createdAt.toISOString(),
    type: "created",
    title: "Asset added to system",
    description: `${asset.tagNumber || asset.serialNumber} added to ${asset.orgUnit?.name || "system"}`,
    user: null,
  })

  // Structured transaction log — the authoritative trail.
  for (const e of events) {
    entries.push({
      date: e.createdAt.toISOString(),
      type: e.type.toLowerCase(),
      title: e.summary,
      description: describeDetail(e.detail),
      // performedByName is a write-time snapshot, so it is the authority here;
      // the relation is not loaded (and the user may since have been removed).
      user: e.performedByName ?? null,
    })
  }

  // Audit logs
  for (const a of audits) {
    entries.push({
      date: a.createdAt.toISOString(),
      type: a.actionType === "ASSET_ASSIGNMENT" ? "assignment" : "audit",
      title: a.action,
      description: "",
      user: a.performedByUser?.name || a.performedByUser?.email || null,
    })
  }

  // Work orders — add an entry for each status milestone. Skipped entirely for
  // orders the transaction log already covers.
  for (const wo of workOrders) {
    if (loggedWoIds.has(wo.id)) continue
    const woTitle = `WO ${wo.workOrderNo || wo.id.slice(0, 8)}: ${wo.title || "Untitled"}`
    const woUser = wo.createdBy?.name || wo.assignedTo?.name || null

    entries.push({
      date: wo.createdAt.toISOString(),
      type: "wo_created",
      title: `Work order created: ${woTitle}`,
      description: `Priority: ${wo.priority || "MEDIUM"}`,
      user: woUser,
    })

    if (wo.checkedOutAt) {
      entries.push({
        date: wo.checkedOutAt.toISOString(),
        type: "wo_checkout",
        title: `Checked out: ${woTitle}`,
        description: "",
        user: wo.assignedTo?.name || null,
      })
    }

    if (wo.startedAt) {
      entries.push({
        date: wo.startedAt.toISOString(),
        type: "wo_started",
        title: `Work started: ${woTitle}`,
        description: "",
        user: wo.assignedTo?.name || null,
      })
    }

    if (wo.completedAt) {
      entries.push({
        date: wo.completedAt.toISOString(),
        type: "wo_completed",
        title: `Work completed: ${woTitle}`,
        description: "",
        user: wo.assignedTo?.name || null,
      })
    }

    if (wo.archivedAt) {
      entries.push({
        date: wo.archivedAt.toISOString(),
        type: "wo_archived",
        title: `Archived: ${woTitle}`,
        description: "",
        user: null,
      })
    }
  }

  // Sort by date descending (newest first)
  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return NextResponse.json({ asset: { tagNumber: asset.tagNumber, serialNumber: asset.serialNumber }, entries })
}

/** Keys the summary already conveys — repeating them in the description is noise. */
const DETAIL_SKIP = new Set(["workOrderId", "workOrderNo", "title", "toParentId", "fromParentId", "batch"])

/** Render an event's structured payload as a short, readable line. */
function describeDetail(raw: unknown): string {
  let detail: unknown = raw
  if (typeof raw === "string") {
    try {
      detail = JSON.parse(raw)
    } catch {
      return ""
    }
  }
  if (!detail || typeof detail !== "object") return ""
  const parts: string[] = []
  for (const [k, v] of Object.entries(detail as Record<string, unknown>)) {
    if (DETAIL_SKIP.has(k) || v === null || v === undefined || v === "") continue
    parts.push(`${humanizeKey(k)}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
  }
  return parts.join(", ")
}

function humanizeKey(k: string): string {
  return k.replace(/([A-Z])/g, " $1").toLowerCase().trim()
}
