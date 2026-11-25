
// lib/assetEvents.ts
//
// The asset transaction log — the trail behind the register's "Operational
// Flag" column. Every operation that moves an asset through its life writes one
// row here: checkout/checkin, work-order milestones, parent/child changes,
// meter readings, up/down, downtime acknowledgement, retire/reactivate.
//
// Deliberately separate from Audit (lib/audit.ts): Audit answers "who changed
// permissions / who was assigned", is not scoped to an asset, and is not
// indexed for a per-asset timeline. This log answers "what happened to this
// asset, in order".
import prisma from "./prisma"

/**
 * Canonical transaction kinds. `type` is a plain String column, so this is a
 * convention rather than a DB constraint — a new kind can still be recorded
 * before it is added here (lib/assetEvents.record accepts any string), which
 * keeps a deploy from being blocked on a migration for a new meter type.
 */
export const ASSET_EVENT = {
  CREATED:        "CREATED",
  UPDATED:        "UPDATED",
  TAG_CHANGED:    "TAG_CHANGED",
  MOVED:          "MOVED",
  CHECKED_OUT:    "CHECKED_OUT",
  CHECKED_IN:     "CHECKED_IN",
  PARENT_SET:     "PARENT_SET",
  PARENT_REMOVED: "PARENT_REMOVED",
  CHILD_ADDED:    "CHILD_ADDED",
  CHILD_REMOVED:  "CHILD_REMOVED",
  WO_CREATED:     "WO_CREATED",
  WO_CHECKED_OUT: "WO_CHECKED_OUT",
  WO_STARTED:     "WO_STARTED",
  WO_COMPLETED:   "WO_COMPLETED",
  WO_ARCHIVED:    "WO_ARCHIVED",
  METER_READING:  "METER_READING",
  UP:             "UP",
  DOWN:           "DOWN",
  ACKNOWLEDGE:    "ACKNOWLEDGE",
  DOWNTIME:       "DOWNTIME",
  RETIRED:        "RETIRED",
  REACTIVATED:    "REACTIVATED",
} as const

export type AssetEventType = (typeof ASSET_EVENT)[keyof typeof ASSET_EVENT]

/** Short human labels for the timeline UI. */
export const ASSET_EVENT_LABEL: Record<string, string> = {
  CREATED:        "Added",
  UPDATED:        "Updated",
  TAG_CHANGED:    "Tag number changed",
  MOVED:          "Moved",
  CHECKED_OUT:    "Checked out",
  CHECKED_IN:     "Checked in",
  PARENT_SET:     "Parent set",
  PARENT_REMOVED: "Parent removed",
  CHILD_ADDED:    "Child added",
  CHILD_REMOVED:  "Child removed",
  WO_CREATED:     "Work order created",
  WO_CHECKED_OUT: "Work order checked out",
  WO_STARTED:     "Work started",
  WO_COMPLETED:   "Work completed",
  WO_ARCHIVED:    "Work order archived",
  METER_READING:  "Meter reading",
  UP:             "Service up",
  DOWN:           "Service down",
  ACKNOWLEDGE:    "Acknowledged",
  DOWNTIME:       "Downtime",
  RETIRED:        "Retired",
  REACTIVATED:    "Reactivated",
}

/** Accent colour per kind, for the timeline dots. */
export const ASSET_EVENT_COLOR: Record<string, string> = {
  CREATED:        "#16a34a",
  UPDATED:        "#64748b",
  TAG_CHANGED:    "#64748b",
  MOVED:          "#2563eb",
  CHECKED_OUT:    "#d97706",
  CHECKED_IN:     "#16a34a",
  PARENT_SET:     "#0ea5e9",
  PARENT_REMOVED: "#94a3b8",
  CHILD_ADDED:    "#0ea5e9",
  CHILD_REMOVED:  "#94a3b8",
  WO_CREATED:     "#6366f1",
  WO_CHECKED_OUT: "#d97706",
  WO_STARTED:     "#0ea5e9",
  WO_COMPLETED:   "#16a34a",
  WO_ARCHIVED:    "#64748b",
  METER_READING:  "#7c3aed",
  UP:             "#16a34a",
  DOWN:           "#dc2626",
  ACKNOWLEDGE:    "#0891b2",
  DOWNTIME:       "#dc2626",
  RETIRED:        "#475569",
  REACTIVATED:    "#16a34a",
}

export interface RecordAssetEventInput {
  assetId: string
  type: string
  summary: string
  detail?: unknown
  performedById?: string | null
  performedByName?: string | null
  /** Org path at the time of the event — lets scoped reports avoid a join. */
  orgUnitPath?: string | null
}

/**
 * Append one transaction to an asset's log.
 *
 * Best-effort by design, mirroring createAuditLog: a failed log write must
 * never roll back the business operation that triggered it (an asset must still
 * be checked out just because its audit row could not be inserted). The error
 * is logged so it is visible rather than silent.
 */
export async function recordAssetEvent({
  assetId,
  type,
  summary,
  detail,
  performedById,
  performedByName,
  orgUnitPath,
}: RecordAssetEventInput): Promise<void> {
  try {
    await prisma.assetEvent.create({
      data: {
        assetId,
        type,
        summary,
        detail: detail === undefined ? null : JSON.stringify(detail),
        performedById: performedById ?? null,
        performedByName: performedByName ?? null,
        orgUnitPath: orgUnitPath ?? null,
      },
    })
  } catch (err) {
    console.error(`Failed to record asset event ${type} for asset ${assetId}:`, err)
  }
}

/**
 * Record a work-order milestone against the order's asset.
 *
 * A work order is the main way an asset is worked on, so its lifecycle belongs
 * in the asset's transaction log. No-ops when the order has no asset — not every
 * WO is asset-backed, and a log row with a null asset is not representable.
 */
export async function recordWorkOrderAssetEvent({
  order,
  type,
  performedById,
  performedByName,
  extra,
}: {
  order: { id: string; assetId?: string | null; workOrderNo?: string | null; title?: string | null }
  type: string
  performedById?: string | null
  performedByName?: string | null
  extra?: Record<string, unknown>
}): Promise<void> {
  if (!order?.assetId) return
  const woLabel = `WO ${order.workOrderNo || order.id.slice(0, 8)}`
  const title = order.title ? `: ${order.title}` : ""
  await recordAssetEvent({
    assetId: order.assetId,
    type,
    summary: `${ASSET_EVENT_LABEL[type] ?? type} — ${woLabel}${title}`,
    detail: {
      workOrderId: order.id,
      workOrderNo: order.workOrderNo ?? null,
      title: order.title ?? null,
      ...extra,
    },
    performedById,
    performedByName,
  })
}
