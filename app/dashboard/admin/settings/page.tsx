
// app/dashboard/admin/settings/page.tsx
// Server component — redirect if the user lacks the system_settings grant
// (role default OR personal override).
import Link from "next/link"
import type { CSSProperties } from "react"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { loadPermissionsFromDB } from "@/lib/permissions"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"
import SystemSettingsTable from "@/components/SystemSettingsTable"
import prisma from "@/lib/prisma"
import { getOrgOverview } from "@/lib/org/orgService"

export const metadata = { title: "Workspace Settings" }

// Keys surfaced as the workspace "profile" card at the top of the page.
const PROFILE_KEYS = ["site_name", "org_name", "timezone", "date_format", "theme"] as const

export default async function SystemSettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/dashboard")
  const matrix = await loadPermissionsFromDB()
  const overrides = await loadUserOverrides(user.id)
  if (!effectiveCan(matrix, user.role, "system_settings", overrides.admin)) redirect("/dashboard")

  // Workspace profile values + a live summary of the organization structure,
  // so this screen is more than a bare key/value table.
  const [profileRows, overview] = await Promise.all([
    prisma.systemSetting.findMany({ where: { key: { in: [...PROFILE_KEYS] } } }),
    getOrgOverview().catch(() => null),
  ])
  const profile: Record<string, string> = Object.fromEntries(
    profileRows.map((r) => [r.key, r.value ?? ""])
  )

  const zones = overview?.zones ?? []
  const divisions = overview?.divisions ?? []
  const departments = divisions.flatMap((d) => d.departments)
  const units = departments.reduce((n, d) => n + d.units.length, 0)
  const opsAssigned = zones.filter((z) => z.directorName).length
  const fnAssigned = departments.filter((d) => d.directorName).length
  const zoneCount = zones.filter((z) => z.category === "ADDIS_ABABA").length
  const regionCount = zones.filter((z) => z.category === "REGION").length

  const stats = [
    { label: "Zones (Addis Ababa)", value: zoneCount },
    { label: "Regions", value: regionCount },
    { label: "Divisions", value: divisions.length },
    { label: "Departments", value: departments.length },
    { label: "Local units", value: units },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>Admin</span>
          <span style={{ fontSize: 12, color: "#cbd5e1" }}>›</span>
          <span style={{ fontSize: 12, color: "#0ea5e9", fontWeight: 600 }}>Workspace settings</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>
          Workspace settings
        </h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
          Workspace profile, organization-structure snapshot and global key/value configuration.
          Reserved keys (permission matrices) are read-only here and managed by their dedicated pages.
        </p>
      </div>

      {/* ── Workspace profile ─────────────────────────────────────────── */}
      <section style={cardStyle} aria-label="Workspace profile">
        <div style={cardHeadStyle}>
          <h2 style={cardTitleStyle}>Workspace profile</h2>
          <span style={pillStyle}>Branding</span>
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px 20px", margin: 0 }}>
          {PROFILE_KEYS.map((key) => (
            <div key={key}>
              <dt style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#94a3b8" }}>
                {key.replace(/_/g, " ")}
              </dt>
              <dd style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                {profile[key] || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>not set</span>}
              </dd>
            </div>
          ))}
        </dl>
        <p style={{ fontSize: 12, color: "#64748b", margin: "14px 0 0" }}>
          These values are seeded defaults — edit them in the key/value editor below.
        </p>
      </section>

      {/* ── Organization structure snapshot ───────────────────────────── */}
      <section style={cardStyle} aria-label="Organization structure snapshot">
        <div style={cardHeadStyle}>
          <h2 style={cardTitleStyle}>Organization structure</h2>
          <Link
            href="/dashboard/organization"
            style={{ fontSize: 12, fontWeight: 600, color: "#0ea5e9" }}
          >
            Open overview →
          </Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
          <span style={{ ...pillStyle, background: "#e0f2fe", color: "#0369a1" }}>
            Operational directors {opsAssigned}/{zones.length}
          </span>
          <span style={{ ...pillStyle, background: "#ccfbf1", color: "#0f766e" }}>
            Functional directors {fnAssigned}/{departments.length}
          </span>
          <span style={pillStyle}>
            {zoneCount} {zoneCount === 1 ? "zone" : "zones"} · {regionCount}{" "}
            {regionCount === 1 ? "region" : "regions"} · {units} local units
          </span>
        </div>
        {!overview && (
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "12px 0 0" }}>
            Structure snapshot unavailable — run the organization seed to populate it.
          </p>
        )}
      </section>

      {/* ── Global key/value configuration ────────────────────────────── */}
      <div style={{ marginBottom: 10, marginTop: 4 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>All settings</h2>
        <p style={{ fontSize: 12.5, color: "#64748b", margin: "4px 0 0" }}>
          Grouped by category. Values apply workspace-wide.
        </p>
      </div>
      <SystemSettingsTable />
    </div>
  )
}

const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "16px 18px 18px",
  marginBottom: 16,
}
const cardHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  paddingBottom: 12,
  marginBottom: 14,
  borderBottom: "1px solid #e2e8f0",
}
const cardTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#0f172a",
  margin: 0,
}
const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 22,
  padding: "0 9px",
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  background: "#f1f5f9",
  color: "#475569",
  border: "1px solid #e2e8f0",
}
