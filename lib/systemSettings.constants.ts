// lib/systemSettings.constants.ts
// Client-safe constants for system settings — NO Prisma / server imports.
// Shared by the server lib (lib/systemSettings.ts) and the client editor
// (components/SystemSettingsTable.tsx) so reserved keys stay in sync.

export const RESERVED_KEYS = ["grant_matrix", "wo_permission_matrix"] as const

export function isReservedKey(key: string): boolean {
  return (RESERVED_KEYS as readonly string[]).includes(key)
}
