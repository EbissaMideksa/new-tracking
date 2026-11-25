import prisma from "../lib/prisma"
import { OrgNodeKind, OrgType, Role } from "../lib/enums"
import bcrypt from "bcryptjs"
import { DEFAULT_SETTINGS } from "../lib/defaultSettings"
import { DEFAULT_PASSWORD, PASSWORD_MIN_LENGTH, mustChangeOnFirstLogin } from "../lib/defaultPassword"
import { CORPORATE } from "../lib/org/seed"
import { ensureDepartmentDirector, ensureZoneDirector } from "../lib/org/directors"

// ========================
// 🌍 AREA MAP (REAL DATA)
// ========================
const AREA_MAP: Record<string, string[]> = {
  // ZONES
  EAAZ: ["Bole", "Michael", "Goro"],
  NAAZ: ["Sidist Kilo", "Shiro Meda", "Kebena"],
  SAAZ: ["Kality", "Akaki", "Dimtu"],
  SWAAZ: ["Kara Kore", "Ayer Tena", "Alem Bank"],
  WAAZ: ["Kolfe", "Autobus Tera", "Shegole","Asko"],

  // REGIONS
  SER: ["Adama 1", "Adama 2", "Olan City"],
  SWR: ["Gambela", "Gilgel"],
  SSWR: ["Yaa Balo", "Moyale"],
  SR: ["Hawasa", "Wondo Genet"],
  SSER: ["Goba", "Gasaro"],
  WR: ["Nekemte 1", "Nekemte 2"],
  WWR: ["Gimbi 1", "Gimbi 2"],
  CWR: ["Ambo", "Holeta", "Sebeta"],
}

// ========================
// Helper Functions
// ========================

async function createOrgUnit(name: string, type: OrgType, parent?: any, code?: string | null) {
  const slug = name.toLowerCase().replace(/\s+/g, "-")
  const path = parent ? `${parent.path}/${slug}` : slug

  return prisma.orgUnit.upsert({
    where: { path },
    update: {},
    create: {
      name,
      type,
      parentId: parent?.id,
      path,
      code: code ?? null,
    },
  })
}

function eslug(s: string) {
  return s.toLowerCase().replace(/\s+/g, "-")
}

async function createUser(
  email: string,
  name: string,
  role: Role,
  orgUnitId: string,
  password: string,
  // Second affiliation of the matrix: the department a field worker belongs to
  // (their org unit stays an area/site of the deputy-CEO branch). Undefined for
  // everyone who simply sits in the corporate hierarchy.
  departmentId?: string | null
) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email, name, role, orgUnitId, password,
      departmentId: departmentId ?? null,
      mustChangePassword: false,
    },
  })
}

// ========================
// 🌍 ORGANIZATION STRUCTURE (AI Coder Spec §1)
// ========================
//
// Geographies + operational directors for the Organization Structure feature.
// This runs AFTER the full tree seed and is idempotent (upserts only), so it
// is safe on a database that was seeded before the feature existed — main()
// calls it both on the marker-skip path and on a fresh run.
//
// Local workforce units are created for every geography × department below
// (spec §12 phase 1 seeds the structure; the units are what the Units
// directory and the geography screens render).
//
// Geographies: the zones and regions of the reference design, extended with
// the codes the legacy field arm already uses (SAAZ / SWR / WWR / SR / SSER)
// so every operational director provisioned by the main seed finds its
// geography here. Admins can add more later — nothing in the UI hardcodes
// this list.
const SEED_GEOGRAPHIES: {
  code: string
  name: string
  category: "ADDIS_ABABA" | "REGION"
  sortOrder: number
}[] = [
  // Category Addis Ababa (zones)
  { code: "EAAZ", name: "East Addis Ababa Zone", category: "ADDIS_ABABA", sortOrder: 1 },
  { code: "NAAZ", name: "North Addis Ababa Zone", category: "ADDIS_ABABA", sortOrder: 2 },
  { code: "SAAZ", name: "South Addis Ababa Zone", category: "ADDIS_ABABA", sortOrder: 3 },
  { code: "SWAAZ", name: "South West Addis Ababa Zone", category: "ADDIS_ABABA", sortOrder: 4 },
  { code: "WAAZ", name: "West Addis Ababa Zone", category: "ADDIS_ABABA", sortOrder: 5 },
  // Category Regions
  { code: "CWR", name: "Central West Region", category: "REGION", sortOrder: 1 },
  { code: "WR", name: "West Region", category: "REGION", sortOrder: 2 },
  { code: "SER", name: "South East Region", category: "REGION", sortOrder: 3 },
  { code: "SSWR", name: "South South West Region", category: "REGION", sortOrder: 4 },
  { code: "NR", name: "North Region", category: "REGION", sortOrder: 5 },
  { code: "SWR", name: "South West Region", category: "REGION", sortOrder: 6 },
  { code: "WWR", name: "West West Region", category: "REGION", sortOrder: 7 },
  { code: "SR", name: "South Region", category: "REGION", sortOrder: 8 },
  { code: "SSER", name: "South South East Region", category: "REGION", sortOrder: 9 },
]

