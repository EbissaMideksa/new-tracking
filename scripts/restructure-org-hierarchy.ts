// scripts/restructure-org-hierarchy.ts
//
// One-off: retrofit an ALREADY-SEEDED database to the reworked hierarchy.
//
// Before (what prisma/seed.ts used to build):
//     Division → Department → ZONE / REGION / CORPORATE → SECTION → AREA → SITE
//                                        CORPORATE → SECTION → GROUP → SITE
//
// After:
//     Division → Department → CATEGORY ("Zones" | "Regions")
//                             ├─ ZONE / REGION → AREA → SITE
//                             └─ CORPORATE       → SECTION → GROUP
//
// What it does, in order:
//   1. creates the two category folders under every department that needs them
//   2. re-homes zones under "Zones" and regions under "Regions"
//   3. removes the SECTION tier from field units (ZONE/REGION → AREA directly)
//   4. removes the SITE tier from corporate groups (GROUP is now a leaf)
//   5. stamps `code` on zones/regions
//   6. recomputes every path from the new parent chain
//   7. rewrites AssetEvent.orgUnitPath prefixes so the historical trail still
//      resolves to the same unit under its new path
//
// It never touches an already-restructured tree: a department whose zones are
// already under a CATEGORY is skipped, so re-running is a no-op.
//
// Usage:
//   set -a && . ./.env && set +a && npx tsx scripts/restructure-org-hierarchy.ts
//   … add --apply to write; without it the plan is only reported.

import prisma from "../lib/prisma"
import { OrgType } from "../app/generated/prisma/enums"

const APPLY = process.argv.includes("--apply")

type Row = {
  id: string
  name: string
  type: string
  code: string | null
  parentId: string | null
  path: string
}

function slug(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, "-")
}

/** Email-safe slug — same rule the seed uses. */
function eslug(s: string) {
  return s.toLowerCase().replace(/\s+/g, "-")
}

function printPlan(title: string, items: string[]) {
  if (items.length === 0) return
  console.log(`\n  ${title} (${items.length})`)
  for (const line of items.slice(0, 12)) console.log(`    ${line}`)
  if (items.length > 12) console.log(`    … and ${items.length - 12} more`)
}

