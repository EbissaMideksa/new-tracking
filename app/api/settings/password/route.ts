
// app/api/settings/password/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser, invalidateCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { createAuditLog } from "@/lib/audit"
import { publish } from "@/lib/broadcast"
import { signToken } from "@/lib/jwt"
import { isDefaultPassword, PASSWORD_MIN_LENGTH } from "@/lib/defaultPassword"

export async function PATCH(req: NextRequest) {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { userId, currentPassword, newPassword } = body

    if (me.id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return NextResponse.json(
        { error: `New password must be at least ${PASSWORD_MIN_LENGTH} characters` },
        { status: 400 }
      )
    }
    // The whole point of the first-login flow is to get OFF the built-in
    // default; accepting it again would leave this account on a password that
    // is published in the source tree.
    if (isDefaultPassword(newPassword)) {
      return NextResponse.json(
        { error: "Choose a password other than the default one" },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true, mustChangePassword: true },
    })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const isValid = await bcrypt.compare(currentPassword, user.password)
    if (!isValid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
    }

    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashed,
        // Satisfied the forced change (no-op for an account that was already
        // clear — SUPER_ADMIN is never flagged in the first place).
        mustChangePassword: false,
        passwordChangedAt:  new Date(),
      },
    })

    // Drop the 30s cached user row, otherwise app/dashboard/layout.tsx would
    // keep seeing mustChangePassword=true and bounce the user back here.
    await invalidateCurrentUser(userId)

    await createAuditLog({
      performedById: userId,
      action: user.mustChangePassword
        ? "Changed account password (first-login change completed)"
        : "Changed account password",
      actionType: "USER_MANAGEMENT",
      targetUserName: me.name,
      targetUserEmail: me.email,
      metadata: { completedForcedChange: user.mustChangePassword },
    })
    publish("audit", { event: "invalidate" })

    const res = NextResponse.json({
      message: "Password updated successfully",
      mustChangePassword: false,
    })

    // Re-sign the session cookie with the claim cleared. proxy.ts reads that
    // claim, so without this the user would keep being redirected back to
    // /change-password until their next login.
    const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim()
    const isHttps = forwardedProto === "https" || req.nextUrl.protocol === "https:"
    res.cookies.set(
      "token",
      signToken({
        id: me.id,
        role: me.role,
        orgPath: me.orgUnit.path,
        mustChangePassword: false,
      }),
      {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: isHttps,
        maxAge: 8 * 60 * 60, // matches signToken expiry
      }
    )

    return res
  } catch (err: any) {
    console.error("[api/settings/password] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
