// scripts/verify-password-policy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Assertions for the default-password / forced-change policy in
// lib/defaultPassword.ts. Pure functions only — no DB, no network — so this runs
// in CI and in `make test` alongside the SSE org-scope assertions.
//
// USAGE: npx tsx scripts/verify-password-policy.ts   (or `make verify-password-policy`)
// ─────────────────────────────────────────────────────────────────────────────

import {
  DEFAULT_PASSWORD,
  FORCED_CHANGE_EXEMPT_ROLES,
  PASSWORD_MIN_LENGTH,
  canResetToDefault,
  isDefaultPassword,
  mustChangeOnFirstLogin,
} from "../lib/defaultPassword"

let passed = 0
let failed = 0

function check(name: string, cond: boolean) {
  if (cond) {
    passed++
    console.log(`PASS  ${name}`)
  } else {
    failed++
    console.error(`FAIL  ${name}`)
  }
}

function main() {
  console.log(`── password policy (default = "${DEFAULT_PASSWORD}") ─────────────`)

  // The default must itself be usable, otherwise every provisioned account
  // would fail the login/create schemas before its first change.
  check(
    `default password is at least ${PASSWORD_MIN_LENGTH} characters`,
    DEFAULT_PASSWORD.length >= PASSWORD_MIN_LENGTH
  )
  check("default password is not whitespace-padded", DEFAULT_PASSWORD === DEFAULT_PASSWORD.trim())

  check("isDefaultPassword recognises the default", isDefaultPassword(DEFAULT_PASSWORD))
  check(
    "isDefaultPassword is case sensitive (near-miss rejected)",
    !isDefaultPassword(DEFAULT_PASSWORD.toUpperCase())
  )
  check(
    "isDefaultPassword rejects null/undefined/empty",
    !isDefaultPassword(null) && !isDefaultPassword(undefined) && !isDefaultPassword("")
  )

  // Forced change: everyone except the exempt list.
  const nonExempt = ["ADMIN", "CHIEF", "DIRECTOR", "MANAGER", "SUPERVISOR", "USER"]
  check(
    "every non-exempt role is forced to change at first login",
    nonExempt.every((r) => mustChangeOnFirstLogin(r))
  )
  check("SUPER_ADMIN is exempt from the forced change", mustChangeOnFirstLogin("SUPER_ADMIN") === false)
  check(
    "exempt list is exactly SUPER_ADMIN",
    FORCED_CHANGE_EXEMPT_ROLES.length === 1 && FORCED_CHANGE_EXEMPT_ROLES[0] === "SUPER_ADMIN"
  )
  check(
    "unknown/blank role is treated as not forced (fail-open for the gate)",
    mustChangeOnFirstLogin("") === false && mustChangeOnFirstLogin(null) === false
  )

  // Reset-to-default is SUPER_ADMIN's privilege alone.
  check("SUPER_ADMIN may reset others onto the default", canResetToDefault("SUPER_ADMIN") === true)
  check(
    "no other role may reset onto the default",
    ["ADMIN", "CHIEF", "MANAGER", "USER", "", null, undefined].every((r) => canResetToDefault(r) === false)
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main()
