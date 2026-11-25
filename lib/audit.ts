
// lib/audit.ts
import prisma from "./prisma"

export interface AuditLogInput {
  performedById: string
  action: string
  actionType: string
  targetUserName?: string | null
  targetUserEmail?: string | null
  targetAssetId?: string | null
  targetAssetTag?: string | null
  /** Structured payload (e.g. field-level changes) stored in Audit.metadata. */
  metadata?: unknown
}

export async function createAuditLog({
  performedById,
  action,
  actionType,
  targetUserName,
  targetUserEmail,
  targetAssetId,
  targetAssetTag,
  metadata,
}: AuditLogInput) {
  try {
    await prisma.audit.create({
      data: {
        action,
        actionType,
        performedById,
        targetUserName: targetUserName || null,
        targetUserEmail: targetUserEmail || null,
        targetAssetId: targetAssetId || null,
        targetAssetTag: targetAssetTag || null,
        metadata: metadata === undefined ? null : JSON.stringify(metadata),
      },
    })
  } catch (err) {
    console.error("Failed to create audit log:", err)
  }
}

// ── Permission-matrix diff ───────────────────────────────────────────────────
// Returns per-role lists of added / removed permission actions between two
// grant matrices (shape: Record<role, action[]>). Only roles with changes
// are included. Used to make permission changes specific in the audit log.
export function diffPermissionMatrix(
  oldM: Record<string, string[]>,
  newM: Record<string, string[]>,
): { role: string; added: string[]; removed: string[] }[] {
  const roles = new Set<string>([...Object.keys(oldM), ...Object.keys(newM)])
  const out: { role: string; added: string[]; removed: string[] }[] = []
  for (const role of roles) {
    const oldSet = new Set(oldM[role] ?? [])
    const newSet = new Set(newM[role] ?? [])
    const added = [...newSet].filter((a) => !oldSet.has(a)).sort()
    const removed = [...oldSet].filter((a) => !newSet.has(a)).sort()
    if (added.length || removed.length) out.push({ role, added, removed })
  }
  return out.sort((a, b) => a.role.localeCompare(b.role))
}
