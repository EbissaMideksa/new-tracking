// lib/defaultPassword.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the platform's default account password and the
// two rules that make handing it out acceptable.
//
// WHY A KNOWN PASSWORD IS OK HERE
//   Administrators provision ~1100 accounts (prisma/seed.ts + the Users page).
//   Issuing a different random password to each one is not operable, so every
//   provisioned account starts on the same built-in default and is FORCED to
//   change it at first login. Three layers enforce that:
//     1. proxy.ts                 — redirects pages / 403s APIs
//     2. app/dashboard/layout.tsx — DB-backed, catches post-login resets
//     3. lib/withAuth.ts          — the API permission gate
//   and PATCH /api/settings/password refuses to accept the default again.
//
// SUPER_ADMIN IS SPECIAL
//   * It is never flagged for a forced change and is never blocked by the gate,
//     so a locked-out deployment always has one known way back in. The seed may
//     give it a deployment-specific SEED_ADMIN_PASSWORD instead of the default.
//   * It is the ONLY role allowed to put another account back onto the default
//     password (PATCH /api/users/[id] with { resetPassword: true }), which
//     re-flags that account for a forced change.
//
// Override the value per deployment with DEFAULT_USER_PASSWORD (must stay ≥ 8
// characters so it satisfies both the login and the create-user schemas).
// ─────────────────────────────────────────────────────────────────────────────

/** The password every provisioned account starts with. */
export const DEFAULT_PASSWORD = (process.env.DEFAULT_USER_PASSWORD || "Test@123").trim()

/** Roles that are never forced to change the default password. */
export const FORCED_CHANGE_EXEMPT_ROLES = ["SUPER_ADMIN"] as const

/** Minimum length shared with lib/validate.ts + /api/settings/password. */
export const PASSWORD_MIN_LENGTH = 8

/** Is this plaintext the built-in default (i.e. must it be rejected/replaced)? */
export function isDefaultPassword(pw: string | null | undefined): boolean {
  return typeof pw === "string" && pw === DEFAULT_PASSWORD
}

/** true → this account must change its password before using the app. */
export function mustChangeOnFirstLogin(role: string | null | undefined): boolean {
  if (!role) return false
  return !(FORCED_CHANGE_EXEMPT_ROLES as readonly string[]).includes(role)
}

/** Only SUPER_ADMIN may reset someone else onto the default password. */
export function canResetToDefault(role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN"
}
