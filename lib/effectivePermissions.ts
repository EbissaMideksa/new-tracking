// lib/effectivePermissions.ts
// ──────────────────────────────────────────────────────────────────────────
// Resolves a *user's* effective permission by layering their personal
// override on top of their role's baseline grant matrix. Works for both the
// admin-action matrix and the work-order-action matrix, since both follow
// the same { [role]: string[] } shape.
//
// SUPER_ADMIN is always immutable — overrides are ignored for that role,
// exactly like the role matrices themselves are immutable for SUPER_ADMIN.
//
// This has no server-only imports (no prisma, no next/headers) so it's safe
// to import from both server code (API routes, server components) and
// client components (e.g. to compute UI state from data already fetched).
// ──────────────────────────────────────────────────────────────────────────

import type { PermissionOverride } from "@/lib/userPermissions"

export type RoleKeyedMatrix = Record<string, string[]>

export function effectiveCan(
  roleMatrix: RoleKeyedMatrix,
  role: string,
  action: string,
  override?: PermissionOverride | null,
): boolean {
  const roleGrants = (roleMatrix[role] ?? []).includes(action)
  if (role === "SUPER_ADMIN") return roleGrants // immutable — no override allowed
  if (override?.revoked?.includes(action)) return false
  if (override?.granted?.includes(action)) return true
  return roleGrants
}

// Three-and-a-half-state view for rendering: did this action come from the
// role default, or was it explicitly overridden for this user?
export type EffectiveActionState = "granted" | "revoked" | "inherited-granted" | "inherited-revoked"

export function effectiveState(
  roleMatrix: RoleKeyedMatrix,
  role: string,
  action: string,
  override?: PermissionOverride | null,
): EffectiveActionState {
  const roleGrants = (roleMatrix[role] ?? []).includes(action)
  if (role === "SUPER_ADMIN") return roleGrants ? "inherited-granted" : "inherited-revoked"
  if (override?.revoked?.includes(action)) return "revoked"
  if (override?.granted?.includes(action)) return "granted"
  return roleGrants ? "inherited-granted" : "inherited-revoked"
}

