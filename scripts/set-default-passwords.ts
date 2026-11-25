// scripts/set-default-passwords.ts
// ─────────────────────────────────────────────────────────────────────────────
// Moves EXISTING accounts onto the built-in default password
// (lib/defaultPassword.ts → DEFAULT_PASSWORD, "Test@123" unless overridden) and
// flags them so they must choose a new one at first login.
//
// WHY THIS EXISTS
//   prisma/seed.ts and POST /api/users provision NEW accounts that way, and the
//   migration 20260929000000_add_must_change_password deliberately leaves
//   existing rows alone (their password is not the built-in default, so forcing
//   them to change would be wrong). Accounts created by the old seed — which
//   hashed SEED_ADMIN_PASSWORD once for all ~1100 rows — are moved onto the
//   default only when an operator decides to. This script is that decision, in
//   bulk, with a report first.
//
// USAGE (no published DB port, so it runs inside the stack):
//   make set-default-passwords                 # dry run: who would change
//   make set-default-passwords APPLY=1         # do it
//   make set-default-passwords APPLY=1 INCLUDE_SUPER_ADMIN=1
//
// SUPER_ADMIN is skipped by default: it is the exempt account, and resetting it
// onto a published password is precisely what the exemption exists to prevent.
// INCLUDE_SUPER_ADMIN=1 overrides that, but the account is still never flagged
// for a forced change.
//
// Default mode is a DRY RUN: it only reports what it would change.
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config"
import bcrypt from "bcryptjs"
import prisma from "../lib/prisma"
import { DEFAULT_PASSWORD, mustChangeOnFirstLogin } from "../lib/defaultPassword"

const APPLY = process.argv.includes("--apply")
const INCLUDE_SUPER_ADMIN = process.argv.includes("--include-superadmin")

async function main() {
  console.log(`── set-default-passwords: ${APPLY ? "APPLY" : "DRY RUN"} ─────────────`)
  console.log(`[policy] default password: ${DEFAULT_PASSWORD}`)
  if (INCLUDE_SUPER_ADMIN) {
    console.log("[policy] --include-superadmin: SUPER_ADMIN rows are reset too (still never flagged)")
  }

  const targets = await prisma.user.findMany({
    where: INCLUDE_SUPER_ADMIN ? {} : { role: { not: "SUPER_ADMIN" } },
    select: { id: true, email: true, name: true, role: true, mustChangePassword: true },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  })

  if (targets.length === 0) {
    console.log("[scan] ✅ No accounts to reset.")
    return
  }

  const byRole = targets.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1
    return acc
  }, {})
  const alreadyFlagged = targets.filter((u) => u.mustChangePassword).length

  console.log(`\n[report] ${targets.length} account(s) would move to the default password (+ forced change):`)
  for (const [role, n] of Object.entries(byRole)) console.log(`           ${role.padEnd(12)} ${n}`)
  console.log(`           already flagged for a change: ${alreadyFlagged}`)

  if (!INCLUDE_SUPER_ADMIN) {
    const superAdmins = await prisma.user.findMany({
      where: { role: "SUPER_ADMIN" },
      select: { email: true },
      orderBy: { createdAt: "asc" },
    })
    if (superAdmins.length) {
      console.log("\n[report] skipped SUPER_ADMIN account(s) — exempt, see lib/defaultPassword.ts:")
      for (const s of superAdmins) console.log(`           ${s.email}`)
      console.log("           (add --include-superadmin to reset them as well)")
    }
  }

  if (!APPLY) {
    console.log("\n[dry-run] No changes written. Re-run with --apply to reset them.")
    return
  }

  console.log("\n[apply] resetting…")

  // They all receive the SAME password, so one hash is enough — hashing per row
  // would add ~1s × N against a remote database.
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12)

  // Split the exempt roles out: they get the password but never the flag.
  const forced   = targets.filter((u) =>  mustChangeOnFirstLogin(u.role))
  const exempted = targets.filter((u) => !mustChangeOnFirstLogin(u.role))

  if (forced.length) {
    const res = await prisma.user.updateMany({
      where: { id: { in: forced.map((u) => u.id) } },
      data:  { password: hash, mustChangePassword: true, passwordChangedAt: null },
    })
    console.log(`[apply] ✅ ${res.count} account(s) now use the default password — change required at next login`)
  }

  if (exempted.length) {
    const res = await prisma.user.updateMany({
      where: { id: { in: exempted.map((u) => u.id) } },
      // No flag: an exempt account must never be locked behind the gate.
      data:  { password: hash, mustChangePassword: false, passwordChangedAt: null },
    })
    console.log(`[apply] ⚠️  ${res.count} exempt account(s) reset to the default password WITHOUT a forced change`)
  }

  // Keep the audit trail honest.
  const actor = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  })
  if (actor) {
    await prisma.audit.create({
      data: {
        action: `Reset ${forced.length + exempted.length} account(s) to the default password`,
        actionType: "USER_MANAGEMENT",
        performedById: actor.id,
        metadata: {
          kind: "default_password_reset",
          count: forced.length + exempted.length,
          forcedChange: forced.length,
          exempt: exempted.length,
          byRole,
          includeSuperAdmin: INCLUDE_SUPER_ADMIN,
        },
      },
    })
    console.log("[audit] reset recorded in the Audit table")
  }
}

main()
  .catch((e) => {
    console.error("❌ set-default-passwords failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    // lib/prisma.ts keeps an external pg.Pool alive, so force-exit (same reason
    // prisma/seed.ts and scripts/rotate-default-passwords.ts do).
    process.exit(0)
  })