// ── OrgNode functional tree (the data behind /dashboard/organization) ────────
//
// Corporate root → divisions (FN / WN / NI) → departments (O&M / Planning /
// Engineering), plus one LOCAL_UNIT per geography × department (e.g. "EAAZ FN
// O&M"). Fully idempotent: existing nodes are matched by (parent, name) and the
// per-(department, zone) unique constraint makes re-runs safe.
const SEED_DIVISIONS: { code: string; name: string; subtitle: string; departments: string[] }[] = [
  { code: "FN", name: "FN Division", subtitle: "Fixed Network", departments: ["O&M", "Planning", "Engineering"] },
  { code: "WN", name: "WN Division", subtitle: "Wireless Network", departments: ["O&M", "Planning", "Engineering"] },
  { code: "NI", name: "NI Division", subtitle: "Network Infrastructure", departments: ["O&M", "Planning", "Engineering"] },
]

async function seedOrgNodeTree() {
  console.log("🏢 Seeding OrgNode hierarchy (corporate → divisions → departments → units)...")

  // ── Corporate root ──────────────────────────────────────────────────────
  let corp = await prisma.orgNode.findFirst({ where: { kind: "CORPORATE" } })
  if (!corp) {
    corp = await prisma.orgNode.create({
      data: { kind: OrgNodeKind.CORPORATE, name: CORPORATE.name, subtitle: CORPORATE.subtitle },
    })
    console.log(`   + corporate root: ${CORPORATE.name}`)
  } else if (corp.name !== CORPORATE.name) {
    // Keep the id (nothing else points at OrgNode, but renames are cheap) and
    // present the root exactly as the design labels it.
    corp = await prisma.orgNode.update({
      where: { id: corp.id },
      data: { name: CORPORATE.name, subtitle: CORPORATE.subtitle },
    })
    console.log(`   ~ corporate root renamed to ${CORPORATE.name}`)
  }

  // ── Prune anything that is not part of the reference design ─────────────
  // The OrgNode tree is self-contained (no user, asset or work order points
  // at it), so stray test divisions can be removed safely. Divisions are
  // matched by CODE (FN/WN/NI) — the oldest match per code is kept.
  const keepDivisionIds = new Set<string>()
  for (const d of SEED_DIVISIONS) {
    const existing = await prisma.orgNode.findFirst({
      where: { kind: OrgNodeKind.DIVISION, code: d.code, parentId: corp.id },
      orderBy: { createdAt: "asc" },
    })
    if (existing) keepDivisionIds.add(existing.id)
  }

  // Local units are rebuilt wholesale (one per geography × department below).
  const removedUnits = await prisma.orgNode.deleteMany({ where: { kind: OrgNodeKind.LOCAL_UNIT } })

  // Departments that do not belong to a kept design division…
  const strayDeptIds: { id: string }[] = await prisma.orgNode.findMany({
    where: { kind: OrgNodeKind.DEPARTMENT, parentId: { notIn: [...keepDivisionIds] } },
    select: { id: true },
  })
  // …and design divisions that carry a department outside the reference set.
  const keptDivisions = await prisma.orgNode.findMany({
    where: { id: { in: [...keepDivisionIds] } },
  })
  for (const div of keptDivisions) {
    const allowed = SEED_DIVISIONS.find((d) => d.code === div.code)?.departments ?? []
    const extra = await prisma.orgNode.findMany({
      where: { kind: OrgNodeKind.DEPARTMENT, parentId: div.id, name: { notIn: allowed } },
      select: { id: true },
    })
    strayDeptIds.push(...extra)
  }
  const removedDepts = await prisma.orgNode.deleteMany({ where: { id: { in: strayDeptIds.map((d) => d.id) } } })

  const strayDivisions = await prisma.orgNode.findMany({
    where: { kind: OrgNodeKind.DIVISION, parentId: corp.id, id: { notIn: [...keepDivisionIds] } },
    select: { id: true, name: true },
  })
  for (const div of strayDivisions) {
    await prisma.orgNode.delete({ where: { id: div.id } })
    console.log(`   - removed stray division ${div.name}`)
  }
  if (removedUnits.count || removedDepts.count || strayDivisions.length) {
    console.log(
      `   pruned ${removedUnits.count} local unit(s), ${removedDepts.count} department(s), ${strayDivisions.length} division(s)`
    )
  }

  // ── Divisions, departments, local units ────────────────────────────────
  const findChild = (parentId: string, name: string) =>
    prisma.orgNode.findFirst({ where: { parentId, name } })

  let unitCount = 0
  const zones = await prisma.geoZone.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] })

  for (const [di, d] of SEED_DIVISIONS.entries()) {
    let division = await prisma.orgNode.findFirst({
      where: { kind: OrgNodeKind.DIVISION, code: d.code, parentId: corp.id },
      orderBy: { createdAt: "asc" },
    })
    if (!division) {
      division = await prisma.orgNode.create({
        data: {
          kind: OrgNodeKind.DIVISION,
          name: d.name,
          code: d.code,
          subtitle: d.subtitle,
          parentId: corp.id,
          sortOrder: di,
        },
      })
      console.log(`   + division ${d.name}`)
    }

    for (const [pi, deptName] of d.departments.entries()) {
      let dept = await findChild(division.id, deptName)
      if (!dept) {
        dept = await prisma.orgNode.create({
          data: { kind: OrgNodeKind.DEPARTMENT, name: deptName, parentId: division.id, sortOrder: pi },
        })
        console.log(`   + department ${d.code} / ${deptName}`)
      }

      // One local workforce unit per geography × department. The
      // @@unique([parentId, zoneId]) constraint makes this a safe no-op on
      // re-runs (P2002 = already seeded).
      for (const z of zones) {
        const name = `${z.code} ${d.code} ${deptName}`
        try {
          await prisma.orgNode.create({
            data: { kind: OrgNodeKind.LOCAL_UNIT, name, parentId: dept.id, zoneId: z.id },
          })
          unitCount++
        } catch (err: any) {
          if (err?.code !== "P2002") throw err
        }
      }
    }
  }

  console.log(`✅ OrgNode hierarchy seeded (${unitCount} new local units)`)
}

