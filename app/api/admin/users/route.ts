
// app/api/admin/users/route.ts
//
// GET — list of users for the Accounts Management picker. Visible to anyone
//       who can manage EITHER the admin or the WO permission matrix (role
//       default OR personal override), since either one needs to pick a
//       user to grant/revoke overrides for. The panel itself further
//       restricts editing based on which grant the viewer actually holds
//       (canManageAdmin / canManageWo in the payload).
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { loadPermissionsFromDB } from "@/lib/permissions"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"
import  prisma  from "@/lib/prisma"
import { usersInJurisdiction, hasSystemScope } from "@/lib/rbac"
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const grants = await loadPermissionsFromDB()
  const overrides = await loadUserOverrides(user.id)
  const canManageAdmin = effectiveCan(grants, user.role, "manage_permissions", overrides.admin)
  const canManageWo = effectiveCan(grants, user.role, "manage_wo_permissions", overrides.admin)
  if (!canManageAdmin && !canManageWo) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Only the users this approver may actually administer: their own org unit and
  // everything beneath it. Previously this returned every account in the system,
  // so a regional approver saw — and, via /api/admin/user-permissions, could
  // edit — users outside their jurisdiction. ADMIN/SUPER_ADMIN keep system-wide
  // visibility, matching /api/workorders and /api/assets.
  const users = await prisma.user.findMany({
    where: usersInJurisdiction(user),
    select: {
      id: true, name: true, email: true, role: true,
      orgUnit: { select: { id: true, name: true } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  })

  // Reported so the panel can state the boundary instead of the list silently
  // looking short.
  const scope = hasSystemScope(user.role)
    ? { systemWide: true as const, orgUnitName: user.orgUnit?.name ?? null }
    : { systemWide: false as const, orgUnitName: user.orgUnit?.name ?? null, orgUnitPath: user.orgUnit?.path ?? null }

  return NextResponse.json({ users, canManageAdmin, canManageWo, scope })
}
