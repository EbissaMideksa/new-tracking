// scripts/rotate-default-passwords.ts
// ─────────────────────────────────────────────────────────────────────────────
// Finds every account whose password still matches the old seed default
// ("admin123") and, with --apply, replaces it with a fresh random password.
//
// WHY THIS EXISTS
//   prisma/seed.ts used to hash the literal "admin123" ONCE and assign that same
//   hash to every account it created (super@track.com, admin@track.com, and
//   ~1000 hierarchical users). The public login page also printed those
//   credentials. Any deployment that ran that seed with real data therefore has
//   known-password accounts — this script finds and closes them.
//
// USAGE (the DB has no published host port, so run it inside the stack):
//   docker compose -f docker-compose-cloud.yml -f docker-compose-monitoring.yml \
//     --env-file .env.docker.cloud run --rm --no-deps migrator \
//     node node_modules/.bin/tsx scripts/rotate-default-passwords.ts
//
//   Add --apply to actually write the new passwords:
//   ... scripts/rotate-default-passwords.ts --apply
//
// Default mode is a DRY RUN: it only reports what it would change.
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import prisma from "../lib/prisma"

const OLD_DEFAULT = "admin123"
const NEW_BCRYPT_COST = 12
const APPLY = process.argv.includes("--apply")

// Group by the stored hash instead of testing every user individually: the seed
// reused ONE hash string for every account, so a single bcrypt.compare() covers
// all of them. This turns ~1000 comparisons (~100 s) into a handful.

async function main() {
  console.log(`── rotate-default-passwords: ${APPLY ? "APPLY" : "DRY RUN"} ─────────────`)

  const groups = await prisma.user.groupBy({
    by: ["password"],
    _count: { password: true },
  })

  console.log(`[scan] ${groups.length} distinct password hash(es) across the user table`)

  const compromisedHashes: string[] = []
  for (const g of groups) {
    if (await bcrypt.compare(OLD_DEFAULT, g.password)) {
      compromisedHashes.push(g.password)
      console.log(`[scan] ← hash used by ${g._count.password} account(s) matches the old default`)
    }
  }

  if (compromisedHashes.length === 0) {
    console.log("[scan] ✅ No account uses the old default password. Nothing to do.")
    return
  }

  const targets = await prisma.user.findMany({
    where: { password: { in: compromisedHashes } },
    select: { id: true, email: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  })

  const byRole = targets.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1
    return acc
  }, {})

  console.log(`\n[report] ${targets.length} account(s) still on the default password:`)
  for (const [role, n] of Object.entries(byRole)) console.log(`           ${role.padEnd(12)} ${n}`)

  // Always show the privileged ones — these are the urgent ones.
  const privileged = targets.filter((u) => ["SUPER_ADMIN", "ADMIN"].includes(u.role))
  if (privileged.length) {
    console.log("\n[report] privileged accounts affected (rotate these FIRST):")
    for (const u of privileged) console.log(`           ${u.role.padEnd(12)} ${u.email}`)
  }

  if (!APPLY) {
    console.log("\n[dry-run] No changes written. Re-run with --apply to rotate.")
    return
  }

  console.log("\n[apply] rotating…")
  const issued: { email: string; password: string }[] = []

  for (const u of targets) {
    const newPassword = crypto.randomBytes(18).toString("base64url") // 24 chars
    const hashed = await bcrypt.hash(newPassword, NEW_BCRYPT_COST)
    await prisma.user.update({ where: { id: u.id }, data: { password: hashed } })
    issued.push({ email: u.email, password: newPassword })
  }

  // One-time bootstrap credentials — print ONCE, distribute over a secure
  // channel, then revert this terminal. Nothing is written to disk.
  console.log("\n=========== NEW PASSWORDS (shown once) ===========")
  for (const i of issued) console.log(`${i.email}\t${i.password}`)
  console.log("=================================================")
  console.log("Distribute these securely and require each user to change theirs.")

  // Keep the audit trail honest.
  const actor = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  })
  if (actor) {
    await prisma.audit.create({
      data: {
        action: `Rotated ${issued.length} account(s) off the seeded default password`,
        actionType: "USER_MANAGEMENT",
        performedById: actor.id,
        metadata: { kind: "password_rotation", count: issued.length, emails: issued.map((i) => i.email) },
      },
    })
    console.log("[audit] rotation recorded in the Audit table")
  }
}

main()
  .catch((e) => {
    console.error("❌ rotate-default-passwords failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    // lib/prisma.ts keeps an external pg.Pool alive, so force-exit (same reason
    // prisma/seed.ts does).
    process.exit(0)
  })
