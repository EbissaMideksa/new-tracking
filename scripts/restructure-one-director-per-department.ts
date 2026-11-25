// scripts/restructure-one-director-per-department.ts
// ─────────────────────────────────────────────────────────────────────────────
// Enforces "ONE director per department".
//
// WHY THIS EXISTS
//   An earlier seed put a "<zone> Operational Director" ACCOUNT on every
//   per-department zone/region (e.g. "CWR Operational Director" under "Fixed
//   Network O&M"). A department must have only its single DEPARTMENT director,
//   so those per-zone/region director accounts are the duplication this script
//   removes.
//
//   The corrected model (see lib/orgStructure.ts and prisma/seed.ts):
//     • The Zones/Regions field arm exists under BOTH the Deputy CEO Office AND
//       each department — the per-department copies are KEPT (structural: they
//       show which zones/regions a department operates in).
//     • A zone/region carries exactly ONE operational DIRECTOR, and that
//       account lives ONCE under the Deputy CEO Office (the operational
//       director's office) — never repeated per department.
//     • A field worker SITS on the deputy-CEO field arm (User.orgUnitId) and
//       BELONGS to a department (User.departmentId — their work unit).
//
// WHAT IT DOES (in order)
//   1. Matches every per-department field unit to its canonical counterpart
//      under the Deputy CEO Office by relative path (e.g. "zones/eaaz/bole"),
//      so "…/o&m/zones/eaaz" maps to "…/deputy-ceo-office/zones/eaaz".
//   2. Re-homes references OFF the per-department copies ONTO the canonical
//      unit: User.orgUnitId (non-directors — and sets their departmentId to the
//      owning department when it is still null), Asset, WorkOrder,
//      MaintenanceSchedule, and AssetEvent.orgUnitPath (prefix rewrite).
//   3. Deletes the extra per-department operational DIRECTOR accounts — but
//      ONLY when unreferenced, exactly like scripts/dedupe-operational-
//      directors.ts. A referenced duplicate is reported and left in place.
//   4. LEAVES every org unit in place — the per-department field arm is
//      structural and stays; only the duplicate director ACCOUNTS are removed.
//
// SAFETY
//   Dry run by default; pass --apply to write. Nothing referenced is ever
//   deleted — an account that would orphan a reference is reported and skipped.
//   No OrgUnit is created, moved or deleted (references are re-pointed, not
//   moved), so every surviving path is unchanged.
//
// USAGE (.env already points at the target database):
//   npx tsx scripts/restructure-one-director-per-department.ts            # DRY RUN
//   npx tsx scripts/restructure-one-director-per-department.ts --apply    # write
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config"
import prisma from "../lib/prisma"
import { OrgType, Role } from "../app/generated/prisma/enums"

const APPLY = process.argv.includes("--apply")

const DEPT = String(OrgType.DEPARTMENT)
const DCEO = String(OrgType.DEPUTY_CEO_OFFICE)
const FIELD_TYPES = new Set([
  String(OrgType.CATEGORY), String(OrgType.ZONE), String(OrgType.REGION),
  String(OrgType.AREA), String(OrgType.SITE),
])

type Row = {
  id: string
  name: string
  type: string
  code: string | null
  parentId: string | null
  path: string
}

// Every relation that points AT a user (prisma/schema.prisma model User).
// Mirrors scripts/dedupe-operational-directors.ts so the two agree on what
// "still referenced" means.
const REFERENCE_COUNTS = {
  auditsPerformed: true,
  assignedAssets: true,
  assignedWorkOrders: true,
  createdWorkOrders: true,
  checkedOutWorkOrders: true,
  completedWorkOrders: true,
  createdMaintenanceSchedules: true,
  createdApiKeys: true,
  assetEvents: true,
  woComments: true,
} as const

function printPlan(title: string, items: string[]) {
  if (items.length === 0) return
  console.log(`\n  ${title} (${items.length})`)
  for (const line of items.slice(0, 15)) console.log(`    ${line}`)
  if (items.length > 15) console.log(`    … and ${items.length - 15} more`)
}

/**
 * The DEPARTMENT or DEPUTY_CEO_OFFICE that roots this unit's field arm, or null
 * if the unit is not part of a field arm. Walks up only through field tiers, so
 * a corporate node (Corporate → Section → Group) is never mistaken for one.
 */
function fieldAnchor(u: Row, byId: Map<string, Row>): Row | null {
  if (!FIELD_TYPES.has(u.type)) return null
  let cur: Row | undefined = u
  while (cur?.parentId) {
    const parent = byId.get(cur.parentId)
    if (!parent) return null
    if (parent.type === DEPT || parent.type === DCEO) return parent
    if (!FIELD_TYPES.has(parent.type)) return null
    cur = parent
  }
  return null
}

