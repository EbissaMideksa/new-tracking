// lib/woCheckout.ts
//
// Work-order checkout lock: once a WO is checked out, only the holder may take
// actions on it (start / complete / assign / checkin / delete / edit). Other
// users are blocked with 403. Viewing (GET) is unaffected.
//
// Full admins (SUPER_ADMIN / ADMIN) can override a stuck lock.
//
// Usage in a mutating route, after you've already loaded the order:
//   const blocked = checkoutLockBlocked(order, user)
//   if (blocked) return blocked
import { NextResponse } from "next/server"
import { canOverrideWoLock } from "./woCheckoutClient"

export type WoCheckoutHolder = { checkedOutById: string | null }

// Returns a 403 response if `order` is checked out by someone other than the
// caller (and the caller cannot override); otherwise null (caller may proceed).
// `user` must include id + role. Pure — no DB access — so pass the order you
// already loaded to avoid an extra query.
export function checkoutLockBlocked(
  order: WoCheckoutHolder,
  user: { id: string; role: string },
): NextResponse | null {
  if (canOverrideWoLock(user.role)) return null
  if (order.checkedOutById && order.checkedOutById !== user.id) {
    return NextResponse.json(
      { error: "This work order is checked out by another user and is locked." },
      { status: 403 },
    )
  }
  return null
}
