// lib/withPermissions.ts
import { loadPermissionsFromDB } from "@/lib/permissions"

let loaded = false

export async function ensurePermissionsLoaded() {
  if (!loaded) {
    await loadPermissionsFromDB()
    loaded = true
  }
}

// Call invalidateRuntimeMatrix() after saving to reset `loaded`