/** Path of `u` relative to its field-arm anchor — the match key across copies. */
function fieldKey(u: Row, byId: Map<string, Row>): string | null {
  const anchor = fieldAnchor(u, byId)
  if (!anchor) return null
  return u.path.slice(anchor.path.length + 1)
}

async function main() {
  console.log(`── restructure-one-director-per-department: ${APPLY ? "APPLY" : "DRY RUN"} ─────────────`)

  const units: Row[] = await prisma.orgUnit.findMany({
    select: { id: true, name: true, type: true, code: true, parentId: true, path: true },
    orderBy: { path: "asc" },
  })
  const byId = new Map<string, Row>(units.map((u) => [u.id, { ...u }]))

  const deputyCeo = units.find((u) => u.type === DCEO)
  if (!deputyCeo) {
    console.log("No DEPUTY_CEO_OFFICE found — the canonical field arm does not exist. Nothing to do.")
    return
  }

  // ── Canonical map: fieldKey → unit, for everything under the Deputy CEO Office
  const canonical = new Map<string, Row>()
  for (const u of units) {
    if (fieldAnchor(u, byId)?.type !== DCEO) continue
    const k = fieldKey(u, byId)
    if (k) canonical.set(k, u)
  }

  // ── Per-department field units → their canonical counterpart ───────────────
  const remap = new Map<string, string>()      // perDeptUnitId → canonicalUnitId
  const ownerDept = new Map<string, Row>()     // perDeptUnitId → owning DEPARTMENT
  const noCanonical: string[] = []
  const deptsTouched = new Set<string>()

  for (const u of units) {
    const anchor = fieldAnchor(u, byId)
    if (anchor?.type !== DEPT) continue           // only per-department field units
    const k = fieldKey(u, byId)
    const c = k ? canonical.get(k) : undefined
    if (c && c.id !== u.id) {
      remap.set(u.id, c.id)
      ownerDept.set(u.id, anchor)
      deptsTouched.add(anchor.id)
    } else {
      noCanonical.push(`${u.type} "${u.name}" (${u.path})`)
    }
  }

  console.log(`[scan] deputy-CEO field units: ${canonical.size}; per-department field units to fold in: ${remap.size}`)
  console.log(`[scan] departments affected: ${deptsTouched.size}`)
  printPlan("Per-department field units with NO canonical counterpart (left as-is)", noCanonical)

  const perDeptIds = [...remap.keys()]
  const pathOf = (id: string) => byId.get(id)?.path ?? id

  // ── 1. Re-home references ──────────────────────────────────────────────────
  type MoveUser = { id: string; label: string; from: string; toPath: string; toId: string; setDept: string | null }
  const usersToMove: MoveUser[] = []
  const directorsToDelete: { id: string; email: string; path: string }[] = []
  const directorsSkipped: string[] = []
  const assetsToMove: { id: string; to: string }[] = []
  const wosToMove: { id: string; to: string }[] = []
  const schedsToMove: { id: string; to: string }[] = []

  const users = await prisma.user.findMany({
    where: { orgUnitId: { in: perDeptIds } },
    select: {
      id: true, name: true, email: true, role: true, orgUnitId: true, departmentId: true,
      permissionOverride: { select: { id: true } },
      _count: { select: REFERENCE_COUNTS },
    },
  })
  for (const usr of users) {
    const from = byId.get(usr.orgUnitId)!
    const to = remap.get(usr.orgUnitId)!
    const isFieldDirector = usr.role === String(Role.DIRECTOR) &&
      (from.type === String(OrgType.ZONE) || from.type === String(OrgType.REGION))

    if (isFieldDirector) {
      const refs = Object.values(usr._count).reduce((s, n) => s + (Number(n) || 0), 0)
      if (usr.permissionOverride || refs > 0) {
        directorsSkipped.push(`${usr.email} (${from.path}) — ${refs} ref(s), override=${!!usr.permissionOverride}`)
      } else {
        directorsToDelete.push({ id: usr.id, email: usr.email, path: from.path })
      }
    } else {
      const owner = ownerDept.get(usr.orgUnitId)
      usersToMove.push({
        id: usr.id, label: `${usr.name} [${usr.role}]`, from: from.path,
        toPath: pathOf(to), toId: to,
        setDept: usr.departmentId ? null : (owner?.id ?? null),
      })
    }
  }

  for (const a of await prisma.asset.findMany({ where: { orgUnitId: { in: perDeptIds } }, select: { id: true, orgUnitId: true } }))
    assetsToMove.push({ id: a.id, to: remap.get(a.orgUnitId)! })
  for (const w of await prisma.workOrder.findMany({ where: { orgUnitId: { in: perDeptIds } }, select: { id: true, orgUnitId: true } }))
    wosToMove.push({ id: w.id, to: remap.get(w.orgUnitId)! })
  for (const s of await prisma.maintenanceSchedule.findMany({ where: { orgUnitId: { in: perDeptIds } }, select: { id: true, orgUnitId: true } }))
    schedsToMove.push({ id: s.id, to: remap.get(s.orgUnitId)! })

  // AssetEvent.orgUnitPath — prefix rewrite, longest prefix first.
  const prefixMaps = [...remap.entries()]
    .map(([pid, cid]) => ({ from: byId.get(pid)!.path, to: byId.get(cid)!.path }))
    .sort((a, b) => b.from.length - a.from.length)
  const eventUpdates: { id: string; path: string }[] = []
  for (const ev of await prisma.assetEvent.findMany({ where: { orgUnitPath: { not: null } }, select: { id: true, orgUnitPath: true } })) {
    const p = ev.orgUnitPath!
    for (const pm of prefixMaps) {
      if (p === pm.from || p.startsWith(pm.from + "/")) {
        eventUpdates.push({ id: ev.id, path: pm.to + p.slice(pm.from.length) })
        break
      }
    }
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  printPlan("Users to re-point (orgUnitId → canonical deputy-CEO unit)",
    usersToMove.map((u) => `${u.label}: ${u.from} → ${u.toPath}${u.setDept ? " (+set departmentId)" : ""}`))
  printPlan("Extra operational DIRECTORs to delete", directorsToDelete.map((d) => `${d.email} (${d.path})`))
  printPlan("Operational DIRECTORs SKIPPED (referenced — kept)", directorsSkipped)
  printPlan("Assets to re-point", assetsToMove.map((a) => a.id))
  printPlan("Work orders to re-point", wosToMove.map((w) => w.id))
  printPlan("Maintenance schedules to re-point", schedsToMove.map((s) => s.id))
  printPlan("AssetEvent paths to rewrite", eventUpdates.map((e) => `${e.id} → ${e.path}`))

  if (!APPLY) {
    console.log("\n⚠️  Dry run — pass --apply to write these changes.")
    return
  }

  // ── Apply ──────────────────────────────────────────────────────────────────
  console.log("\n🔧 Applying changes…")

  // 1. Re-home references FIRST so nothing is orphaned by a later deletion.
  for (const u of usersToMove) {
    await prisma.user.update({
      where: { id: u.id },
      data: { orgUnitId: u.toId, ...(u.setDept ? { departmentId: u.setDept } : {}) },
    })
  }
  for (const a of assetsToMove) await prisma.asset.update({ where: { id: a.id }, data: { orgUnitId: a.to } })
  for (const w of wosToMove) await prisma.workOrder.update({ where: { id: w.id }, data: { orgUnitId: w.to } })
  for (const s of schedsToMove) await prisma.maintenanceSchedule.update({ where: { id: s.id }, data: { orgUnitId: s.to } })
  for (const e of eventUpdates) await prisma.assetEvent.update({ where: { id: e.id }, data: { orgUnitPath: e.path } })
  console.log(`  re-homed ${usersToMove.length} user(s), ${assetsToMove.length} asset(s), ${wosToMove.length} work order(s), ${schedsToMove.length} schedule(s), ${eventUpdates.length} event path(s)`)

  // 2. Delete the extra (unreferenced) operational directors.
  let deletedDirectors = 0
  for (const d of directorsToDelete) {
    await prisma.user.delete({ where: { id: d.id } })
    deletedDirectors++
  }
  console.log(`  deleted ${deletedDirectors} extra operational director account(s)${directorsSkipped.length ? `; kept ${directorsSkipped.length} referenced` : ""}`)

  // 3. LEAVE every org unit in place. The per-department field arm is
  //    structural (it shows which zones/regions a department operates in) and
  //    stays; only the duplicate director ACCOUNTS were removed above. No
  //    OrgUnit is created, moved or deleted, so every path is unchanged.
  console.log("  org units left untouched (per-department field arm is structural and stays)")

  console.log("\n✅ Restructure complete.")
}

main()
  .catch((e) => {
    console.error("❌ restructure-one-director-per-department failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    // lib/prisma.ts keeps an external pg.Pool alive, so force-exit (same reason
    // the other scripts do).
    process.exit(0)
  })
