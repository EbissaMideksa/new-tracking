
// app/api/users/[id]/route.ts
// ALL permission checks go through the DB-backed matrix via withAuth().
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { createAuditLog } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import { Role, OrgType } from "@/lib/enums"
import { withAuth } from "@/lib/withAuth"
import { publish } from "@/lib/broadcast"  // ← NEW
import bcrypt from "bcryptjs"
import { invalidateCurrentUser } from "@/lib/auth"
import { DEFAULT_PASSWORD } from "@/lib/defaultPassword"
import { fallbackRoleForType } from "@/lib/orgStructure"
import { findImmediateBoss } from "@/lib/reportsTo"
import { userSelect } from "@/lib/userSelect"
import { isUserStatus } from "@/lib/userStatus"

type Ctx = { params: Promise<{ id: string }> }

// PUT — update user fields
// Requires manage_users in DB matrix
export async function PUT(req: NextRequest, ctx: Ctx) {
  return withAuth(async (_req, current) => {
    const { id } = await ctx.params
    if (!id) return NextResponse.json({ error: "User ID required" }, { status: 400 })

    const existing = await prisma.user.findUnique({
      where: { id },
      // `manager` only feeds the audit diff below — it is not written back.
      include: { orgUnit: true, manager: { select: { id: true, name: true } } },
    })
    if (!existing || !existing.orgUnit.path.startsWith(current.orgUnit.path)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }


    // Users are homed in the FUNCTIONAL hierarchy. If an operational unit
    // (Deputy CEO Office / Zone / Region / Area / Site) is chosen, re-home under
    // the functional department and keep the operational zone/region.
    const OPERATIONAL_TYPES = new Set(["DEPUTY_CEO_OFFICE", "ZONE", "REGION", "AREA", "SITE"])
    const ancestorPaths = (path: string): string[] => {
      const parts = path.split("/")
      const out: string[] = []
      for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join("/"))
      return out
    }

    let orgUnitId: string = body.orgUnitId ?? existing.orgUnitId
    let geoZoneId: string | null =
      body.geoZoneId !== undefined ? (body.geoZoneId ?? null) : (existing.geoZoneId ?? null)

    const targetOrg = await prisma.orgUnit.findUnique({
      where: { id: orgUnitId },
      select: { id: true, type: true, path: true },
    })
    if (!targetOrg) return NextResponse.json({ error: "Invalid OrgUnit" }, { status: 400 })
    if (!targetOrg.path.startsWith(current.orgUnit.path)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (OPERATIONAL_TYPES.has(String(targetOrg.type))) {
      const deptId = body.departmentId
      if (!deptId) {
        return NextResponse.json(
          { error: "Select a functional unit (department / section / group); set the zone/region separately for field workers." },
          { status: 400 },
        )
      }
      const dept = await prisma.orgUnit.findUnique({
        where: { id: deptId },
        select: { id: true, type: true, path: true },
      })
      if (!dept || OPERATIONAL_TYPES.has(String(dept.type)) || !dept.path.startsWith(current.orgUnit.path)) {
        return NextResponse.json({ error: "Invalid functional department" }, { status: 400 })
      }
      if (geoZoneId == null) {
        const zone = await prisma.orgUnit.findFirst({
          where: { type: { in: ["ZONE", "REGION"] as any }, path: { in: ancestorPaths(targetOrg.path) } },
          select: { id: true },
        })
        geoZoneId = zone?.id ?? null
      }
      orgUnitId = dept.id
    }

    // Reports To is DERIVED: the immediate higher-level boss — the nearest
    // person one-or-more ranks above this role, found by walking UP the org
    // tree from where the user sits (lib/reportsTo.ts). Recomputed on every
    // save (role or unit may have changed) and never resolves to the user
    // themselves. A CHIEF has no Reports To.
    const derivedManagerId = await findImmediateBoss(
      body.role ?? existing.role,
      orgUnitId,
      { excludeUserId: id },
    )

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name:      body.name,
        role:      body.role as Role,
        email:     body.email,
        phone:     body.phone,
        orgUnitId,
        // Operational zone/region for non-corporate (field) workers.
        geoZoneId,
        // ── Directory attributes — a blank input CLEARS the value ────────────
        employeeId: (body.employeeId ?? "").toString().trim() || null,  // "Oracle ID"
        jobTitle:   (body.jobTitle   ?? "").toString().trim() || null,
        // An unknown/absent status leaves the account as it was rather than
        // resetting it, so a caller that never sends the field can't unlock.
        status:     isUserStatus(body.status) ? body.status : existing.status,
        // Reports To — derived from role rank (one above in the departmentalization
        // chain: CHIEF>DIRECTOR>MANAGER>SUPERVISOR). A CHIEF has no Reports To.
        managerId:  derivedManagerId,
      },
      // Same shape as GET (lib/userSelect.ts) so the row the page replaces
      // keeps its department, manager and workload counters.
      select: userSelect,
    })

    await createAuditLog({
      performedById:   current.id,
      action:          `Updated user ${updated.name} (${updated.email})`,
      actionType:      "USER_MANAGEMENT",
      targetUserName:  updated.name,
      targetUserEmail: updated.email,
      metadata:        { changes: diffUser(existing, updated) },
    })

    // ── Live update ───────────────────────────────────────────────────
    // `userSelect` never picks the hash, so there is nothing to strip.
    publish("users",     { event: "updated", user: updated })
    publish("audit",     { event: "invalidate" })
    // ─────────────────────────────────────────────────────────────────

    revalidatePath("/dashboard/users")
    revalidatePath("/dashboard/organization")
    return NextResponse.json({ message: `User ${updated.name} updated successfully!`, user: updated })
  }, "manage_users")(req)
}

