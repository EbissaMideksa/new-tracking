// lib/woPermissions.ts
// ──────────────────────────────────────────────────────────────────────────────
// Persistence layer for the work-order action grant matrix.
// Mirrors lib/permissions.ts but uses the key "wo_permission_matrix".
//
// Adapter note:
//   This file assumes your DB has a SystemConfig model with { key, value } fields
//   (the same model used by lib/permissions.ts).  If your model is named
//   differently, update the `prisma.systemConfig` references below.
// ──────────────────────────────────────────────────────────────────────────────

import  prisma  from "@/lib/prisma"       // adjust to your Prisma client path
import { DEFAULT_WO_GRANT_MATRIX, WoGrantMatrix } from "@/lib/workOrderGrants"

const WO_PERMISSIONS_KEY = "wo_permission_matrix"

// ── In-process cache (avoids a DB hit on every SSE / API call) ───────────────
let _cache: WoGrantMatrix | null = null
let _cacheTime = 0
const CACHE_TTL_MS = 5_000 // 5 s

export function bustWoPermissionsCache() {
  _cache     = null
  _cacheTime = 0
}

// ── Read ──────────────────────────────────────────────────────────────────────
export async function loadWoPermissionsFromDB(): Promise<WoGrantMatrix> {
  const now = Date.now()
  if (_cache && now - _cacheTime < CACHE_TTL_MS) return _cache

  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key: WO_PERMISSIONS_KEY },
    })
    if (record?.value) {
      _cache     = JSON.parse(record.value as string) as WoGrantMatrix
      _cacheTime = now
      return _cache
    }
  } catch (err) {
    console.error("[woPermissions] DB load failed — falling back to defaults:", err)
  }
  return DEFAULT_WO_GRANT_MATRIX
}

// ── Write ─────────────────────────────────────────────────────────────────────
export async function saveWoPermissionsToDB(matrix: WoGrantMatrix): Promise<void> {
  const value = JSON.stringify(matrix)
  await prisma.systemSetting.upsert({
    where:  { key: WO_PERMISSIONS_KEY },
    create: { key: WO_PERMISSIONS_KEY, value },
    update: { value },
  })
  // Update cache immediately so the same process sees the new matrix
  _cache     = matrix
  _cacheTime = Date.now()
}
