
// proxy.ts
//
// Next 16 runs Proxy on the Node.js runtime by default (the `runtime` config
// option is not allowed here), so lib/jwt works in this file.
//
// Two gates:
//   1. no session cookie on /dashboard/*  → /login            (as before)
//   2. signed in but still on the built-in default password → the app is closed
//      until it is changed: pages redirect to /change-password, API calls get
//      403. /api/auth/*, /api/me and /api/settings/password stay open so the
//      change itself and signing out are always possible.
//
// This gate is for UX/routing only — it reads a claim, so a hand-crafted cookie
// could clear it. Real enforcement lives in getCurrentUser() (signature check in
// every route), lib/withAuth.ts and app/dashboard/layout.tsx, which all consult
// the DB flag. Next's own docs make the same point: never rely on Proxy alone.
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { verifyToken } from "./lib/jwt"

const CHANGE_PASSWORD_PATH = "/change-password"

// Endpoints that must stay reachable while a password change is pending —
// otherwise a flagged user could not change it or even sign out.
const ALLOWED_WHILE_PENDING = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/me",
  "/api/settings/password",
]

// Must export a function named `proxy`
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get("token")?.value

  // Protect dashboard
  if (pathname.startsWith("/dashboard") && !token) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // Pending password change? The claim is written at login and re-signed by
  // PATCH /api/settings/password, so this costs no DB round-trip. Tokens issued
  // before this feature simply lack the claim and are handled by the DB-backed
  // checks downstream.
  const pending =
    !!token && (verifyToken(token) as { mustChangePassword?: boolean } | null)?.mustChangePassword === true

  if (!pending) return NextResponse.next()

  if (pathname.startsWith("/api")) {
    const allowed = ALLOWED_WHILE_PENDING.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    )
    if (allowed) return NextResponse.next()
    return NextResponse.json(
      { error: "Password change required", code: "PASSWORD_CHANGE_REQUIRED" },
      { status: 403 }
    )
  }

  if (pathname === CHANGE_PASSWORD_PATH) return NextResponse.next()

  return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, req.url))
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*", "/change-password"],
}
