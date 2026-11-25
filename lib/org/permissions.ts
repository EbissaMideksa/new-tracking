// lib/org/permissions.ts
// Wired to the app's existing permission system (role grant matrix + personal
// overrides, resolved by lib/effectivePermissions). Editing the OrgNode /
// GeoZone hierarchy is gated behind the same `manage_org_units` grant used by
// the legacy OrgUnit admin page (app/dashboard/admin/org-structure/page.tsx).
//
// Fail-closed: returns false when there is no signed-in user.
import { getCurrentUser } from "@/lib/auth"
import { loadPermissionsFromDB } from "@/lib/permissions"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"

export async function canEditHierarchy(): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false

  const matrix = await loadPermissionsFromDB()
  const overrides = await loadUserOverrides(user.id)

  return effectiveCan(matrix, user.role, "manage_org_units", overrides.admin)
}
