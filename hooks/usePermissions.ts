
// hooks/usePermissions.ts
"use client"
//
// Single-arg can(permission: AdminAction) — matches workOrderActions,
// usePermissionGuard, and the GrantMatrixTable.
//
// Uses the LIVE matrix from /api/admin/permissions (same data the grant matrix
// UI reads and writes), so any change made in the permission matrix propagates
// here in real time via SSE — no page refresh needed.

import { useEffect, useRef, useState } from "react"
import {
  DEFAULT_GRANT_MATRIX,
  type AdminAction,
  type GrantMatrix,
} from "@/lib/adminGrants"

export type Role = string   // kept loose — roles come from DB, not a fixed enum

interface UsePermissionsReturn {
  role:    Role
  /** can(permission) — single-arg, matches workOrderActions + usePermissionGuard */
  can:     (permission: AdminAction) => boolean
  loading: boolean
}

export function usePermissions(): UsePermissionsReturn {
  const [role,    setRole]    = useState<Role>("")
  const [matrix,  setMatrix]  = useState<GrantMatrix>(DEFAULT_GRANT_MATRIX)
  const [loading, setLoading] = useState(true)

  // Prevent double-fetch in React StrictMode
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    // Fetch role + live matrix in parallel
    Promise.all([
      fetch("/api/auth/session")
        .then(r => r.ok ? r.json() : null)
        .then(d => (d?.user?.role ?? d?.role ?? "") as string)
        .catch(() => ""),

      fetch("/api/admin/permissions", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(d => (d?.matrix ?? DEFAULT_GRANT_MATRIX) as GrantMatrix)
        .catch(() => DEFAULT_GRANT_MATRIX),
    ]).then(([fetchedRole, fetchedMatrix]) => {
      setRole(fetchedRole.toUpperCase())
      setMatrix(fetchedMatrix)
      setLoading(false)
    })
  }, [])

  // ── SSE — keep matrix in sync with GrantMatrixTable saves ─────────────────
  // Mirrors the pattern in GrantMatrixTable: listen on the same channel so
  // when SUPER_ADMIN hits "Save Permissions", this hook updates live.
  useEffect(() => {
    if (loading) return

    const es = new EventSource("/api/admin/permissions/events")

    es.onmessage = (e) => {
      try {
        const { event, matrix: m } = JSON.parse(e.data)
        if (event === "updated" && m) setMatrix(m)
      } catch { /* ignore malformed */ }
    }

    // Reconnect silently on error — SSE will retry automatically,
    // but close the old instance first to avoid duplicates
    es.onerror = () => es.close()

    return () => es.close()
  }, [loading])

  // ── Single-arg can — matches (permission: AdminAction) => boolean ──────────
  const can = (permission: AdminAction): boolean =>
    matrix[role]?.includes(permission) ?? false

  return { role, can, loading }
}