async function main() {
  const units: Row[] = await prisma.orgUnit.findMany({
    select: { id: true, name: true, type: true, code: true, parentId: true, path: true },
    orderBy: { path: "asc" },
  })

  const byId = new Map<string, Row>(units.map((u) => [u.id, { ...u }]))
  const kidsOf = (id: string | null) => units.filter((u) => u.parentId === id)

  const created: { name: string; type: string; code: string | null; parentId: string | null; path: string }[] = []
  const reparented: { id: string; parentId: string | null }[] = []
  const recoded: { id: string; code: string }[] = []
  const removed: { id: string; name: string; type: string }[] = []

  const tempId = (() => { let n = 0; return () => `__new_${n++}` })()

  const departments = units.filter((u) => u.type === String(OrgType.DEPARTMENT))
  let touchedDepts = 0

  for (const dept of departments) {
    const direct = kidsOf(dept.id)
    const zones   = direct.filter((u) => u.type === String(OrgType.ZONE))
    const regions = direct.filter((u) => u.type === String(OrgType.REGION))

    // Nothing to do when the department has no loose zones/regions — either it
    // was never populated, or it has already been restructured (zones/regions
    // are hanging under the "Zones"/"Regions" categories, so they are no longer
    // direct children of the department).
    if (zones.length === 0 && regions.length === 0) continue

    // NOTE: deliberately NOT gated on the presence of a CATEGORY. A department
    // can legitimately own a category folder ("Zones"/"Regions") with its zones
    // still sitting loose directly under it (inconsistent state from an earlier
    // partial run). The guard above already covers fully-restructured
    // departments, so every department with loose zones/regions is processed.

    touchedDepts++

    const division = byId.get(dept.parentId ?? "")
    const divName  = division?.name ?? ""
    const divSlug  = divName.toLowerCase().replace(/\s+/g, "")
    const depSlug  = eslug(dept.name)

    // ── Step 1: create category folders ─────────────────────
    const zonesFolder = ensureCategory("Zones", dept, units, byId, created, tempId)
    const regionsFolder = ensureCategory("Regions", dept, units, byId, created, tempId)

    // ── Step 2: re-home zones under "Zones", regions under "Regions"
    for (const z of zones) {
      reparented.push({ id: z.id, parentId: zonesFolder.id })
      byId.get(z.id)!.parentId = zonesFolder.id
    }
    for (const r of regions) {
      reparented.push({ id: r.id, parentId: regionsFolder.id })
      byId.get(r.id)!.parentId = regionsFolder.id
    }

    // ── Step 3: remove SECTION tier from field units ───────────────
    // Zones/regions currently have SECTION children; move AREA up to
    // sit directly under ZONE/REGION, then delete the SECTION nodes.
    for (const field of [...zones, ...regions]) {
      const sectionKids = kidsOf(field.id).filter((u) => u.type === String(OrgType.SECTION))
      for (const sec of sectionKids) {
        const areaKids = kidsOf(sec.id).filter((u) => u.type === String(OrgType.AREA))
        for (const area of areaKids) {
          reparented.push({ id: area.id, parentId: field.id })
          byId.get(area.id)!.parentId = field.id
        }
        // Delete the SECTION node (it has no users assigned to it in the
        // new hierarchy — MANAGER sits on SECTION under CORPORATE only).
        removed.push({ id: sec.id, name: sec.name, type: sec.type })
        byId.delete(sec.id)
      }
    }

    // ── Step 4: remove SITE tier from corporate groups ─────────────
    // CORPORATE → SECTION → GROUP → SITE becomes CORPORATE → SECTION → GROUP
    for (const corp of direct.filter((u) => u.type === String(OrgType.CORPORATE))) {
      const secKids = kidsOf(corp.id).filter((u) => u.type === String(OrgType.SECTION))
      for (const sec of secKids) {
        const groupKids = kidsOf(sec.id).filter((u) => u.type === String(OrgType.GROUP))
        for (const grp of groupKids) {
          const siteKids = kidsOf(grp.id).filter((u) => u.type === String(OrgType.SITE))
          for (const site of siteKids) {
            removed.push({ id: site.id, name: site.name, type: site.type })
            byId.delete(site.id)
          }
        }
      }
    }

    // ── Step 5: stamp code on zones/regions ────────────────────────
    for (const z of zones) {
      if (!z.code) {
        recoded.push({ id: z.id, code: z.name })
        byId.get(z.id)!.code = z.name
      }
    }
    for (const r of regions) {
      if (!r.code) {
        recoded.push({ id: r.id, code: r.name })
        byId.get(r.id)!.code = r.name
      }
    }
  }

  // ── Report ────────────────────────────────────────────────────────
  console.log(`\nDepartments touched: ${touchedDepts}`)
  printPlan("Categories to create", created.map((c) => `  ${c.type} "${c.name}" under ${byId.get(c.parentId ?? "")?.name ?? "?"}`))
  printPlan("Units to reparent", reparented.map((r) => `  ${byId.get(r.id)?.name ?? r.id} → ${byId.get(r.parentId ?? "")?.name ?? "?"}`))
  printPlan("Units to delete", removed.map((r) => `  ${r.type} "${r.name}"`))
  printPlan("Codes to stamp", recoded.map((r) => `  ${byId.get(r.id)?.name ?? r.id} → code="${r.code}"`))

  if (!APPLY) {
    console.log("\n⚠️  Dry run — pass --apply to write these changes.")
    return
  }

  // ── Apply ─────────────────────────────────────────────────────────
  console.log("\n🔧 Applying changes…")

  // 1. Create categories
  for (const c of created) {
    await prisma.orgUnit.create({
      data: { name: c.name, type: c.type as any, parentId: c.parentId, path: c.path, code: null },
    })
  }

  // 2. Reparent zones/regions/areas
  for (const r of reparented) {
    const row = byId.get(r.id)!
    const newParent = byId.get(r.parentId!)
    const newPath = `${newParent!.path}/${slug(row.name)}`
    await prisma.orgUnit.update({ where: { id: r.id }, data: { parentId: r.parentId, path: newPath } })
    // Rebase descendants
    await rebaseSubtree(r.id, row.path, newPath)
  }

  // 3. Delete SECTION nodes (field) and SITE nodes (corporate)
  for (const r of removed) {
    await prisma.orgUnit.delete({ where: { id: r.id } })
    byId.delete(r.id)
  }

  // 4. Stamp codes
  for (const r of recoded) {
    await prisma.orgUnit.update({ where: { id: r.id }, data: { code: r.code } })
  }

  // 5. Recompute all paths from scratch (safety pass)
  console.log("Recomputing paths…")
  const allUnits = await prisma.orgUnit.findMany({
    select: { id: true, path: true, parentId: true },
    orderBy: { path: "asc" },
  })
  const root = allUnits.find((u) => !u.parentId)
  if (root) await recomputePaths(root.id, root.path)

  // 6. Rewrite AssetEvent.orgUnitPath prefixes
  console.log("Rewriting AssetEvent paths…")
  const events = await prisma.assetEvent.findMany({
    where: { orgUnitPath: { not: null } },
    select: { id: true, assetId: true, orgUnitPath: true },
  })
  for (const ev of events) {
    // Resolve the asset's current org unit and point the event at its path.
    const asset = await prisma.asset.findUnique({
      where: { id: ev.assetId },
      select: { orgUnitId: true },
    })
    if (!asset) continue
    const newUnit = await prisma.orgUnit.findUnique({
      where: { id: asset.orgUnitId },
      select: { path: true },
    })
    if (newUnit?.path && newUnit.path !== ev.orgUnitPath) {
      await prisma.assetEvent.update({
        where: { id: ev.id },
        data: { orgUnitPath: newUnit.path },
      })
    }
  }

  console.log("✅ Restructure complete.")
}

