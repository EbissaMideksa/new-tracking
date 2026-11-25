
// lib/withAuth.ts
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { loadPermissionsFromDB } from "@/lib/permissions"
import { AdminAction } from "@/lib/adminGrants"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"
import { mustChangeOnFirstLogin } from "@/lib/defaultPassword"

type RouteContext = { params: Promise<Record<string, string>> }
type Handler = (
  req: NextRequest,
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  ctx?: RouteContext
) => Promise<NextResponse>

export function withAuth(handler: Handler, requiredAction?: AdminAction) {
  return async (req: NextRequest, ctx?: RouteContext) => {
    // 1. Auth
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 1b. Accounts still on the built-in default password may not use the API —
    //     the only door left open is PATCH /api/settings/password, which does not
    //     go through withAuth. SUPER_ADMIN is exempt (lib/defaultPassword.ts).
    //     proxy.ts blocks these calls earlier; this is the authoritative check.
    if (user.mustChangePassword && mustChangeOnFirstLogin(user.role)) {
      return NextResponse.json(
        { error: "Password change required", code: "PASSWORD_CHANGE_REQUIRED" },
        { status: 403 }
      )
    }

    // 2. Always load fresh from DB — no module-level cache
    const matrix = await loadPermissionsFromDB()

    // 3. Permission check against the live matrix + this caller's personal
    //    overrides (Accounts Management grants/revokes on top of their role)
    if (requiredAction) {
      const overrides = await loadUserOverrides(user.id)
      if (!effectiveCan(matrix, user.role, requiredAction, overrides.admin)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    // 4. Delegate
    try {
      return await handler(req, user, ctx)
    } catch (err) {
      console.error("[withAuth] Unhandled error:", err)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }
}
