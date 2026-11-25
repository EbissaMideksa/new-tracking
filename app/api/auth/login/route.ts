
// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { signToken } from "@/lib/jwt"
import { rateLimit, rateLimitReset } from "@/lib/rateLimit"
import { safeParseBody, loginSchema } from "@/lib/validate"
import { createAuditLog } from "@/lib/audit"
import { publish } from "@/lib/broadcast"
import { mustChangeOnFirstLogin } from "@/lib/defaultPassword"

// A real bcrypt hash, generated once per process, used to keep the "user does
// not exist" path as expensive as the "wrong password" path.
const BCRYPT_COST = 12
let dummyHashPromise: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = bcrypt.hash(crypto.randomUUID(), BCRYPT_COST)
  return dummyHashPromise
}


export async function POST(req: NextRequest) {
  // ── Client IP ─────────────────────────────────────────────────────────────
  // nginx sets `X-Real-IP $remote_addr` and APPENDS the real peer to
  // `X-Forwarded-For`. The FIRST XFF entry is therefore client-controlled and
  // can be spoofed to rotate past an IP-based limit; the LAST entry is the one
  // our own proxy added. Prefer X-Real-IP, then the last XFF hop.
  const fwd = req.headers.get("x-forwarded-for")
  const lastHop = fwd ? fwd.split(",").pop()?.trim() : null
  const ip = req.headers.get("x-real-ip")?.trim() || lastHop || "unknown"

  // Rate limit: 10 attempts per 15 minutes per IP
  if (!(await rateLimit(`login:ip:${ip}`, 10, 15 * 60 * 1000))) {
    console.warn({ event: "login_rate_limited", ip, scope: "ip" })
    return NextResponse.json({ error: "Too many login attempts" }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const parsed = safeParseBody(loginSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 })
    // Note: return generic message, don't expose validation details
  }

  const { email, password } = parsed.data

  // Second, per-account window. A higher threshold than the per-IP one so an
  // attacker cannot cheaply lock a known user out of their own account, while
  // still bounding credential stuffing from a pool of source IPs.
  if (!(await rateLimit(`login:email:${email.toLowerCase()}`, 20, 15 * 60 * 1000))) {
    console.warn({ event: "login_rate_limited", email, scope: "email" })
    return NextResponse.json({ error: "Too many login attempts" }, { status: 429 })
  }

  // Constant-time: always run bcrypt even if the user is not found, so the
  // response time can't be used to enumerate valid addresses. The dummy hash is
  // generated once per process at the SAME cost factor as real hashes — the
  // previous hardcoded string was not a valid bcrypt hash, so compare() bailed
  // out early and leaked the same timing signal it was meant to hide.
  const user = await prisma.user.findUnique({
    where: { email },
    include: { orgUnit: true }
  })

  const valid = await bcrypt.compare(password, user?.password ?? (await getDummyHash()))

  if (!user || !valid) {
    // Failed logins were previously invisible — successes were audited but
    // nothing recorded a bad password, so brute force left no trace.
    console.warn({
      event: "login_failed",
      email,
      ip,
      reason: user ? "bad_password" : "unknown_user",
    })
    if (user) {
      await createAuditLog({
        performedById: user.id,
        action: `Failed login attempt (${email})`,
        actionType: "AUTH",
        targetUserName: user.name,
        targetUserEmail: user.email,
        metadata: { ip, reason: "bad_password" },
      })
      publish("audit", { event: "invalidate" })
    }
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  // Correct credentials — clear both windows so a legitimate user who mistyped
  // their password is not throttled for the rest of the window.
  await rateLimitReset(`login:ip:${ip}`)
  await rateLimitReset(`login:email:${email.toLowerCase()}`)

  // ── Account state ─────────────────────────────────────────────────────────
  // `status` is maintained from the Users page (lib/userStatus.ts). Anything
  // but ACTIVE is refused here, so Status is an actual control rather than a
  // label — a suspended account keeps its credentials but cannot sign in.
  if (user.status !== "ACTIVE") {
    console.warn({ event: "login_refused", email, ip, status: user.status })
    await createAuditLog({
      performedById:   user.id,
      action:          `Refused login for ${user.email} — account is ${user.status}`,
      actionType:      "AUTH",
      targetUserName:  user.name,
      targetUserEmail: user.email,
      metadata:        { ip, status: user.status },
    })
    publish("audit", { event: "invalidate" })
    return NextResponse.json(
      { error: user.status === "SUSPENDED"
          ? "Account suspended — contact an administrator"
          : "Account is inactive — contact an administrator" },
      { status: 403 },
    )
  }

  // ── Last login ────────────────────────────────────────────────────────────
  // Feeds the "Last Login" column on the Users page (oversight/scoping).
  await prisma.user.update({
    where: { id: user.id },
    data:  { lastLoginAt: new Date() },
  })

  // Live: users page subscribes to `user:${id}` and updates the Last Login
  // column in real-time without a full re-fetch.
  publish(`user:${user.id}`, {
    event: "updated",
    user:  { id: user.id, lastLoginAt: new Date().toISOString() },
  })

  const token = signToken({
    id: user.id,
    role: user.role,
    orgPath: user.orgUnit.path,
    // Carried in the token so proxy.ts can route a first-login account to
    // /change-password without a DB round-trip. Sourced from the DB flag, so it
    // clears as soon as the password is changed (which re-signs this token).
    // SUPER_ADMIN is never flagged — see lib/defaultPassword.ts.
    mustChangePassword: user.mustChangePassword && mustChangeOnFirstLogin(user.role),
  })


  const res = NextResponse.json({
    success: true,
    user: { id: user.id, email: user.email, role: user.role },
    // true → the login page goes to /change-password instead of /dashboard
    mustChangePassword: user.mustChangePassword && mustChangeOnFirstLogin(user.role),
  })

  // Derive secure from the actual request protocol, not NODE_ENV.
  // Behind nginx (cloud) X-Forwarded-Proto is "https"; locally over HTTP it
  // is absent / "http". Tying this to NODE_ENV broke local prod-mode login
  // because the browser drops Secure cookies over HTTP.
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim()
  const isHttps = forwardedProto === "https" || req.nextUrl.protocol === "https:"

  res.cookies.set("token", token, {
    httpOnly: true,
    path: "/",
    sameSite: "strict",  // upgraded from lax
    secure: isHttps,
    maxAge: 8 * 60 * 60  // 8h matches token expiry
  })

  await createAuditLog({
    performedById: user.id,
    action: `User logged in (${user.email})`,
    actionType: "AUTH",
    targetUserName: user.name,
    targetUserEmail: user.email,
  })
  publish("audit", { event: "invalidate" })

  return res
}
