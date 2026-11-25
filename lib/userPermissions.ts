// lib/userPermissions.ts
// ──────────────────────────────────────────────────────────────────────────
// Per-user permission overrides. These sit ON TOP of the role-based grant
// matrices (lib/adminGrants.ts, lib/workOrderGrants.ts) — they don't replace
// them. A user's *effective* permission for an action is:
//
//   1. explicitly revoked for this user  → false
//   2. explicitly granted for this user  → true
//   3. otherwise                          → whatever their role grants
//
// This file only handles persistence — see lib/effectivePermissions.ts for
// the resolution logic shared by server and client code.
//
// NOTE: this uses `prisma` directly (via `@/lib/db`), mirroring the same
// pattern your role matrices already use under the hood. If
// lib/permissions.ts / lib/woPermissions.ts wrap prisma differently (a
// different client export, a cache layer, etc.), adjust the import below to
// match — the shape of every other function here can stay the same.
//
// Requires this addition to your prisma schema:
//
//   model UserPermissionOverride {
//     id          String   @id @default(cuid())
//     userId      String   @unique
//     user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
//     adminGrants Json?    // { granted: string[], revoked: string[] }
//     woGrants    Json?    // { granted: string[], revoked: string[] }
//     updatedById String?
//     updatedAt   DateTime @updatedAt
//   }
//
// ──────────────────────────────────────────────────────────────────────────

import  prisma  from "@/lib/prisma"

export type PermissionOverride = {
  granted: string[]
  revoked: string[]
}

export type UserOverridesBundle = {
  admin: PermissionOverride
  wo: PermissionOverride
}

const EMPTY_OVERRIDE: PermissionOverride = { granted: [], revoked: [] }

function emptyBundle(): UserOverridesBundle {
  return { admin: { granted: [], revoked: [] }, wo: { granted: [], revoked: [] } }
}

function normalize(o: unknown): PermissionOverride {
  let parsed: unknown = {}
  if (typeof o === "string") {
    if (o.length > 0) {
      try {
        parsed = JSON.parse(o)
      } catch {
        parsed = {}
      }
    }
  } else if (o && typeof o === "object") {
    parsed = o
  }
  const rec = (parsed ?? {}) as Partial<PermissionOverride>
  return {
    granted: Array.isArray(rec.granted) ? rec.granted.filter((x): x is string => typeof x === "string") : [],
    revoked: Array.isArray(rec.revoked) ? rec.revoked.filter((x): x is string => typeof x === "string") : [],
  }
}

export async function loadUserOverrides(userId: string): Promise<UserOverridesBundle> {
  const row = await prisma.userPermissionOverride.findUnique({ where: { userId } })
  if (!row) return emptyBundle()
  return {
    admin: normalize(row.adminGrants),
    wo: normalize(row.woGrants),
  }
}

// Bulk-load overrides for every user that has any — handy for list views
// that want to show an "has overrides" badge without an N+1 query.
export async function loadAllUserOverrides(): Promise<Record<string, UserOverridesBundle>> {
  const rows = await prisma.userPermissionOverride.findMany()
  const out: Record<string, UserOverridesBundle> = {}
  for (const row of rows) {
    out[row.userId] = { admin: normalize(row.adminGrants), wo: normalize(row.woGrants) }
  }
  return out
}

export async function saveUserOverrides(
  userId: string,
  bundle: UserOverridesBundle,
  updatedById: string,
): Promise<UserOverridesBundle> {
  const admin = normalize(bundle.admin)
  const wo = normalize(bundle.wo)

  await prisma.userPermissionOverride.upsert({
    where: { userId },
    update: { adminGrants: JSON.stringify(admin), woGrants: JSON.stringify(wo), updatedById },
    create: { userId, adminGrants: JSON.stringify(admin), woGrants: JSON.stringify(wo), updatedById },
  })

  return { admin, wo }
}

export async function clearUserOverrides(userId: string): Promise<void> {
  await prisma.userPermissionOverride.deleteMany({ where: { userId } })
}

export { EMPTY_OVERRIDE }