async function seedOrganizationStructure() {
  console.log("🌍 Seeding organization-structure geographies & directors...")

  const superAdmin = await prisma.user.findUnique({
    where: { email: "super@track.com" },
    select: { id: true },
  })

  for (const g of SEED_GEOGRAPHIES) {
    const geoZone = await prisma.geoZone.upsert({
      where: { code: g.code },
      update: { name: g.name, category: g.category, sortOrder: g.sortOrder },
      create: {
        code: g.code,
        name: g.name,
        category: g.category,
        sortOrder: g.sortOrder,
      },
    })

    // ── Operational director (spec §1.2: one per geography, never per dept) ──
    // ensureZoneDirector is idempotent: it links the director account the main
    // seed provisioned (director-<code>@deputyceooffice.com) and only creates
    // one when it is missing, so every geography ends up with a head.
    const director = await ensureZoneDirector(geoZone)
    console.log(`   ${g.code} → operational director ${director?.name ?? "unassigned"}`)
  }

  await seedOrgNodeTree()

  // ── Functional directors (design §1: one per department) ────────────────
  const departments = await prisma.orgNode.findMany({
    where: { kind: OrgNodeKind.DEPARTMENT },
    include: { parent: true },
  })
  let deptWithDirector = 0
  for (const dept of departments) {
    if (!dept.parent) continue
    await ensureDepartmentDirector(dept, dept.parent)
    deptWithDirector++
  }
  console.log(`   functional directors placed on ${deptWithDirector} departments`)

  // ── Permission backfill (org.hierarchy.manage) ────────────────────────────
  // loadPermissionsFromDB() re-imposes SUPER_ADMIN's defaults on every read,
  // but an already-saved grant_matrix JSON predating this feature would not
  // contain org_hierarchy_manage for ADMIN — add it so ADMIN (spec default)
  // keeps write access without a manual matrix edit.
  try {
    const record = await prisma.systemSetting.findUnique({ where: { key: "grant_matrix" } })
    if (record?.value) {
      const matrix = JSON.parse(record.value as string)
      const adminGrants = matrix?.ADMIN
      if (Array.isArray(adminGrants) && !adminGrants.includes("org_hierarchy_manage")) {
        matrix.ADMIN = [...adminGrants, "org_hierarchy_manage"]
        await prisma.systemSetting.update({
          where: { key: "grant_matrix" },
          data: { value: JSON.stringify(matrix) },
        })
        console.log("   grant_matrix: added org_hierarchy_manage to ADMIN")
      }
    }
  } catch (err) {
    console.warn("   grant_matrix backfill skipped:", err)
  }

  console.log("✅ Organization-structure geographies seeded")
}