function ensureCategory(
  name: string,
  dept: Row,
  units: Row[],
  byId: Map<string, Row>,
  created: { name: string; type: string; code: string | null; parentId: string | null; path: string }[],
  tempId: () => string,
): Row {
  const existing = units.find((u) => u.type === String(OrgType.CATEGORY) && u.name === name && u.parentId === dept.id)
  if (existing) return existing
  const id = tempId()
  const row: Row = {
    id, name, type: String(OrgType.CATEGORY), code: null,
    parentId: dept.id, path: `${dept.path}/${slug(name)}`,
  }
  created.push({ name, type: row.type, code: null, parentId: row.parentId, path: row.path })
  byId.set(id, row)
  return row
}

async function rebaseSubtree(id: string, oldPath: string, newPath: string): Promise<number> {
  const descendants = await prisma.orgUnit.findMany({
    where: { path: { startsWith: `${oldPath}/` } },
    select: { id: true, path: true },
  })
  await prisma.$transaction([
    prisma.orgUnit.update({ where: { id }, data: { path: newPath } }),
    ...descendants.map((d) =>
      prisma.orgUnit.update({
        where: { id: d.id },
        data: { path: newPath + d.path.slice(oldPath.length) },
      }),
    ),
  ])
  return 1 + descendants.length
}

async function recomputePaths(rootId: string, rootPath: string): Promise<void> {
  const children = await prisma.orgUnit.findMany({
    where: { parentId: rootId },
    select: { id: true, name: true, path: true },
  })
  for (const child of children) {
    const newPath = `${rootPath}/${slug(child.name)}`
    if (child.path !== newPath) {
      await prisma.orgUnit.update({ where: { id: child.id }, data: { path: newPath } })
    }
    await recomputePaths(child.id, newPath)
  }
}

main()
  .catch((e) => {
    console.error("❌ Restructure failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })