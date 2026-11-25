
// app/api/users/route.ts
// ALL permission checks go through the DB-backed matrix via withAuth().
import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { createAuditLog } from "@/lib/audit"
import { safeParseBody, createUserSchema } from "@/lib/validate"
import { withAuth } from "@/lib/withAuth"
import { canGrantSuperAdmin, orgSubtree } from "@/lib/rbac"
import { publish } from "@/lib/broadcast"  // ← NEW
import { userSelect } from "@/lib/userSelect"
import { DEFAULT_PASSWORD, mustChangeOnFirstLogin } from "@/lib/defaultPassword"
import { findImmediateBoss } from "@/lib/reportsTo"
import { Role } from "@/lib/enums"
import { functionalPlacements } from "@/lib/org/functionalPlacement"

// Org tiers that represent the OPERATIONAL (field) arm. Users must be homed in
// the FUNCTIONAL hierarchy; an operational unit only sets their zone/region.
const OPERATIONAL_TYPES = new Set(["DEPUTY_CEO_OFFICE", "ZONE", "REGION", "AREA", "SITE"])

// All ancestor paths of a tree path (including the node itself), e.g.
// "country/deputy/zones/eaaz/site" → ["country", "country/deputy", …].
function ancestorPaths(path: string): string[] {
  const parts = path.split("/")
  const out: string[] = []
  for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join("/"))
  return out
}


// GET — list users in caller's org scope
// Requires manage_users in the DB matrix — works for ANY role that has it
export const GET = withAuth(async (_req, user) => {
  // Matrix jurisdiction: the caller's own subtree OR any unit of that subtree
  // that a field worker is affiliated with through `department` — a department
  // keeps its people even though they sit in the deputy-CEO branch.
  const subtree = orgSubtree(user.orgUnit.path)
  const users = await prisma.user.findMany({
    where: {
      OR: [{ orgUnit: subtree }, { department: subtree }],
    },
    // One shape for every /api/users response — see lib/userSelect.ts.
    select: userSelect,
    orderBy: { createdAt: "desc" },
  })
    const placements = await functionalPlacements()
  return NextResponse.json(
    users.map((u) => ({ ...u, functionalOrgUnitId: placements.get(u.id)?.orgUnitId ?? null })),
  )
}, "manage_users")

// POST — create a user
export const POST = withAuth(async (req, user) => {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  // Blank form inputs mean "no value" — normalise before validation so an
  // empty Oracle ID / Job Title / Reports-To field arrives as null, not "".
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const record = body as Record<string, unknown>
    for (const key of ["employeeId", "jobTitle", "managerId", "geoZoneId", "departmentId"]) {
      if (typeof record[key] === "string" && (record[key] as string).trim() === "") {
        record[key] = null
      }
    }
  }

  const parsed = safeParseBody(createUserSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  // ── Elevation check ─────────────────────────────────────────────────────────
  // `manage_users` is held by ADMIN as well as SUPER_ADMIN, and the role below is
  // taken straight from the request. Without this an ADMIN could create a
  // SUPER_ADMIN — a full escalation, since that role carries grant_admin,
  // manage_permissions, system_settings and system-wide org scope, and is exempt
  // from the first-login password gate below. Checked before any write so the
  // request never reaches the database.
  if (parsed.data.role === "SUPER_ADMIN" && !canGrantSuperAdmin(user.role)) {
    return NextResponse.json(
      { error: "Only a SUPER_ADMIN can create a SUPER_ADMIN account" },
      { status: 403 },
    )
  }

  // A user is always HOMED in the functional hierarchy. If an operational unit
  // (Deputy CEO Office / Zone / Region / Area / Site) was selected, re-home the
  // user under their functional department (departmentId) and keep the
  // operational zone/region on geoZoneId so they still populate that office.
  let orgUnitId = parsed.data.orgUnitId
  let geoZoneId = parsed.data.geoZoneId ?? null

  const targetOrg = await prisma.orgUnit.findUnique({
    where: { id: orgUnitId },
    select: { id: true, type: true, path: true },
  })
  if (!targetOrg) {
    return NextResponse.json({ error: "Invalid org unit" }, { status: 400 })
  }
  if (!targetOrg.path.startsWith(user.orgUnit.path)) {
    return NextResponse.json({ error: "Org unit outside your scope" }, { status: 403 })
  }

  if (OPERATIONAL_TYPES.has(String(targetOrg.type))) {
    const deptId = parsed.data.departmentId
    if (!deptId) {
      return NextResponse.json(
        { error: "Select a functional unit (department / section / group) for the user; set the zone/region separately for field workers." },
        { status: 400 },
      )
    }
    const dept = await prisma.orgUnit.findUnique({
      where: { id: deptId },
      select: { id: true, type: true, path: true },
    })
    if (!dept || OPERATIONAL_TYPES.has(String(dept.type)) || !dept.path.startsWith(user.orgUnit.path)) {
      return NextResponse.json({ error: "Invalid functional department" }, { status: 400 })
    }
    // Derive the operational zone/region from the selected operational node.
    if (!geoZoneId) {
      const zone = await prisma.orgUnit.findFirst({
        where: { type: { in: ["ZONE", "REGION"] as any }, path: { in: ancestorPaths(targetOrg.path) } },
        select: { id: true },
      })
      geoZoneId = zone?.id ?? null
    }
    orgUnitId = dept.id
  }


  // Reports To is DERIVED: the immediate higher-level boss — the nearest person
  // one-or-more ranks above this role, found by walking UP the org tree from
  // where the user sits (lib/reportsTo.ts). A CHIEF has no Reports To at all.
  const derivedManagerId = await findImmediateBoss(
    parsed.data.role,
    parsed.data.orgUnitId,
  )

  // ── Password provisioning ─────────────────────────────────────────────────
  // An admin who leaves the field blank gets the built-in default password; the
  // account is then forced to change it at first login. Anything typed is used
  // as-is (still ≥ 8 chars, enforced by the schema) but is flagged the same way:
  // an admin knows the password, so it must not survive the first login.
  // SUPER_ADMIN is exempt (lib/defaultPassword.ts), so a superadmin the admin
  // promotes here is never forced to change.
  const typedPassword = (parsed.data.password ?? "").trim()
  const plainPassword = typedPassword || DEFAULT_PASSWORD
  const mustChange    = mustChangeOnFirstLogin(parsed.data.role)

  const hashed = await bcrypt.hash(plainPassword, 12)

  const created = await prisma.user.create({
    data: {
      email:     parsed.data.email,
      name:      parsed.data.name,
      phone:     parsed.data.phone,
      role:      parsed.data.role as Role,
      password:  hashed,
      orgUnitId,
      mustChangePassword: mustChange,
      // ── Directory attributes (see lib/userSelect.ts) ────────────────────────
      employeeId: parsed.data.employeeId ?? null,   // "Oracle ID"
      jobTitle:   parsed.data.jobTitle   ?? null,
      // A new account is ACTIVE unless the admin picked otherwise.
      status:     parsed.data.status ?? "ACTIVE",
      lastLoginAt: null,                            // set on first sign-in
      // Reports To — derived from role rank (one above in the departmentalization
      // chain: CHIEF>DIRECTOR>MANAGER>SUPERVISOR). A CHIEF has no Reports To.
      managerId:  derivedManagerId,
      // Department affiliation (the second matrix axis). Without this a corporate
      // user is not linked to their department and falls out of the corporate
      // workforce view.
      departmentId: parsed.data.departmentId ?? null,
      // Operational zone/region for non-corporate (field) workers — drives the
      // operational director's office population. Null for corporate workers.
      geoZoneId,
    },
    // Same shape as GET, so the row the page just appended is complete.
    select: userSelect,
  })

  await createAuditLog({
    performedById:   user.id,
    action:          `Created user ${created.name} (${created.email})`,
    actionType:      "USER_MANAGEMENT",
    targetUserName:  created.name,
    targetUserEmail: created.email,
    metadata:        {
      role: created.role,
      orgUnit: created.orgUnit?.name ?? null,
      usedDefaultPassword: !typedPassword,
      mustChangePassword: mustChange,
    },
  })

  revalidatePath("/dashboard/users")

  // ── Live update ─────────────────────────────────────────────────────
  publish("users",     { event: "created",    user: created })
  publish("audit",     { event: "invalidate" })
  publish("analytics", { event: "invalidate" })
  // ───────────────────────────────────────────────────────────────────

  return NextResponse.json(created)
}, "manage_users")
