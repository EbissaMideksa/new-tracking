// scripts/verify-password-gate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Behavioural check of the forced-password-change gate in proxy.ts.
//
// It calls the real exported `proxy()` with real signed tokens (lib/jwt) and
// asserts the routing decision for each case:
//   * flagged user      → /dashboard/* redirects to /change-password
//   * flagged user      → /api/* 403s, except the change/sign-out allowlist
//   * flagged user      → /change-password is allowed through (no redirect loop)
//   * clear user        → nothing is blocked
//   * anonymous user    → /dashboard/* still redirects to /login (old behaviour)
//
// USAGE: npx tsx scripts/verify-password-gate.ts   (or `make verify-password-gate`)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server"
import { signToken } from "../lib/jwt"
import { proxy } from "../proxy"

// The proxy bundle reads the cookie, so the env secret must look real.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = "verify-password-gate-secret-at-least-32-chars"
}

let passed = 0
let failed = 0

type Expect = "next" | "redirect" | "json"

function check(name: string, actual: string, expected: Expect, detail = "") {
  if (actual === expected) {
    passed++
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ""}`)
  } else {
    failed++
    console.error(`FAIL  ${name} — expected ${expected}, got ${actual}${detail ? ` (${detail})` : ""}`)
  }
}

/** Map a proxy() result onto the three outcomes we care about. */
function outcomeOf(res: ReturnType<typeof proxy>): string {
  if (!res) return "next"
  const status = res.status
  // NextResponse.next() marks itself with this header; redirects carry Location.
  if (res.headers.get("x-middleware-next") === "1") return "next"
  if (res.headers.get("location")) return "redirect"
  return status === 403 || status === 401 ? "json" : `other:${status}`
}

function call(path: string, token?: string): string {
  const headers = new Headers()
  if (token) headers.set("cookie", `token=${token}`)
  const req = new NextRequest(new Request(`http://localhost${path}`, { headers }))
  return outcomeOf(proxy(req))
}

function main() {
  const flagged = signToken({
    id: "u1", role: "USER", orgPath: "ethiopia", mustChangePassword: true,
  })
  const clear = signToken({
    id: "u2", role: "USER", orgPath: "ethiopia", mustChangePassword: false,
  })
  // Token shape issued before this feature existed (no claim at all).
  const legacy = signToken({ id: "u3", role: "USER", orgPath: "ethiopia" })

  console.log("── forced password change gate (proxy.ts) ─────────────")

  // Flagged account: everything closed except the change screen and the
  // endpoints needed to complete the change or sign out.
  check("flagged → /dashboard redirects to the change screen",
        call("/dashboard", flagged), "redirect")
  check("flagged → /dashboard/assets redirects too",
        call("/dashboard/assets", flagged), "redirect")
  check("flagged → /change-password is allowed (no redirect loop)",
        call("/change-password", flagged), "next")
  check("flagged → /api/assets is refused",
        call("/api/assets", flagged), "json")
  check("flagged → /api/settings/password stays open",
        call("/api/settings/password", flagged), "next")
  check("flagged → /api/auth/logout stays open",
        call("/api/auth/logout", flagged), "next")
  check("flagged → /api/me stays open",
        call("/api/me", flagged), "next")
  check("flagged → /api/auth/login stays open",
        call("/api/auth/login", flagged), "next")

  // Clear account and pre-feature tokens: untouched.
  check("clear → /dashboard allowed", call("/dashboard", clear), "next")
  check("clear → /api/assets allowed", call("/api/assets", clear), "next")
  check("token without the claim is not treated as flagged (old sessions)",
        call("/dashboard", legacy), "next")

  // Existing behaviour must survive the rewrite.
  check("anonymous → /dashboard redirects to /login",
        call("/dashboard"), "redirect")
  check("anonymous → /api/health untouched (docker/nginx probe)",
        call("/api/health"), "next")
  check("anonymous → /login untouched", call("/login"), "next")

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main()
