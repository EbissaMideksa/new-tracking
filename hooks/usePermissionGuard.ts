// hooks/usePermissionGuard.ts

"use client"
// hooks/usePermissionGuard.ts
//
// Guards a page by checking a single permission.
// Only waits for the user's OWN role to load (one fast /api/me call).
// Does NOT wait for matrixLoading — the matrix starts as DEFAULT_GRANT_MATRIX
// synchronously, so can() works immediately on first render.
//
// Usage:
//   const { ready, allowed, myRole } = usePermissionGuard("manage_users")
//   if (!ready)   return <Spinner />
//   if (!allowed) return <AccessDenied />

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { usePermissions } from "@/context/PermissionsContext"
import { AdminAction } from "@/lib/adminGrants"

interface GuardResult {
  ready:   boolean        // true once the user's role is known
  allowed: boolean        // true when the user has the required permission
  myRole:  string | null
}

export function usePermissionGuard(
  requiredAction: AdminAction,
  redirectTo = "/dashboard"
): GuardResult {
  const router = useRouter()
  const { canSelf, loading: matrixLoading } = usePermissions()   // ← canSelf, not can
  const [myRole,      setMyRole]      = useState<string | null>(null)
  const [roleLoading, setRoleLoading] = useState(true)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    fetch("/api/me", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.role) setMyRole(d.role) })
      .catch(() => {})
      .finally(() => setRoleLoading(false))
  }, [])

  const ready   = !roleLoading && !matrixLoading
  const allowed = ready && myRole !== null ? canSelf(requiredAction) : false   // ← canSelf, not can(myRole, ...)

  useEffect(() => {
    if (!ready) return
    if (!allowed) {
      router.replace(redirectTo)
    }
  }, [ready, allowed, router, redirectTo])

  return { ready, allowed, myRole }
}

/* export function usePermissionGuard(
  requiredAction: AdminAction,
  redirectTo = "/dashboard"
): GuardResult {
  const router = useRouter()
  //const { can } = usePermissions()  // matrix starts as DEFAULT_GRANT_MATRIX — no loading wait needed
   const { can, loading: matrixLoading } = usePermissions()   // ← grab loading
  const [myRole,      setMyRole]      = useState<string | null>(null)
  const [roleLoading, setRoleLoading] = useState(true)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    fetch("/api/me", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.role) setMyRole(d.role) })
      .catch(() => {})
      .finally(() => setRoleLoading(false))
  }, [])

  // ready = role is known. We don't block on matrixLoading because:
  // 1. The context default is DEFAULT_GRANT_MATRIX (not empty/null)
  // 2. can() works correctly from the very first render
  // 3. If SUPER_ADMIN changed permissions, SSE will push the update
 
  const ready   = !roleLoading && !matrixLoading
  const allowed = ready && myRole !== null ? can(myRole, requiredAction) : false

  useEffect(() => {
    if (!ready) return       // still fetching role — wait
    if (!allowed) {
      router.replace(redirectTo)
    }
  }, [ready, allowed, router, redirectTo])

  return { ready, allowed, myRole }
}

 */