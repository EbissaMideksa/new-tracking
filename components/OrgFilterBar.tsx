// components/OrgFilterBar.tsx
// Cascading org filter for the Users page: Division → Department → Section →
// Zone/Region → Area → Site. Each level narrows the next, and ancestor
// selections are retained. Emits the set of selected level ids so the page can
// AND them together (not just the deepest), which prevents leaking across
// departments when a shared zone/area/site is selected.
"use client"

import { useEffect, useMemo, useRef, useState } from "react"

type OrgNodeLite = {
  id: string
  name: string
  type: string
  code?: string | null
  children?: OrgNodeLite[]
}

function findById(node: OrgNodeLite | null | undefined, id: string): OrgNodeLite | null {
  if (!node || !id) return null
  if (node.id === id) return node
  for (const c of node.children ?? []) {
    const hit = findById(c, id)
    if (hit) return hit
  }
  return null
}

function collect(node: OrgNodeLite | null | undefined, type: string): OrgNodeLite[] {
  if (!node) return []
  const out: OrgNodeLite[] = []
  const walk = (n: OrgNodeLite) => {
    if (n.type === type) out.push(n)
    for (const c of n.children ?? []) walk(c)
  }
  walk(node)
  return out
}

const selectCls =
  "px-2 py-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-700 max-w-[180px]"

export type OrgLevel = "DIVISION" | "DEPARTMENT" | "SECTION" | "ZONE" | "AREA" | "SITE"

export type OrgFilterIds = {
  DIVISION?: string
  DEPARTMENT?: string
  SECTION?: string
  ZONE?: string
  AREA?: string
  SITE?: string
}

export default function OrgFilterBar({
  tree,
  value,
  onChange,
  levels,
}: {
  tree: OrgNodeLite | null
  value: OrgFilterIds
  onChange: (ids: OrgFilterIds) => void
  /** Which levels to render. Ancestors are still applied when narrowing. */
  levels?: OrgLevel[]
}) {
  const show = (l: OrgLevel) => !levels || levels.includes(l)
  const [divId, setDivId] = useState("")
  const [deptId, setDeptId] = useState("")
  const [sectionId, setSectionId] = useState("")
  const [zoneId, setZoneId] = useState("")
  const [areaId, setAreaId] = useState("")
  const [siteId, setSiteId] = useState("")

  const divisions = useMemo(
    () => (tree?.children ?? []).filter((n) => n.type === "DIVISION"),
    [tree],
  )
  const departments = useMemo(
    () => (findById(tree, divId)?.children ?? []).filter((n) => n.type === "DEPARTMENT"),
    [tree, divId],
  )
  const sections = useMemo(() => {
    const dept = findById(tree, deptId)
    if (!dept) return []
    const direct = (dept.children ?? []).filter((n) => n.type === "SECTION")
    const underCorp = (dept.children ?? [])
      .filter((n) => n.type === "CORPORATE")
      .flatMap((c) => (c.children ?? []).filter((n) => n.type === "SECTION"))
    return [...direct, ...underCorp]
  }, [tree, deptId])

  // Zones/regions: scoped to the selected department (its Categories) so the
  // downstream Area/Site picks stay within that department. With no department
  // selected, fall back to the global list, deduped by name.
  const zones = useMemo(() => {
    const dept = findById(tree, deptId)
    if (dept) {
      return (dept.children ?? [])
        .filter((c) => c.type === "CATEGORY")
        .flatMap((c) => (c.children ?? []).filter((n) => n.type === "ZONE" || n.type === "REGION"))
    }
    const seen = new Set<string>()
    return collect(tree, "ZONE")
      .concat(collect(tree, "REGION"))
      .filter((z) => {
        const k = z.name.toLowerCase()
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
  }, [tree, deptId])

  const areas = useMemo(
    () => (findById(tree, zoneId)?.children ?? []).filter((n) => n.type === "AREA"),
    [tree, zoneId],
  )
  const sites = useMemo(
    () => (findById(tree, areaId)?.children ?? []).filter((n) => n.type === "SITE"),
    [tree, areaId],
  )

  // Reset descendants when an ancestor changes.
  useEffect(() => {
    setDeptId(""); setSectionId(""); setZoneId(""); setAreaId(""); setSiteId("")
  }, [divId])
  useEffect(() => {
    setSectionId(""); setZoneId(""); setAreaId(""); setSiteId("")
  }, [deptId])
  useEffect(() => { setAreaId(""); setSiteId("") }, [zoneId])
  useEffect(() => { setSiteId("") }, [areaId])

  // Emit the full set of selected levels (ANDed by the page), not just the
  // deepest, so a shared site narrowed by department doesn't leak.
  const buildIds = (): OrgFilterIds => {
    const ids: OrgFilterIds = {}
    if (show("DIVISION") && divId) ids.DIVISION = divId
    if (show("DEPARTMENT") && deptId) ids.DEPARTMENT = deptId
    if (show("SECTION") && sectionId) ids.SECTION = sectionId
    if (show("ZONE") && zoneId) ids.ZONE = zoneId
    if (show("AREA") && areaId) ids.AREA = areaId
    if (show("SITE") && siteId) ids.SITE = siteId
    return ids
  }
  const idsKey = JSON.stringify(buildIds())
  const lastKey = useRef("")
  useEffect(() => {
    if (idsKey === lastKey.current) return
    lastKey.current = idsKey
    onChange(JSON.parse(idsKey) as OrgFilterIds)
  }, [idsKey, onChange])

  const deepest =
    value.SITE || value.AREA || value.ZONE || value.SECTION || value.DEPARTMENT || value.DIVISION || ""

  const clear = () => {
    setDivId(""); setDeptId(""); setSectionId("")
    setZoneId(""); setAreaId(""); setSiteId("")
    onChange({})
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Org</span>

      {show("DIVISION") && (
        <select className={selectCls} value={divId} onChange={(e) => setDivId(e.target.value)} title="Division">
          <option value="">All divisions</option>
          {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}

      {show("DEPARTMENT") && (
        <select className={selectCls} value={deptId} onChange={(e) => setDeptId(e.target.value)} title="Department" disabled={!divId}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}

      {show("SECTION") && (
        <select className={selectCls} value={sectionId} onChange={(e) => setSectionId(e.target.value)} title="Section" disabled={!deptId}>
          <option value="">All sections</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}

      {show("ZONE") && (
        <select className={selectCls} value={zoneId} onChange={(e) => setZoneId(e.target.value)} title="Zone / Region">
          <option value="">All zones / regions</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.code ? `${z.code} — ${z.name}` : z.name}</option>)}
        </select>
      )}

      {show("AREA") && (
        <select className={selectCls} value={areaId} onChange={(e) => setAreaId(e.target.value)} title="Area" disabled={!zoneId}>
          <option value="">All areas</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}

      {show("SITE") && (
        <select className={selectCls} value={siteId} onChange={(e) => setSiteId(e.target.value)} title="Site" disabled={!areaId}>
          <option value="">All sites</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}

      {deepest ? (
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
          {findById(tree, deepest)?.name ?? "Filtered"}
        </span>
      ) : null}

      {deepest && (
        <button type="button" onClick={clear} className="text-[10px] font-semibold text-slate-500 hover:underline">
          Clear
        </button>
      )}
    </div>
  )
}