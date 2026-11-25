
// app/dashboard/admin/wo-permissions/page.tsx
// Server component — redirect if the user lacks the manage_wo_permissions grant.
// Access is driven by the live admin grant matrix (same check the sidebar uses),
// so any role granted manage_wo_permissions (e.g. ADMIN) may manage WO actions,
// and per-user overrides granted via Accounts Management are also honored.
// SUPER_ADMIN WO grants remain immutable server-side.

import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { loadPermissionsFromDB } from "@/lib/permissions"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"
import WoGrantMatrixTable from "@/components/WoGrantMatrixTable"

export const metadata = { title: "Work Order Action Permissions" }

export default async function WoPermissionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/dashboard")

  const matrix = await loadPermissionsFromDB()
  const overrides = await loadUserOverrides(user.id)
  if (!effectiveCan(matrix, user.role, "manage_wo_permissions", overrides.admin)) redirect("/dashboard")

  return (
    <div style={{ padding: "var(--page-pad, 24px)" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, flexWrap:"wrap" }}>
          <span style={{ fontSize:"var(--gm-font-sm, 12px)", color:"#94a3b8" }}>Admin</span>
          <span style={{ fontSize:"var(--gm-font-sm, 12px)", color:"#cbd5e1" }}>›</span>
          <span style={{ fontSize:"var(--gm-font-sm, 12px)", color:"#7C3AED", fontWeight:600 }}>WO Action Permissions</span>
        </div>

        <h1 style={{ fontSize: "var(--gm-h1, 22px)", fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>
          Work Order Action Permission Matrix
        </h1>
        <p style={{ fontSize: "var(--gm-font, 13px)", color: "#64748b", margin: "0 0 4px" }}>
          Control which roles can perform each work order lifecycle action.
          Changes propagate live to all active sessions via SSE.
          SUPER_ADMIN permissions are immutable.
        </p>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginTop:10 }}>
          {[
            { color:"#3B82F6", bg:"#EFF6FF", text:"Visibility — who can see orders" },
            { color:"#22C55E", bg:"#F0FDF4", text:"Creation — who can create, export, delete" },
            { color:"#F97316", bg:"#FFF7ED", text:"Assignment — who can assign / reassign" },
            { color:"#8B5CF6", bg:"#F5F3FF", text:"Lifecycle — per-step state transitions" },
          ].map(({ color, bg, text }) => (
            <div key={text} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px", background:bg, borderRadius:6, fontSize:"var(--gm-font-sm, 11px)", color:"#374151" }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background:color, display:"inline-block", flexShrink:0 }}/>
              {text}
            </div>
          ))}
        </div>
      </div>

      <WoGrantMatrixTable />
    </div>
  )
}
