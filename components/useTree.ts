
"use client"

import { useEffect, useState } from "react"

export function useTree() {
  const [tree, setTree] = useState<any>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  async function loadTree() {
    const res = await fetch("/api/tree")
    const data = await res.json()
    setTree(data)
  }

  useEffect(() => {
    loadTree()
  }, [])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return {
    tree,
    expanded,
    toggle,
    reloadTree: loadTree // ✅ KEY FIX
  }
}
