// app/dashboard/admin/org-structure/page.tsx
// Server component — redirects if the user lacks the manage_org_units grant
// (role default OR personal override), same gate as System Settings.
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { loadPermissionsFromDB } from "@/lib/permissions"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"
import { OrgShell } from "@/components/org-structure/OrgShell"
import OrgStructureEditor from "@/components/OrgStructureEditor"
import AddDivisionForm from "@/components/org-structure/AddDivisionForm"
import s from "@/components/org-structure/org.module.css"

export const metadata = { title: "Org Structure" }

export default async function OrgStructurePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/dashboard")

  const matrix = await loadPermissionsFromDB()
  const overrides = await loadUserOverrides(user.id)
  const canEdit = effectiveCan(matrix, user.role, "manage_org_units", overrides.admin)
  if (!canEdit) redirect("/dashboard")

  return (
    <OrgShell canEdit={canEdit}>
      <div className={s.pageHead}>
        <div className={s.crumbs}>
          <span style={{ color: "var(--muted)" }}>Admin</span>
          <span style={{ color: "var(--muted)" }}>›</span>
          <a href="/dashboard/organization" style={{ color: "var(--ink)" }}>Organization</a>
          <span style={{ color: "var(--muted)" }}>›</span>
          <span style={{ color: "var(--ink)", fontWeight: 600 }}>Org Structure</span>
        </div>
        <h1 className={s.h1}>Org Structure</h1>
        <p className={s.sub}>
          Build the hierarchy: Division → Department → Category → Zone/Region → Area → Site.
          Divisions and departments sit at the corporate office; each department splits into
          two grouping folders — <b>Zones</b> (the field zones) and <b>Regions</b> (the field
          regions); every zone/region is headed by an operational director. Under Corporate:
          Section → Group.
        </p>
        <div className={s.headBtns}>
          <AddDivisionForm label="Add division" />
        </div>
      </div>
      <OrgStructureEditor />
    </OrgShell>
  )
}
