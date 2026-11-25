// app/api/admin/settings/route.ts
//
// GET    — list all system settings        (requires system_settings grant)
// POST   — upsert a single key/value       (requires system_settings grant)
// DELETE — delete a single key             (requires system_settings grant)
//
// Reserved keys (grant_matrix, wo_permission_matrix) are read-only here —
// they are managed by the dedicated permission-matrix pages.

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { loadPermissionsFromDB } from "@/lib/permissions"
import { canWithMatrix } from "@/lib/adminGrants"
import {
  getAllSettings,
  setSetting,
  deleteSetting,
  isReservedKey,
} from "@/lib/systemSettings"
import { publish } from "@/lib/broadcast"
import { createAuditLog } from "@/lib/audit"
import { z } from "zod"
import { SETTING_DEFS, SETTING_CATEGORIES } from "@/lib/defaultSettings"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"

export const dynamic = "force-dynamic"


async function requireSettingsGrant() {
  const user = await getCurrentUser()
  if (!user) return { user: null, ok: false as const }
  const grants = await loadPermissionsFromDB()
  const overrides = await loadUserOverrides(user.id)
  if (!effectiveCan(grants, user.role, "system_settings", overrides.admin))
    return { user, ok: false as const }
  return { user, ok: true as const }
}

export async function GET() {
  const guard = await requireSettingsGrant()
  if (!guard.ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const settings = await getAllSettings()
  const defs = SETTING_DEFS
  const categories = SETTING_CATEGORIES
  return NextResponse.json({ settings, defs, categories })
}

const upsertSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string(),
})

export async function POST(req: NextRequest) {
  const guard = await requireSettingsGrant()
  if (!guard.ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    )

  const { key, value } = parsed.data
  if (isReservedKey(key))
    return NextResponse.json(
      { error: `"${key}" is managed by its dedicated admin page and cannot be edited here."` },
      { status: 400 },
    )

  await setSetting(key, value)
  if (guard.user) {
    await createAuditLog({
      performedById: guard.user.id,
      action: `Updated system setting "${key}"`,
      actionType: "SETTINGS",
    })
    publish("audit", { event: "invalidate" })
  }
  return NextResponse.json({ success: true, key, value })
}

export async function DELETE(req: NextRequest) {
  const guard = await requireSettingsGrant()
  if (!guard.ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const key = req.nextUrl.searchParams.get("key")
  if (!key)
    return NextResponse.json({ error: "Missing key" }, { status: 400 })
  if (isReservedKey(key))
    return NextResponse.json(
      { error: `"${key}" is reserved and cannot be deleted here."` },
      { status: 400 },
    )

  await deleteSetting(key)
  if (guard.user) {
    await createAuditLog({
      performedById: guard.user.id,
      action: `Deleted system setting "${key}"`,
      actionType: "SETTINGS",
    })
    publish("audit", { event: "invalidate" })
  }
  return NextResponse.json({ success: true, key })
}
