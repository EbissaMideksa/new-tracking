
// context/WoPermissionsContext.tsx
// ──────────────────────────────────────────────────────────────────────────────
// v2 — adds per-user overrides on top of the WO role matrix, on the same
// safety posture as the rest of this file:
//   • canWo(role, action)  — UNCHANGED: role-only check, deny until loaded.
//   • canWoSelf(action)    — NEW: the CURRENT user's effective permission,
//     their role default overridden by whatever was granted/revoked for
//     them specifically on the Accounts Management screen. Also denies
//     until both the matrix and the self-fetch have resolved.
//   • Fetches /api/me (extended to include personal overrides) alongside the
//     existing matrix fetch, and subscribes to the "user_permissions" SSE
//     channel (same one the Accounts Management panel broadcasts on)
//     filtered to this user's own id, so a grant/revoke made elsewhere
//     takes effect live.
// ──────────────────────────────────────────────────────────────────────────────

"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import {
  canWoWithMatrix,
  DEFAULT_WO_GRANT_MATRIX,
  WoAction,
  WoGrantMatrix,
} from "@/lib/workOrderGrants"
import { effectiveCan } from "@/lib/effectivePermissions"
import type { PermissionOverride } from "@/lib/userPermissions"

// ── Context shape ─────────────────────────────────────────────────────────────

type WoPermissionsCtx = {
  matrix:        WoGrantMatrix | null   // null until first server response
  loaded:        boolean
  canWo:         (role: string, action: WoAction) => boolean
  canWoSelf:     (action: WoAction) => boolean
  selfRole:      string | null
  selfOverrides: PermissionOverride | null
  _mounted:      boolean                 // sentinel for the dev warning
}

const EMPTY_OVERRIDE: PermissionOverride = { granted: [], revoked: [] }

const WoPermissionsContext = createContext<WoPermissionsCtx>({
  matrix:        null,
  loaded:        false,
  canWo:         () => false,           // SAFE default — deny everything until loaded
  canWoSelf:     () => false,
  selfRole:      null,
  selfOverrides: null,
  _mounted:      false,
})

// ── Provider ──────────────────────────────────────────────────────────────────

export function WoPermissionsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [matrix, setMatrix]               = useState<WoGrantMatrix | null>(null)
  const [loaded, setLoaded]               = useState(false)
  const [selfRole, setSelfRole]           = useState<string | null>(null)
  const [selfOverrides, setSelfOverrides] = useState<PermissionOverride | null>(null)
  const retryRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const esRef          = useRef<EventSource | null>(null)
  const selfEsRef       = useRef<EventSource | null>(null)
  const closedRef       = useRef(false)
  const selfUserIdRef   = useRef<string | null>(null)

  // ── Initial fetch — role matrix + this user's own overrides ────────────────
  const loadMatrix = useCallback(async () => {
    try {
      const [matRes, selfRes] = await Promise.all([
        fetch("/api/admin/wo-permissions", {
          credentials: "include",
          cache: "no-store",        // always fresh — never use a stale cached matrix
        }),
        fetch("/api/me", { credentials: "include", cache: "no-store" }),
      ])

      if (!matRes.ok) {
        console.warn("[WoPermissions] API returned", matRes.status, "— using defaults")
        setMatrix(DEFAULT_WO_GRANT_MATRIX)
      } else {
        const data = await matRes.json()
        setMatrix(data.matrix ?? DEFAULT_WO_GRANT_MATRIX)
      }

      if (selfRes.ok) {
        const data = await selfRes.json()
        selfUserIdRef.current = data.id ?? null
        setSelfRole(data.role ?? null)
        setSelfOverrides(data.overrides?.wo ?? EMPTY_OVERRIDE)
      }
    } catch (err) {
      console.warn("[WoPermissions] fetch failed — using defaults:", err)
      setMatrix(DEFAULT_WO_GRANT_MATRIX)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    closedRef.current = false
    loadMatrix()
    return () => { closedRef.current = true }
  }, [loadMatrix])

  // ── SSE — live push when a SUPER_ADMIN saves the role matrix, or when
  //         THIS user's personal WO overrides change ────────────────────────
  useEffect(() => {
    if (!loaded) return

    let delay = 2_000

    function connect() {
      if (closedRef.current) return
      const es = new EventSource("/api/admin/wo-permissions/events")
      esRef.current = es

      es.onmessage = (e) => {
        try {
          const { event, matrix: m } = JSON.parse(e.data)
          if (event === "updated" && m) {
            setMatrix(m)
          }
        } catch { /* ignore malformed frames */ }
      }

      es.onerror = () => {
        es.close()
        if (!closedRef.current) {
          retryRef.current = setTimeout(() => {
            delay = Math.min(delay * 1.5, 30_000)
            connect()
          }, delay)
        }
      }
    }

    connect()

    const selfEs = new EventSource("/api/admin/user-permissions/events")
    selfEsRef.current = selfEs
    selfEs.onmessage = (e) => {
      try {
        const { event, userId, overrides } = JSON.parse(e.data)
        if (event === "updated" && userId && overrides && userId === selfUserIdRef.current) {
          setSelfOverrides(overrides.wo ?? EMPTY_OVERRIDE)
        }
      } catch { /* ignore malformed frames */ }
    }

    return () => {
      closedRef.current = true
      if (retryRef.current) clearTimeout(retryRef.current)
      esRef.current?.close()
      esRef.current = null
      selfEs.close()
      selfEsRef.current = null
    }
  }, [loaded])

  const canWo = useCallback(
    (role: string, action: WoAction): boolean => {
      if (!matrix || !role) return false
      return canWoWithMatrix(matrix, role, action)
    },
    [matrix],
  )

  const canWoSelf = useCallback(
    (action: WoAction): boolean => {
      if (!matrix || !selfRole) return false
      return effectiveCan(matrix, selfRole, action, selfOverrides)
    },
    [matrix, selfRole, selfOverrides],
  )

  return (
    <WoPermissionsContext.Provider
      value={{ matrix, loaded, canWo, canWoSelf, selfRole, selfOverrides, _mounted: true }}
    >
      {children}
    </WoPermissionsContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWoPermissions(): WoPermissionsCtx {
  const ctx = useContext(WoPermissionsContext)

  if (process.env.NODE_ENV === "development" && !ctx._mounted) {
    console.error(
      "[useWoPermissions] WoPermissionsProvider is NOT in the component tree.\n" +
      "Add <WoPermissionsProvider> to your dashboard layout (e.g. app/dashboard/layout.tsx).\n" +
      "Until then canWo()/canWoSelf() always return FALSE and all action buttons will be hidden."
    )
  }

  return ctx
}

