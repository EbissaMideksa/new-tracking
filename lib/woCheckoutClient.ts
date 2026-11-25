// lib/woCheckoutClient.ts
//
// Client-safe checkout-lock helpers (no server imports) — shared by the UI and
// the server lock so the override rule stays in one place.

export const WO_LOCK_OVERRIDE_ROLES = ["SUPER_ADMIN", "ADMIN"] as const

// Full admins can break a stuck checkout lock (e.g. the holder is unavailable).
export function canOverrideWoLock(role?: string | null): boolean {
  return !!role && (WO_LOCK_OVERRIDE_ROLES as readonly string[]).includes(role)
}

// True if the work order is checked out by someone other than `me` and `me`
// cannot override. `me` should include id + role; null/undefined me => locked
// if checkedOutById is set.
export function isWoLockedByOther(
  wo: { checkedOutById?: string | null },
  me: { id: string; role?: string | null } | null | undefined,
): boolean {
  if (!wo.checkedOutById) return false
  if (!me) return true
  if (canOverrideWoLock(me.role)) return false
  return wo.checkedOutById !== me.id
}
