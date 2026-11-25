// lib/userStatus.ts
//
// The account-state vocabulary, shared by the API (create/update validation,
// the sign-in gate in app/api/auth/login/route.ts) and by the Users page UI
// (filter, column chips, Add/Edit form) so the three can never drift apart.
export const USER_STATUSES = ["ACTIVE", "SUSPENDED", "INACTIVE"] as const

export type UserStatus = (typeof USER_STATUSES)[number]

export function isUserStatus(v: unknown): v is UserStatus {
  return typeof v === "string" && (USER_STATUSES as readonly string[]).includes(v)
}
