
// scripts/backfill-political-area.ts
//
// One-off: recompute Asset.politicalArea from each asset's CURRENT org unit.
//
// Why this is needed: politicalArea was set once at upload and never updated on
// a move, so every asset that has been transferred still reports the region of
// the unit it used to live in. The table and exports now derive the area live
// (so they are already correct), but the stored column is what reports, filters
// and any other consumer read. This brings the stored values back in line.
//
// Safe to re-run: it only writes rows whose area actually changed, and it never
// touches a row whose org unit no longer resolves.
//
// Usage:
//   set -a && . ./.env && set +a && npx tsx scripts/backfill-political-area.ts
//   … add --dry-run to report what would change without writing.

import prisma from "../lib/prisma"
import { getPoliticalAreasForOrgUnits } from "../lib/assetUpload"

const BATCH = 2000
const DRY_RUN = process.argv.includes("--dry-run")

async function main() {
  const total = await prisma.asset.count()
  console.log(`Scanning ${total.toLocaleString()} assets${DRY_RUN ? " (dry run — no writes)" : ""}\n`)

  let scanned = 0
  let changed = 0
  let unresolved = 0
  let cursor: string | null = null
  const started = Date.now()

  // Keyset pagination on id: OFFSET would re-sort the whole table per batch,
  // which is ruinous at ~1M rows.
  for (;;) {
    const batch: { id: string; politicalArea: string | null; orgUnitId: string }[] =
      await prisma.asset.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: "asc" },
      take: BATCH,
      select: { id: true, politicalArea: true, orgUnitId: true },
    })
    if (batch.length === 0) break

    const areas = await getPoliticalAreasForOrgUnits(batch.map((b: { orgUnitId: string }) => b.orgUnitId))

    const updates: { id: string; politicalArea: string }[] = []
    for (const row of batch) {
      const area = areas.get(row.orgUnitId)
      if (!area) { unresolved++; continue }
      // Only ever overwrite with a resolved area. A row whose area cannot be
      // derived keeps whatever it has — that value came from the uploaded
      // spreadsheet's own "Area (Political Admin)" column, and blanking it
      // would destroy source data rather than correct a stale derivation.
      if ((row.politicalArea ?? null) !== area) {
        updates.push({ id: row.id, politicalArea: area })
      }
    }

    if (updates.length > 0) {
      if (!DRY_RUN) {
        await prisma.$transaction(
          updates.map(u => prisma.asset.update({ where: { id: u.id }, data: { politicalArea: u.politicalArea } }))
        )
      }
      changed += updates.length
      if (changed <= 40) {
        for (const u of updates.slice(0, 6)) {
          console.log(`   ${DRY_RUN ? "would set" : "set"} ${u.id.slice(0, 8)} → ${u.politicalArea}`)
        }
      }
    }

    scanned += batch.length
    cursor = batch[batch.length - 1].id

    const pct = Math.round((scanned / total) * 100)
    process.stdout.write(`\r   ${scanned.toLocaleString()} / ${total.toLocaleString()} (${pct}%)  changed=${changed}   `)
  }

  console.log("\n")
  console.log(`   scanned            ${scanned.toLocaleString()}`)
  console.log(`   ${DRY_RUN ? "would change" : "changed"}       ${changed.toLocaleString()}`)
  console.log(`   org units unresolved ${unresolved.toLocaleString()} (left untouched — existing value kept)`)
  console.log(`   elapsed            ${((Date.now() - started) / 1000).toFixed(1)}s`)
  if (DRY_RUN) console.log("\n   Re-run without --dry-run to apply.")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
