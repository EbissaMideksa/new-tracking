"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export function useTree() {
  const [tree, setTree] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const aliveRef = useRef(true)

  const loadTree = useCallback(async () => {
    setError(null)
    const ctrl = new AbortController()
    // Increased timeout from 12s to 30s to accommodate larger org datasets
    // and slower database connections (e.g., Docker Compose deployments)
    const timer = setTimeout(() => ctrl.abort(), 30_000)
    try {
      const res = await fetch("/api/tree", { credentials: "include", signal: ctrl.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (aliveRef.current) setTree(data)
    } catch (e: any) {
      if (!aliveRef.current) return
      setError(e?.name === "AbortError" ? "Request timed out" : String(e?.message || e))
    } finally {
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    aliveRef.current = true
    loadTree()
    return () => {
      aliveRef.current = false
    }
  }, [loadTree])

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return {
    tree,
    error,
    expanded,
    toggle,
    reloadTree: loadTree,
  }
}