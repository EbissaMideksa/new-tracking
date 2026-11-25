
// app/dashboard/admin/accounts/page.tsx
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { loadPermissionsFromDB } from "@/lib/permissions"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"
import UserPermissionsPanel from "@/components/UserPermissionsPanel"

export const metadata = { title: "Accounts Management" }

export default async function AccountsManagementPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/dashboard")

  const matrix = await loadPermissionsFromDB()
  const overrides = await loadUserOverrides(user.id)
  const canManageAdmin = effectiveCan(matrix, user.role, "manage_permissions", overrides.admin)
  const canManageWo = effectiveCan(matrix, user.role, "manage_wo_permissions", overrides.admin)
  if (!canManageAdmin && !canManageWo) redirect("/dashboard")

  return (
    <div style={{ padding: "var(--page-pad, 24px)" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: "var(--gm-h1, 22px)", fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>
          Accounts Management
        </h1>
        <p style={{ fontSize: "var(--gm-font, 13px)", color: "#64748b", margin: 0 }}>
          Select a user to grant or revoke individual permissions. Overrides apply on top of
          their role and take effect live across all their active sessions.
        </p>
      </div>
      <UserPermissionsPanel />
    </div>
  )
}