// DELETE — remove a user
// Requires manage_users in DB matrix
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return withAuth(async (_req, current) => {
    const { id } = await ctx.params

    const existing = await prisma.user.findUnique({
      where: { id },
      include: { orgUnit: true },
    })
    if (!existing || !existing.orgUnit.path.startsWith(current.orgUnit.path)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.user.delete({ where: { id } })

    await createAuditLog({
      performedById:   current.id,
      action:          `Deleted user ${existing.name} (${existing.email})`,
      actionType:      "USER_MANAGEMENT",
      targetUserName:  existing.name,
      targetUserEmail: existing.email,
      metadata:        { role: existing.role, orgUnit: existing.orgUnit?.name ?? null },
    })

    // ── Live update ───────────────────────────────────────────────────
    publish("users",     { event: "deleted", userId: id })
    publish("audit",     { event: "invalidate" })
    publish("analytics", { event: "invalidate" })
    // ─────────────────────────────────────────────────────────────────

    revalidatePath("/dashboard/users")
    revalidatePath("/dashboard/organization")
    return NextResponse.json({ success: true })
  }, "manage_users")(req)
}

// PATCH — grant / revoke ADMIN (SUPER_ADMIN only, always enforced server-side)
// Requires grant_admin in DB matrix
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return withAuth(async (_req, current) => {
    const { id } = await ctx.params
    if (!id) return NextResponse.json({ error: "User ID required" }, { status: 400 })

    // grant_admin is only ever in SUPER_ADMIN's matrix — double-check
    if (current.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only SUPER_ADMIN can change admin access" },
        { status: 403 }
      )
    }

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }
    const { grantAdmin, resetPassword } = body

    const target = await prisma.user.findUnique({
      where: { id },
      include: { orgUnit: true },
    })
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (target.role === "SUPER_ADMIN") {
      return NextResponse.json({ error: "Cannot change SUPER_ADMIN role" }, { status: 403 })
    }

    // ── Put an account back on the built-in default password ─────────────────
    // SUPER_ADMIN only (the whole handler is gated on grant_admin, which only
    // SUPER_ADMIN holds — checked above as well). The account is reset onto
    // DEFAULT_PASSWORD and re-flagged, so whoever holds it must choose a new
    // password at their next login. SUPER_ADMIN can never be the target (guard
    // above), so the one exempt account can't be reset onto a published
    // password. This is the recovery path for "user forgot their password"
    // and for bulk re-provisioning without touching the DB directly.
    if (resetPassword === true) {
      const hashed = await bcrypt.hash(DEFAULT_PASSWORD, 12)
      const reset = await prisma.user.update({
        where: { id },
        data: {
          password: hashed,
          mustChangePassword: true,
          // No self-chosen password exists right now.
          passwordChangedAt: null,
        },
        select: userSelect,
      })

      // Drop the target's cached auth row (up to 30s stale otherwise) so the
      // gate slams shut on their very next request, not on their next request
      // after the TTL.
      await invalidateCurrentUser(id)

      await createAuditLog({
        performedById:   current.id,
        action:          `Reset password of ${reset.name} (${reset.email}) to the default — change required at next login`,
        actionType:      "USER_MANAGEMENT",
        targetUserName:  reset.name,
        targetUserEmail: reset.email,
        metadata:        { resetToDefaultPassword: true, mustChangePassword: true },
      })

      // `userSelect` never picks the hash — publish the row as-is.
      publish("users",     { event: "updated", user: reset })
      publish("audit",     { event: "invalidate" })

      revalidatePath("/dashboard/users")
      revalidatePath("/dashboard/organization")
      return NextResponse.json({
        message: `${reset.name}'s password was reset — they must change it at next login`,
        user: reset,
      })
    }

    let newOrgUnitId: string
    let newRole: Role
    let newOriginalOrgUnitId: string | null

    if (grantAdmin) {
      const ancestorPaths = buildAncestorPaths(target.orgUnit.path)
      const divisionOrg = await prisma.orgUnit.findFirst({
        where: { type: OrgType.DIVISION, path: { in: ancestorPaths } },
      })
      if (!divisionOrg) {
        return NextResponse.json({ error: "No division found in org path" }, { status: 400 })
      }
      newOriginalOrgUnitId = target.orgUnitId
      newOrgUnitId         = divisionOrg.id
      newRole              = Role.ADMIN
    } else {
      const restoreId  = target.originalOrgUnitId ?? target.orgUnitId
      const restoreOrg = await prisma.orgUnit.findUnique({ where: { id: restoreId } })
      if (!restoreOrg) {
        return NextResponse.json({ error: "Original org unit not found" }, { status: 400 })
      }
      newOrgUnitId         = restoreId
      newRole              = getFallbackRole(restoreOrg.type)
      newOriginalOrgUnitId = null
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        role:              newRole,
        orgUnit:           { connect: { id: newOrgUnitId } },
        originalOrgUnitId: newOriginalOrgUnitId,
      },
      select: userSelect,
    })

    await createAuditLog({
      performedById:   current.id,
      action:          grantAdmin
        ? `Granted ADMIN to ${updated.name} — moved to ${updated.orgUnit.name}`
        : `Revoked ADMIN from ${updated.name} — restored to ${updated.orgUnit.name}`,
      actionType:      "USER_MANAGEMENT",
      targetUserName:  updated.name,
      targetUserEmail: updated.email,
      metadata:        {
        granted: !!grantAdmin,
        changes: [
          { field: "role", from: target.role, to: newRole },
          { field: "orgUnit", from: target.orgUnit?.name ?? null, to: updated.orgUnit?.name ?? null },
        ],
      },
    })

    // ── Live update ───────────────────────────────────────────────────
    publish("users",     { event: "updated", user: updated })
    publish("audit",     { event: "invalidate" })
    // ─────────────────────────────────────────────────────────────────

    revalidatePath("/dashboard/users")
    revalidatePath("/dashboard/organization")
    return NextResponse.json(updated)
  }, "grant_admin")(req)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAncestorPaths(fullPath: string): string[] {
  const parts = fullPath.split("/")
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"))
}

