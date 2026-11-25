// scripts/dedupe-operational-directors.ts
// ─────────────────────────────────────────────────────────────────────────────
// Enforces "ONE operational director per zone/region".
//
// WHY THIS EXISTS
//   The field arm is deliberately repeated: every zone/region exists once under
//   the Deputy CEO Office AND once per department, and each copy carries its
//   own operational DIRECTOR (see lib/orgStructure.ts and prisma/seed.ts).
//   What must never happen is TWO heads on the SAME copy — a re-run after the
//   email pattern changed, a manual duplicate — so this script keeps exactly
//   one DIRECTOR per zone/region NODE (keyed by OrgUnit.path, which is unique;
//   the deputy-CEO copy and the 9 per-department copies of e.g. EAAZ are
//   different nodes with different heads by design). The account kept is the
//   earliest-created one, which is the account the seed creates first.
//   Department-unit directors are NOT touched (their org unit type is
//   DEPARTMENT, not ZONE/REGION).
//
// SAFETY
//   An account referenced anywhere (Audit.performedById, assets, work orders,
//   comments, API keys, overrides …) is reported and skipped — nothing that
//   would orphan a reference is ever deleted.
//
// USAGE (from the live checkout; .env already points at the stack database):
//   npx tsx scripts/dedupe-operational-directors.ts            # DRY RUN
//   npx tsx scripts/dedupe-operational-directors.ts --apply    # delete
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config"
import prisma from "../lib/prisma"
import { OrgType, Role } from "../app/generated/prisma/enums"

const APPLY = process.argv.includes("--apply")

// Every relation that points AT a user (prisma/schema.prisma model User).
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

type Director = {
  id: string
  email: string
  name: string
  createdAt: Date
  orgUnit: { name: string; type: OrgType; path: string }
  permissionOverride: { id: string } | null
  _count: Record<(keyof typeof REFERENCE_COUNTS) | string, number>
}

function referenceTotal(d: Director): number {
  return Object.values(d._count).reduce((sum, n) => sum + (Number(n) || 0), 0)
}

async function main() {
  console.log(`── dedupe-operational-directors: ${APPLY ? "APPLY" : "DRY RUN"} ─────────────`)

  const directors = (await prisma.user.findMany({
    where: {
      role: Role.DIRECTOR,
      orgUnit: { type: { in: [OrgType.ZONE, OrgType.REGION] } },
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      orgUnit: { select: { name: true, type: true, path: true } },
      permissionOverride: { select: { id: true } },
      _count: { select: REFERENCE_COUNTS },
    },
    // Same order the seed creates them in → first row is the canonical account.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })) as Director[]

  console.log(`[scan] ${directors.length} operational DIRECTOR account(s) on ZONE/REGION units`)

  // Group per zone/region NODE: path is unique (OrgUnit.path @unique), so the
  // deputy-CEO copy and each per-department copy of the same zone never
  // collapse into one another — only two heads on the SAME node group together.
  const groups = new Map<string, Director[]>()
  for (const d of directors) {
    const key = d.orgUnit.path
    const list = groups.get(key)
    if (list) list.push(d)
    else groups.set(key, [d])
  }

  const toDelete: Director[] = []
  const skipped: Director[] = []
  let kept = 0

  for (const [key, list] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [canonical, ...duplicates] = list
    kept++
    console.log(
      `[keep] ${key} → ${canonical.email} (${canonical.orgUnit.path})`
    )

    for (const dup of duplicates) {
      if (dup.permissionOverride || referenceTotal(dup) > 0) {
        skipped.push(dup)
        console.log(`[skip] ${dup.email} — still referenced, left in place`)
      } else {
        toDelete.push(dup)
        console.log(`[dele] ${dup.email} (${dup.orgUnit.path})`)
      }
    }
  }

  console.log(
    `[plan] ${kept} zone/region(s), ${toDelete.length} account(s) to delete, ` +
      `${skipped.length} kept because they are referenced`
  )

  if (!APPLY) {
    console.log("[done] DRY RUN — re-run with --apply to delete.")
    return
  }

  let deleted = 0
  for (const d of toDelete) {
    await prisma.user.delete({ where: { id: d.id } })
    deleted++
  }
  console.log(`[done] deleted ${deleted} redundant operational director account(s).`)
}

main()
  .catch((e) => {
    console.error("❌ dedupe-operational-directors failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    // lib/prisma.ts keeps an external pg.Pool alive, so force-exit (same reason
    // prisma/seed.ts does).
    process.exit(0)
  })
