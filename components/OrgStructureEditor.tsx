
// components/OrgStructureEditor.tsx
//
// Admin editor for the organizational hierarchy behind
// /dashboard/admin/org-structure.
//
// Reads /api/tree (already rooted at the caller's own scope) and writes
// through POST /api/org, PATCH /api/org/[id] and DELETE /api/org/[id]. The
// server is the authority on what may nest inside what — this component only
// ever offers the types the server would accept, so a tab left open across a
// deploy cannot build a shape the rest of the app cannot read.
"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ChevronDown, ChevronRight, Folder, FolderPlus, Pencil, Trash2, RefreshCw, X, Check,
  CornerDownRight, Users,
} from "lucide-react"
import { useToast } from "@/components/ToastProvider"
import { useConfirm } from "@/components/ConfirmProvider"
import { typeColor, typeLabel, ORG_TYPES, allowedChildTypes } from "@/lib/orgStructure"

type OrgNode = {
  id: string
  name: string
  type: string
  code?: string | null
  parentId?: string | null
  path?: string
  children?: OrgNode[]
}

export default function OrgStructureEditor() {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [tree, setTree] = useState<OrgNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)

  // Inline editor currently open: only one at a time, so a click outside a form
  // simply means "the other one won".
  const [pendingAdd, setPendingAdd] = useState<{ parentId: string; parentName: string; parentType: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [allNodes, setAllNodes] = useState<OrgNode[]>([])
  // Direct user counts per unit (operational + functional placements).
  const [counts, setCounts] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/tree", { cache: "no-store" })
      if (!res.ok) throw new Error("Failed to load the tree")
      const data: OrgNode = await res.json()
      setTree(data)
      // Keep the current expansion across reloads. Creating / renaming / moving
      // a unit must NOT collapse the tree or jump the user back to the top —
      // the tree only starts collapsed on the very first load (expanded is
      // initialised empty) and thereafter reflects what the user opened.
      // Use the toolbar's "Collapse all" to reset it deliberately.
    } catch (e: any) {
      showToast(e?.message ?? "Failed to load the tree", "error")
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const loadFlat = useCallback(async () => {
    try {
      const res = await fetch("/api/org", { cache: "no-store" })
      if (res.ok) setAllNodes(await res.json())
    } catch { /* the move picker simply stays empty */ }
  }, [])

  useEffect(() => { load() }, [load])

  // The "Add division" form in the page header creates through POST /api/org;
  // it announces the change with this event so the editor reloads without a
  // full page refresh (the form is a sibling, not a parent — no shared state).
  useEffect(() => {
    const onChanged = () => { load() }
    window.addEventListener("org:tree-changed", onChanged)
    return () => window.removeEventListener("org:tree-changed", onChanged)
  }, [load])

  // Users per unit: the direct (operational) counts plus the functional
  // placements of field workers under their department's Zones/Regions folders.
  useEffect(() => {
    fetch("/api/org/metrics?metric=users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.counts) return
        const merged: Record<string, number> = { ...d.counts }
        for (const [id, n] of Object.entries(d.functionalCounts ?? {})) {
          merged[id] = (merged[id] ?? 0) + (n as number)
        }
        setCounts(merged)
      })
      .catch(() => {})
  }, [tree])

  // Roll the direct counts up the tree so a parent shows its whole subtree.
  const totals = useMemo(() => {
    const out: Record<string, number> = {}
    const walk = (n: OrgNode): number => {
      const t = (counts[n.id] ?? 0) + (n.children ?? []).reduce((s, c) => s + walk(c), 0)
      out[n.id] = t
      return t
    }
    if (tree) walk(tree)
    return out
  }, [tree, counts])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const expandAll = () => {
    if (!tree) return
    const next = new Set<string>()
    const walk = (n: OrgNode | undefined) => {
      if (!n) return
      next.add(n.id)
      ;(n.children ?? []).forEach((c) => walk(c))
    }
    walk(tree)
    setExpanded(next)
  }

  /** Run a mutation, surface its error, and reload on success. */
  const run = async (key: string, fetcher: () => Promise<Response>, ok: string) => {
    setBusy(key)
    try {
      const res = await fetcher()
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data.error ?? `Request failed (${res.status})`, "error")
        return false
      }
      showToast(ok, "success")
      await load()
      return true
    } catch {
      showToast("Network error — nothing was changed", "error")
      return false
    } finally {
      setBusy(null)
    }
  }

  const create = (parentId: string, type: string, name: string, placement?: string | null) =>
    run(
      `add:${parentId}`,
      () =>
        fetch("/api/org", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parentId,
            type,
            name,
            // Placement is a department attribute; omit it elsewhere so the
            // server never sees a stray value (it 400s those).
            ...(type === "DEPARTMENT" && placement ? { placement } : {}),
          }),
        }),
      `Created ${name}`,
    )

  const rename = (id: string, name: string) =>
    run(
      `edit:${id}`,
      () =>
        fetch(`/api/org/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }),
      `Renamed to ${name}`,
    )

  const move = (id: string, parentId: string) =>
    run(
      `move:${id}`,
      () =>
        fetch(`/api/org/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId }),
        }),
      "Unit moved",
    )

  const remove = async (node: OrgNode) => {
    if (!(await confirm({
      message: `Delete "${node.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
    }))) return
    await run(
      `del:${node.id}`,
      () => fetch(`/api/org/${node.id}`, { method: "DELETE" }),
      `Deleted ${node.name}`,
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading && !tree) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        Loading structure…
      </div>
    )
  }
  if (!tree) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        No structure found in your scope.
      </div>
    )
  }

  return (
    <div className="border rounded" style={{ borderColor: "#e2e8f0", background: "#fff" }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "10px 14px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
          {ORG_TYPES.length} tiers · use a row&apos;s buttons to add, rename, move or delete
        </span>
        <button
          type="button"
          onClick={load}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
            padding: "5px 10px", borderRadius: 6, border: "1px solid #cbd5e1",
            background: "#fff", color: "#475569", cursor: "pointer",
          }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <button
          type="button"
          onClick={() => setExpanded(new Set())}
          disabled={loading || !tree}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
            padding: "5px 10px", borderRadius: 6, border: "1px solid #cbd5e1",
            background: "#fff", color: "#475569", cursor: "pointer",
          }}
        >
          <X size={12} /> Collapse all
        </button>
        <button
          type="button"
          onClick={expandAll}
          disabled={loading || !tree}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
            padding: "5px 10px", borderRadius: 6, border: "1px solid #cbd5e1",
            background: "#fff", color: "#475569", cursor: "pointer",
          }}
        >
          <ChevronRight size={12} /> Expand all
        </button>
      </div>

      <div style={{ padding: "8px 6px", maxHeight: "68vh", overflow: "auto" }}>
        <Row
          node={tree}
          level={0}
          expanded={expanded}
          onToggle={toggle}
          busy={busy}
          pendingAdd={pendingAdd}
          setPendingAdd={setPendingAdd}
          renamingId={renamingId}
          setRenamingId={setRenamingId}
          movingId={movingId}
          setMovingId={setMovingId}
          allNodes={allNodes}
          loadFlat={loadFlat}
          onCreate={create}
          onRename={rename}
          onMove={move}
          onDelete={remove}
          totals={totals}
        />
      </div>
    </div>
  )
}

/* ── One row, plus the inline editors it opens ────────────────────────────── */
function Row({
  node, level, expanded, onToggle, busy,
  pendingAdd, setPendingAdd, renamingId, setRenamingId, movingId, setMovingId,
  allNodes, loadFlat, onCreate, onRename, onMove, onDelete, totals,
}: any) {
  const [addName, setAddName] = useState("")
  const [addType, setAddType] = useState("")
  const [addPlacement, setAddPlacement] = useState("SPREADABLE")
  const [renameValue, setRenameValue] = useState<string>(node.name)
  const [moveTarget, setMoveTarget] = useState("")

  // Users under this unit (operational + functional), loaded on first open.
  const [showUsers, setShowUsers] = useState(false)
  const [people, setPeople] = useState<any[] | null>(null)
  const total: number = totals?.[node.id] ?? 0

  const toggleUsers = async () => {
    const next = !showUsers
    setShowUsers(next)
    if (next && people === null) {
      try {
        const r = await fetch(`/api/org/unit-users?orgUnitId=${node.id}`, { cache: "no-store" })
        setPeople(r.ok ? await r.json() : [])
      } catch {
        setPeople([])
      }
    }
  }

  const kids = node.children ?? []
  const isOpen: boolean = expanded.has(node.id)
  const color: string = typeColor(node.type)
  const childTypes: string[] = allowedChildTypes(node.type)
    // Placement rule: a CORPORATE_ONLY department never grows the field arm,
    // so the Categories folder ("Zones" / "Regions") is not offered under it.
    // The server enforces this too — this only keeps the UI honest.
    .filter((t) => !(node.type === "DEPARTMENT" && t === "CATEGORY" && node.placement === "CORPORATE_ONLY"))

  const isAdding = pendingAdd?.parentId === node.id
  const isRenaming = renamingId === node.id
  const isMoving = movingId === node.id
  const isBusy =
    busy === `add:${node.id}` || busy === `edit:${node.id}` ||
    busy === `move:${node.id}` || busy === `del:${node.id}`

  // Parents this unit may be moved under — filtered against the flat in-scope
  // list so the picker can never offer a parent the server would reject, nor a
  // descendant of itself (which would make the tree cyclic).
  const moveTargets: any[] = useMemo(() => {
    if (!Array.isArray(allNodes)) return []
    const prefix = node.path ? `${node.path}/` : ""
    return allNodes.filter((n: any) =>
      n.id !== node.id &&
      allowedChildTypes(n.type).includes(node.type) &&
      !(node.path && (n.path === node.path || String(n.path).startsWith(prefix))),
    )
  }, [allNodes, node])

  const beginAdd = () => {
    setAddName("")
    setAddType(childTypes[0] ?? "")
    setAddPlacement("SPREADABLE")
    setRenamingId(null)
    setMovingId(null)
    setPendingAdd(
      isAdding ? null : { parentId: node.id, parentName: node.name, parentType: node.type },
    )
  }

  const beginRename = () => {
    setRenameValue(node.name)
    setPendingAdd(null)
    setMovingId(null)
    setRenamingId(isRenaming ? null : node.id)
  }

  const beginMove = async () => {
    setPendingAdd(null)
    setRenamingId(null)
    if (!isMoving) {
      setMoveTarget("")
      await loadFlat()
    }
    setMovingId(isMoving ? null : node.id)
  }

  const submitAdd = () => {
    if (!addName.trim() || !addType) return
    onCreate(node.id, addType, addName.trim(), addType === "DEPARTMENT" ? addPlacement : null).then((ok: boolean) => {
      if (ok) {
        setPendingAdd(null)
        setAddName("")
      }
    })
  }

  const iconBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 24, height: 24, borderRadius: 5, border: "1px solid #e2e8f0",
    background: "#fff", color: "#64748b", cursor: "pointer", flexShrink: 0,
  }
  const inputStyle: React.CSSProperties = {
    fontSize: 12, padding: "5px 8px", borderRadius: 5,
    border: "1px solid #cbd5e1", outline: "none", color: "#0f172a",
  }
  const primaryBtn: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 5,
    border: "none", background: "#2563eb", color: "#fff", cursor: "pointer",
  }
  const ghostBtn: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 5,
    border: "1px solid #cbd5e1", background: "#fff", color: "#475569", cursor: "pointer",
  }

  return (
    <div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "5px 8px", borderRadius: 6, paddingLeft: 8 + level * 16,
          background: isBusy ? "#f8fafc" : "transparent",
          opacity: isBusy ? 0.6 : 1,
        }}
      >
        {kids.length > 0 ? (
          <>
            {node.type === "CATEGORY" ? <Folder size={12} /> : null}
            <button
              type="button"
              onClick={() => onToggle(node.id)}
              style={{ ...iconBtn, border: "none" }}
              aria-label={isOpen ? "Collapse" : "Expand"}
            >
              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          </>
        ) : (
          <span style={{ width: 24, flexShrink: 0 }} />
        )}

        <span
          style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 0.4, color,
            background: `${color}1a`, padding: "1px 6px", borderRadius: 3, flexShrink: 0,
          }}
        >
          {typeLabel(node.type)}
        </span>

        {isRenaming ? (
          <>
            <input
              autoFocus
              style={inputStyle}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setRenamingId(null) }}
            />
            <button
              type="button"
              style={primaryBtn}
              title="Save name"
              onClick={() => {
                const v = renameValue.trim()
                if (!v) return
                onRename(node.id, v).then((ok: boolean) => { if (ok) setRenamingId(null) })
              }}
            >
              <Check size={12} />
            </button>
            <button type="button" style={iconBtn} title="Cancel" onClick={() => setRenamingId(null)}>
              <X size={12} />
            </button>
          </>
        ) : (
          <>
            <span style={{ flex: 1, fontSize: 13, color: "#1e293b", fontWeight: 500, minWidth: 0 }}>
              {node.name}
            </span>
            {node.code ? (
              <span style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>{node.code}</span>
            ) : null}
            {node.type === "DEPARTMENT" && node.placement ? (
              <span
                style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 0.3, flexShrink: 0,
                  padding: "1px 6px", borderRadius: 3,
                  color: node.placement === "CORPORATE_ONLY" ? "#475569" : "#0f766e",
                  background: node.placement === "CORPORATE_ONLY" ? "#f1f5f9" : "#ccfbf1",
                }}
                title={
                  node.placement === "CORPORATE_ONLY"
                    ? "Corporate-only: stays at the head office, no Zones/Regions folders."
                    : "Spreadable: may branch into Zones/Regions folders and local units."
                }
              >
                {node.placement === "CORPORATE_ONLY" ? "CORP ONLY" : "SPREADABLE"}
              </span>
            ) : null}

            {total > 0 && node.type !== "COUNTRY" ? (
              <button
                type="button"
                style={{
                  ...iconBtn, width: "auto", padding: "0 7px", gap: 4,
                  fontSize: 11, fontWeight: 600,
                  background: showUsers ? "#eff6ff" : "#fff",
                }}
                title="Show the users under this unit"
                onClick={toggleUsers}
              >
                <Users size={12} /> {total}
              </button>
            ) : null}

            {childTypes.length > 0 ? (
              <button type="button" style={iconBtn} title={`Add under ${node.name}`} onClick={beginAdd}>
                <FolderPlus size={13} />
              </button>
            ) : null}
            <button type="button" style={iconBtn} title="Rename" onClick={beginRename}>
              <Pencil size={12} />
            </button>
            <button type="button" style={iconBtn} title="Move to another parent" onClick={beginMove}>
              <CornerDownRight size={13} />
            </button>
            {node.type !== "COUNTRY" ? (
              <button
                type="button"
                style={{ ...iconBtn, color: "#dc2626" }}
                title={`Delete ${node.name}`}
                onClick={() => onDelete(node)}
              >
                <Trash2 size={12} />
              </button>
            ) : null}
          </>
        )}
      </div>

      {isAdding ? (
        <div
          style={{
            margin: "4px 0 6px", marginLeft: 8 + (level + 1) * 16, padding: 10,
            background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6,
            display: "flex", flexDirection: "column", gap: 8, maxWidth: 520,
          }}
        >
          <div style={{ fontSize: 11, color: "#64748b" }}>
            New unit under <b>{pendingAdd?.parentName}</b> ({pendingAdd?.parentType})
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              style={{ ...inputStyle, minWidth: 150 }}
              value={addType}
              onChange={(e) => setAddType(e.target.value)}
            >
              {childTypes.map((t: string) => (
                <option key={t} value={t}>{typeLabel(t)}</option>
              ))}
            </select>
            <input
              autoFocus
              style={{ ...inputStyle, flex: 1, minWidth: 160 }}
              placeholder="Name — e.g. EAAZ or Zones"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitAdd() }}
            />
          </div>
          {addType === "DEPARTMENT" ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                style={{ ...inputStyle, minWidth: 150 }}
                value={addPlacement}
                onChange={(e) => setAddPlacement(e.target.value)}
                aria-label="Department placement"
              >
                <option value="SPREADABLE">Spreadable — head office + field</option>
                <option value="CORPORATE_ONLY">Corporate-only — head office</option>
              </select>
              <span style={{ fontSize: 11, color: "#64748b" }}>
                Spreadable departments may branch into Zones / Regions folders; corporate-only ones stay at the head office.
              </span>
            </div>
          ) : null}
          {addType === "ZONE" || addType === "REGION" ? (
            <div style={{ fontSize: 11, color: "#64748b" }}>
              The code defaults to the name (e.g. <b>EAAZ</b>) — that is the key reports use for
              Area (Political Admin), so keep it short and stable.
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={primaryBtn}
              onClick={submitAdd}
              disabled={!addName.trim() || busy === `add:${node.id}`}
            >
              {busy === `add:${node.id}` ? "Creating…" : "Create"}
            </button>
            <button type="button" style={ghostBtn} onClick={() => setPendingAdd(null)}>Cancel</button>
          </div>
        </div>
      ) : null}

      {isMoving ? (
        <div
          style={{
            margin: "4px 0 6px", marginLeft: 8 + (level + 1) * 16, padding: 10,
            background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6,
            display: "flex", flexDirection: "column", gap: 8, maxWidth: 520,
          }}
        >
          <div style={{ fontSize: 11, color: "#64748b" }}>
            Move <b>{node.name}</b> ({node.type}) under…
          </div>
          <select
            style={{ ...inputStyle, width: "100%" }}
            value={moveTarget}
            onChange={(e) => setMoveTarget(e.target.value)}
          >
            <option value="">— choose a new parent —</option>
            {moveTargets.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            Moving re-roots the whole subtree — this unit and everything below it get new paths.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={primaryBtn}
              disabled={!moveTarget || isBusy}
              onClick={() => {
                onMove(node.id, moveTarget).then((ok: boolean) => { if (ok) setMovingId(null) })
              }}
            >
              {isBusy ? "Moving…" : "Move"}
            </button>
            <button type="button" style={ghostBtn} onClick={() => setMovingId(null)}>Cancel</button>
          </div>
        </div>
      ) : null}

      {showUsers ? (
        <div
          style={{
            margin: "2px 0 6px", marginLeft: 8 + (level + 1) * 16, padding: 8, maxWidth: 560,
            background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6,
            maxHeight: 240, overflow: "auto",
          }}
        >
          {people === null && <div style={{ fontSize: 12, color: "#94a3b8" }}>Loading…</div>}
          {people?.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>No users here.</div>}
          {people?.map((p: any) => (
            <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, padding: "2px 0" }}>
              <span style={{ flex: 1, fontWeight: 500, color: "#1e293b" }}>{p.name}</span>
              <span style={{ color: "#64748b" }}>{p.unit}</span>
              <span
                style={{
                  fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                  background: "#f1f5f9", color: "#475569",
                }}
              >
                {p.role}
              </span>
              <span
                style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                  background: p.via === "functional" ? "#ccfbf1" : "#e0e7ff",
                  color: p.via === "functional" ? "#0f766e" : "#3730a3",
                }}
              >
                {p.via === "functional" ? "FUNCTIONAL" : "OPERATIONAL"}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {isOpen ? kids.map((c: any) => (
        <Row
          key={c.id}
          node={c}
          level={level + 1}
          expanded={expanded}
          onToggle={onToggle}
          busy={busy}
          pendingAdd={pendingAdd}
          setPendingAdd={setPendingAdd}
          renamingId={renamingId}
          setRenamingId={setRenamingId}
          movingId={movingId}
          setMovingId={setMovingId}
          allNodes={allNodes}
          loadFlat={loadFlat}
          onCreate={onCreate}
          onRename={onRename}
          onMove={onMove}
          onDelete={onDelete}
          totals={totals}
        />
      )) : null}
    </div>
  )
}