function getFallbackRole(orgUnitType: OrgType | string): Role {
  // Delegates to the shared tier→role map so the fallback cannot drift from
  // the shape in lib/orgStructure.ts (ZONE/REGION → the operational DIRECTOR,
  // SECTION → MANAGER, …).
  return fallbackRoleForType(orgUnitType?.toString() ?? "") as Role
}

// Build a field-level change list between the before/after user snapshots.
type UserSnapshot = {
  name: string
  email: string
  role: string
  phone: string | null
  employeeId: string | null
  jobTitle: string | null
  status: string
  orgUnit: { name: string } | null
  manager: { name: string } | null
}
function diffUser(before: UserSnapshot, after: UserSnapshot): { field: string; from: string | null; to: string | null }[] {
  const fields: [string, (u: UserSnapshot) => string | null][] = [
    ["name",       (u) => u.name],
    ["email",      (u) => u.email],
    ["role",       (u) => u.role],
    ["phone",      (u) => u.phone ?? null],
    ["employeeId", (u) => u.employeeId ?? null],
    ["jobTitle",   (u) => u.jobTitle ?? null],
    ["status",     (u) => u.status],
    ["orgUnit",    (u) => u.orgUnit?.name ?? null],
    ["manager",    (u) => u.manager?.name ?? null],
  ]
  const changes: { field: string; from: string | null; to: string | null }[] = []
  for (const [field, get] of fields) {
    const from = get(before)
    const to = get(after)
    if (String(from ?? "") !== String(to ?? "")) {
      changes.push({ field, from: from ?? null, to: to ?? null })
    }
  }
  return changes
}
