
"use client"
// context/PermissionsContext.tsx
//
// v2 — adds per-user overrides on top of the role matrix.
//   • can(role, action)   — UNCHANGED: role-only check, same as before.
//     Still useful for "what could role X do by default" checks.
//   • canSelf(action)     — NEW: the CURRENT user's effective permission —
//     their role's default, overridden by whatever was granted/revoked for
//     them specifically on the Accounts Management screen.
//   • Fetches /api/me (extended to include personal overrides) alongside the
//     existing matrix fetch, and subscribes to the same "user_permissions"
//     SSE channel the Accounts Management panel broadcasts on, filtered to
//     this user's own id, so a grant/revoke made elsewhere takes effect
//     live without a refresh.

import {
  createContext, useContext, useEffect,
  useState, useCallback, useRef,
} from "react"
import {
  GrantMatrix, AdminAction,
  DEFAULT_GRANT_MATRIX, canWithMatrix,
} from "@/lib/adminGrants"
import { effectiveCan } from "@/lib/effectivePermissions"
import type { PermissionOverride } from "@/lib/userPermissions"

interface PermissionsContextValue {
  matrix:        GrantMatrix
  can:           (role: string, action: AdminAction) => boolean
  canSelf:       (action: AdminAction) => boolean
  selfRole:      string | null
  selfOverrides: PermissionOverride | null
  reload:        () => Promise<void>
  loading:       boolean
}

const EMPTY_OVERRIDE: PermissionOverride = { granted: [], revoked: [] }

// ── CRITICAL: default loading MUST be false ───────────────────────────────────
// If loading defaults to true, any component that reads usePermissions() before
// the Provider mounts (e.g. during SSR) will be stuck spinning forever.
// DEFAULT_GRANT_MATRIX is a safe starting point — it gets replaced by DB values
// as soon as the first fetch completes. canSelf defaults to a safe deny (false)
// rather than falling back to DEFAULT_GRANT_MATRIX, since we don't know the
// current user's role until /api/permissions/me resolves.
const PermissionsContext = createContext<PermissionsContextValue>({
  matrix:        DEFAULT_GRANT_MATRIX,
  can:           (r, a) => DEFAULT_GRANT_MATRIX[r]?.includes(a) ?? false,
  canSelf:       () => false,
  selfRole:      null,
  selfOverrides: null,
  reload:        async () => {},
  loading:       false,   // ← FALSE, not true
})

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [matrix,        setMatrix]        = useState<GrantMatrix>(DEFAULT_GRANT_MATRIX)
  const [selfRole,      setSelfRole]      = useState<string | null>(null)
  const [selfOverrides, setSelfOverrides] = useState<PermissionOverride | null>(null)
  const [loading,       setLoading]       = useState(true)
  const esRef        = useRef<EventSource | null>(null)
  const selfEsRef     = useRef<EventSource | null>(null)
  const selfUserIdRef = useRef<string | null>(null)
  // Track whether we've already started a fetch so we don't double-fire,
  // but DO NOT use this to block re-runs after cleanup (Strict Mode).
  const loadingRef = useRef(false)

  const reload = useCallback(async () => {
    try {
      const [matrixRes, selfRes] = await Promise.all([
        fetch("/api/admin/permissions", { credentials: "include" }),
        fetch("/api/me", { credentials: "include" }),
      ])
      if (matrixRes.ok) {
        const data = await matrixRes.json()
        if (data?.matrix && typeof data.matrix === "object") {
          setMatrix(data.matrix)
        }
      }
      // Non-ok response (403, 500…): keep DEFAULT_GRANT_MATRIX, still resolve

      if (selfRes.ok) {
        const data = await selfRes.json()
        selfUserIdRef.current = data.id ?? null
        setSelfRole(data.role ?? null)
        setSelfOverrides(data.overrides?.admin ?? EMPTY_OVERRIDE)
      }
    } catch {
      // Network error: keep current matrix/overrides, still resolve
    } finally {
      setLoading(false)  // Always resolves — never stuck
      loadingRef.current = false
    }
  }, [])

  useEffect(() => {
    // Start the permissions fetch immediately
    if (!loadingRef.current) {
      loadingRef.current = true
      reload()
    }

    // SSE — push role-matrix updates to this client in real-time
    const es = new EventSource("/api/admin/permissions/events")
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const { event, matrix: m } = JSON.parse(e.data)
        if (event === "updated" && m && typeof m === "object") {
          setMatrix(m)
        }
      } catch { /* ignore malformed frames */ }
    }

    es.onerror = () => {
      // Reconnect after 5s on SSE error
      setTimeout(() => {
        if (!loadingRef.current) {
          loadingRef.current = true
          reload()
        }
      }, 5_000)
    }

    // SSE — push THIS user's personal override updates (Accounts Management)
    const selfEs = new EventSource("/api/admin/user-permissions/events")
    selfEsRef.current = selfEs

    selfEs.onmessage = (e) => {
      try {
        const { event, userId, overrides } = JSON.parse(e.data)
        if (event === "updated" && userId && overrides && userId === selfUserIdRef.current) {
          setSelfOverrides(overrides.admin ?? EMPTY_OVERRIDE)
        }
      } catch { /* ignore malformed frames */ }
    }

    return () => {
      es.close()
      esRef.current = null
      selfEs.close()
      selfEsRef.current = null
    }
  }, [reload])

  const can = useCallback(
    (role: string, action: AdminAction) => canWithMatrix(matrix, role, action),
    [matrix]
  )

  const canSelf = useCallback(
    (action: AdminAction) => {
      if (!selfRole) return false
      return effectiveCan(matrix, selfRole, action, selfOverrides)
    },
    [matrix, selfRole, selfOverrides]
  )

  return (
    <PermissionsContext.Provider value={{ matrix, can, canSelf, selfRole, selfOverrides, reload, loading }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionsContext)
}

