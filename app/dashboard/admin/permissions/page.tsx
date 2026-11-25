
// app/dashboard/admin/permissions/page.tsx
// Server component — redirect if the user lacks the manage_permissions grant.
// Access is driven by the live admin grant matrix (same check the sidebar uses),
// so any role granted manage_permissions (e.g. SUPER_ADMIN, ADMIN) may manage
// the permission matrix, and per-user overrides granted via Accounts
// Management are also honored. SUPER_ADMIN grants remain immutable server-side.
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { loadPermissionsFromDB } from "@/lib/permissions"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"
import GrantMatrixTable from "@/components/GrantMatrixTable"

export const metadata = { title: "Permission Matrix" }

export default async function PermissionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/dashboard")

  const matrix = await loadPermissionsFromDB()
  const overrides = await loadUserOverrides(user.id)
  if (!effectiveCan(matrix, user.role, "manage_permissions", overrides.admin)) redirect("/dashboard")

  return (
    <div style={{ padding: "var(--page-pad, 24px)" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: "var(--gm-h1, 22px)", fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>
          Permission Matrix
        </h1>
        <p style={{ fontSize: "var(--gm-font, 13px)", color: "#64748b", margin: 0 }}>
          Configure role permissions. Changes propagate live to all active sessions via SSE.
          SUPER_ADMIN permissions are immutable.
        </p>
      </div>
      <GrantMatrixTable />
    </div>
  )
}