// ========================
// Main Seed Function
// ========================
async function main() {
  const alreadySeeded = await prisma.systemSetting.findUnique({ where: { key: "seed_completed" } })
  if (alreadySeeded) {
    console.log("⏭️  Seed already completed (seed_completed marker) — skipping full seed.")
    // Geographies/directors are additive and idempotent, so databases seeded
    // BEFORE this feature existed still receive them on re-run.
    await seedOrganizationStructure()
    return
  }

  const adminPassword = (process.env.SEED_ADMIN_PASSWORD || DEFAULT_PASSWORD).trim()
  if (adminPassword.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `SEED_ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters. ` +
      "Refusing to create an account with a password that cannot be used."
    )
  }
  if (adminPassword.toLowerCase().includes("admin123")) {
    throw new Error("SEED_ADMIN_PASSWORD must not contain the old default password.")
  }

  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 12)
  const superAdminHash =
    adminPassword === DEFAULT_PASSWORD ? hashedPassword : await bcrypt.hash(adminPassword, 12)

  // ── COUNTRY ────────────────────────────────────────────────────────
  const ethiopia = await createOrgUnit("Ethiopia", OrgType.COUNTRY)

  await createUser("super@track.com", "Super Admin", Role.SUPER_ADMIN, ethiopia.id, superAdminHash)
  await createUser("admin", "Admin", Role.ADMIN, ethiopia.id, hashedPassword)
  await createUser("admin@track.com", "Admin", Role.ADMIN, ethiopia.id, hashedPassword)

  // ── DEPUTY CEO OFFICE — THE FIELD ARM (BUILT ONCE) ─────────────────
  //
  // The office copy of the field arm: zones/regions (with their areas, sites
  // and one operational DIRECTOR each) hang off the deputy CEO office exactly
  // once — this is the copy the matrix workers SIT on (their org unit lives
  // here) while each department below also MIRRORS this whole structure under
  // its own "Zones"/"Regions" categories, head account included. The workers
  // are attached to their department at the end of this seed
  // (User.departmentId — the second affiliation of the matrix).
  const deputyCeoOffice = await createOrgUnit("Deputy CEO Office", OrgType.DEPUTY_CEO_OFFICE, ethiopia)

  const zones   = ["EAAZ", "NAAZ", "SAAZ", "SWAAZ", "WAAZ"]
  const regions = ["SER", "SWR", "SSWR", "SR", "SSER", "WR", "WWR", "CWR"]

  const zonesCat   = await createOrgUnit("Zones",   OrgType.CATEGORY, deputyCeoOffice)
  const regionsCat = await createOrgUnit("Regions", OrgType.CATEGORY, deputyCeoOffice)

  const fieldUnits: any[] = []
  for (const z of zones) {
    fieldUnits.push(await createOrgUnit(z, OrgType.ZONE, zonesCat, z))
  }
  for (const r of regions) {
    fieldUnits.push(await createOrgUnit(r, OrgType.REGION, regionsCat, r))
  }

  // One operational DIRECTOR per zone/region — created with the node itself —
  // plus the areas and sites beneath it. Held for the worker loop at the end.
  const areas: { area: any; zoneCode: string }[] = []
  const sites: { site: any; areaName: string; g: number; zoneCode: string }[] = []

  for (const field of fieldUnits) {
    await createUser(
      `director-${eslug(field.name)}@deputyceooffice.com`,
      `${field.name} Operational Director`,
      Role.DIRECTOR,
      field.id,
      hashedPassword
    )

    // ✅ REAL AREAS FROM MAP
    for (const areaName of AREA_MAP[field.name] ?? []) {
      const area = await createOrgUnit(areaName, OrgType.AREA, field)
      areas.push({ area, zoneCode: field.code ?? field.name })

      for (let g = 1; g <= 2; g++) {
        const site = await createOrgUnit(`${area.name} Group-${g}`, OrgType.SITE, area)
        sites.push({ site, areaName, g, zoneCode: field.code ?? field.name })
      }
    }
  }

  // ── DIVISIONS ──────────────────────────────────────────────────────
  const divisions = ["Fixed Network", "Wireless Network", "Network Infrastructure"]

  // Every department of the corporate hierarchy, collected so the field
  // workers created after this loop can be organized under "their" department.
  const departmentsMeta: { id: string; divSlug: string; depSlug: string }[] = []

  for (const divName of divisions) {
    const division = await createOrgUnit(divName, OrgType.DIVISION, ethiopia)

    await createUser(
      `chief@${divName.toLowerCase().replace(/\s+/g, "")}.com`,
      `${divName} Chief`,
      Role.CHIEF,
      division.id,
      hashedPassword
    )

    await createUser(
      `admin@${divName.toLowerCase().replace(/\s+/g, "")}.com`,
      `${divName} Admin`,
      Role.ADMIN,
      division.id,
      hashedPassword
    )

    // ── DEPARTMENTS ──────────────────────────────────────────────────
    const departments = ["O&M", "Planning", "Engineering"]

    for (const depName of departments) {
      const department = await createOrgUnit(depName, OrgType.DEPARTMENT, division)

      await createUser(
        `director@${depName.toLowerCase().replace(/\s+/g, "")}.${divName.toLowerCase().replace(/\s+/g, "")}.com`,
        `${depName} Director`,
        Role.DIRECTOR,
        department.id,
        hashedPassword
      )

      const divSlug = divName.toLowerCase().replace(/\s+/g, "")
      const depSlug = eslug(depName)

      // ── ZONES & REGIONS: the field arm, mirrored per department ───────────
      // Each department carries its own "Zones"/"Regions" categories with the
      // full set of zones/regions and the real areas/sites beneath — IN
      // ADDITION TO the copy under the Deputy CEO Office. This is purely
      // structural: it shows which zones/regions the department operates in.
      //
      // Crucially, NO operational DIRECTOR account is created here. A zone/
      // region carries exactly ONE operational director, and that account lives
      // ONCE under the Deputy CEO Office (the operational director's office),
      // never repeated per department. So under "Fixed Network O&M" there is
      // only the single "Fixed Network O&M Director" created above — never a
      // "CWR Operational Director". The people (workers, operational directors)
      // SIT on the deputy-CEO field arm; a field worker's department is their
      // work unit (User.departmentId), set at the end of this seed.
      const zoneCat = await createOrgUnit("Zones", OrgType.CATEGORY, department)
      const regionCat = await createOrgUnit("Regions", OrgType.CATEGORY, department)

      const deptFieldUnits: any[] = []
      for (const z of zones) {
        deptFieldUnits.push(await createOrgUnit(z, OrgType.ZONE, zoneCat, z))
      }
      for (const r of regions) {
        deptFieldUnits.push(await createOrgUnit(r, OrgType.REGION, regionCat, r))
      }

      for (const field of deptFieldUnits) {
        // Areas and sites beneath each zone/region — the same real areas the
        // deputy-CEO copy carries. No head account here (see the note above).
        for (const areaName of AREA_MAP[field.name] ?? []) {
          const area = await createOrgUnit(areaName, OrgType.AREA, field)

          for (let g = 1; g <= 2; g++) {
            await createOrgUnit(`${area.name} Group-${g}`, OrgType.SITE, area)
          }
        }
      }

      departmentsMeta.push({ id: department.id, divSlug, depSlug })

      // ── CORPORATE ARM ──────────────────────────────────────────────
      // Corporate: Department → CORPORATE → SECTION → GROUP
      // (No SITE tier — GROUP is a leaf, users sit on GROUP.)
      //
      // Corporate office workers are placed under their department ONLY (work
      // unit) — they do NOT also sit on the operational director's office field
      // arm, because their org unit already lives inside the department's
      // corporate branch. So departmentId is set here even though orgUnitId is
      // the corporate node.
      for (const c of ["Corporate HQ", "Corporate Support"]) {
        const corp = await createOrgUnit(c, OrgType.CORPORATE, department)

        await createUser(
          `manager-${eslug(c)}-${depSlug}@${divSlug}.com`,
          `${c} Manager`,
          Role.MANAGER,
          corp.id,
          hashedPassword,
          department.id
        )

        const sectionName = `${divName === "Fixed Network" ? "FN" : divName === "Wireless Network" ? "WN" : "NI"} ${depName === "O&M" ? "O&M" : depName === "Planning" ? "Planning" : "Engineering"} ${c === "Corporate HQ" ? "HQ" : "Support"}`
        const section = await createOrgUnit(sectionName, OrgType.SECTION, corp)

        await createUser(
          `manager-${eslug(c)}-${depSlug}-section@${divSlug}.com`,
          `${sectionName} Manager`,
          Role.MANAGER,
          section.id,
          hashedPassword,
          department.id
        )

        for (let g = 1; g <= 2; g++) {
          const group = await createOrgUnit(
            `${c === "Corporate HQ" ? "HQ" : "Support"} Group-${g}`,
            OrgType.GROUP,
            section
          )

          await createUser(
            `user-${eslug(c)}-${g}-${depSlug}@${divSlug}.com`,
            `${group.name} User`,
            Role.USER,
            group.id,
            hashedPassword,
            department.id
          )
        }
      }

    }
  }

  // ── FIELD WORKERS: SIT ON THE FIELD ARM, BELONG TO A DEPARTMENT ────
  //
  // The matrix in practice. A supervisor sits on an area of their zone/region,
  // a user sits on a site — and both are organized under their department
  // (User.departmentId), so the department hierarchy keeps its people without
  // nesting them under it. One worker per department per area/site: the same
  // head-count the old per-department copies of the field arm produced.
  // ── FIELD WORKERS: CREATED UNDER THE FUNCTIONAL UNIT ──────────────────
  //
  // New model: a non-corporate (field) worker's HOMES is their functional
  // department (orgUnitId = department, departmentId = department). The
  // operational zone/region they are POPULATED under is stored separately on
  // geoZoneId — backfilled below once seedOrganizationStructure() has created
  // the GeoZones. Nobody is created under an operational director's office.
  const geoAssignments: { userId: string; zoneCode: string }[] = []

  for (const { area, zoneCode } of areas) {
    for (const dep of departmentsMeta) {
      const u = await createUser(
        `supervisor-${eslug(area.name)}-${dep.depSlug}@${dep.divSlug}.com`,
        `${area.name} Supervisor`,
        Role.SUPERVISOR,
        dep.id,
        hashedPassword,
        dep.id
      )
      geoAssignments.push({ userId: u.id, zoneCode })
    }
  }

  for (const { site, areaName, g, zoneCode } of sites) {
    for (const dep of departmentsMeta) {
      const u = await createUser(
        `user-${eslug(areaName)}-${g}-${dep.depSlug}@${dep.divSlug}.com`,
        `${site.name} User`,
        Role.USER,
        dep.id,
        hashedPassword,
        dep.id
      )
      geoAssignments.push({ userId: u.id, zoneCode })
    }
  }

  console.log("✅ Full hierarchical seed completed successfully!")

  // Seed default system settings
  console.log("⚙️  Seeding default system settings...")
  for (const def of DEFAULT_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: def.key },
      update: {},
      create: { key: def.key, value: def.value },
    })
  }
  console.log(`✅ Seeded ${DEFAULT_SETTINGS.length} default settings`)

  // Organization-structure geographies, director assignments, org-unit links
  // and the grant_matrix backfill (idempotent — see seedOrganizationStructure).
  await seedOrganizationStructure()

  // Backfill the operational zone/region (geoZoneId) for the field workers
  // created above, now that the GeoZones exist. This is what populates each
  // zone/region operational director's office.
  {
    const geoZones = await prisma.geoZone.findMany({ select: { id: true, code: true } })
    const zoneIdByCode = new Map(geoZones.map((z) => [z.code, z.id]))
    let assigned = 0
    for (const a of geoAssignments) {
      const geoZoneId = zoneIdByCode.get(a.zoneCode)
      if (!geoZoneId) continue
      await prisma.user.update({ where: { id: a.userId }, data: { geoZoneId } }).catch(() => {})
      assigned++
    }
    console.log(`✅ Backfilled geoZoneId for ${assigned} field workers`)
  }

  await prisma.systemSetting.upsert({
    where: { key: "seed_completed" },
    update: { value: new Date().toISOString() },
    create: { key: "seed_completed", value: new Date().toISOString() },
  })
}

// ========================
// Execute Seed
// ========================
main()
  .catch((e) => {
    console.error("❌ Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })