
// app/dashboard/(workorders)/workorders/_components/modals/CreateModal.tsx
"use client"

import { useEffect, useState } from "react"
import OrgTree from "../OrgTree"
import { Priority, findOrgName } from "../types"
import { DEFAULT_WO_TEMPLATES, WOTemplate } from "@/lib/woTemplates"

type Props = {
  tree:     any
  onClose:  () => void
  onCreate: (data: any) => Promise<void>
}

const INP: React.CSSProperties = {
  width: "100%", padding: "5px 8px", fontSize: 11,
  border: "1px solid #d1d5db", borderRadius: 3,
  outline: "none", boxSizing: "border-box", background: "#fff",
}
const LBL: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 3,
}

export default function CreateModal({ tree, onClose, onCreate }: Props) {
  const [form, setForm] = useState({
    title:       "",
    description: "",
    orgUnitId:   "",
    orgName:     "",
    priority:    "MEDIUM" as Priority,
    scheduledAt: "",
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState("")

  function applyTemplate(tplId: string) {
    setSelectedTemplate(tplId)
    if (!tplId) return
    const tpl = DEFAULT_WO_TEMPLATES.find(t => t.id === tplId)
    if (!tpl) return
    setForm(f => ({ ...f, title: tpl.title, description: tpl.description, priority: tpl.priority }))
  }

  // ── Asset picker — retrieves existing assets from the DB ──────────────────
  const [assetQuery,    setAssetQuery]    = useState("")
  const [assetResults,  setAssetResults]  = useState<any[]>([])
  const [assetLoading,  setAssetLoading]  = useState(false)
  const [assetOpen,     setAssetOpen]     = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null)

  useEffect(() => {
    if (selectedAsset) return
    const q = assetQuery.trim()
    if (!q) { setAssetResults([]); setAssetOpen(false); return }
    const t = setTimeout(async () => {
      setAssetLoading(true)
      try {
        const res = await fetch(`/api/assets/search?q=${encodeURIComponent(q)}`, { credentials: "include" })
        const list: any[] = res.ok ? await res.json() : []
        setAssetResults(list)
        // Auto-select on an exact tag / serial match
        const exact = list.find(a =>
          (a.tagNumber && a.tagNumber.toLowerCase() === q.toLowerCase()) ||
          (a.serialNumber && a.serialNumber.toLowerCase() === q.toLowerCase()))
        if (exact) selectAsset(exact)
        else setAssetOpen(true)
      } catch {
        setAssetResults([])
        setAssetOpen(true)
      } finally {
        setAssetLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [assetQuery, selectedAsset])

  function selectAsset(a: any) {
    setSelectedAsset(a)
    setAssetQuery("")
    setAssetResults([])
    setAssetOpen(false)
    // Auto-fill the title with the asset's key identifiers
    const summary = [a.tagNumber, a.owningDepartment, a.politicalArea, a.category]
      .filter(Boolean).join(" | ")
    if (summary) set("title", summary)
    // Auto-fill the org unit from the asset (the WO defaults to the asset's unit)
    if (a.orgUnitId) {
      set("orgUnitId", a.orgUnitId)
      set("orgName", findOrgName(tree, a.orgUnitId))
    }
  }
  function clearAsset() {
    setSelectedAsset(null)
    setAssetQuery("")
    setAssetResults([])
    setAssetOpen(false)
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function submit() {
    if (!form.title.trim()) { setError("Title is required"); return }
    if (!form.orgUnitId)    { setError("Select an org unit"); return }
    if (!selectedAsset)     { setError("Select an asset"); return }
    setError(null)
    setSaving(true)
    try {
      await onCreate({
        title:       form.title.trim(),
        description: form.description.trim() || undefined,
        orgUnitId:   form.orgUnitId,
        priority:    form.priority,
        scheduledAt: form.scheduledAt || undefined,
        assetId:     selectedAsset?.id || undefined,
      })
    } catch (e: any) {
      setError(e.message || "Failed to create")
    } finally {
      setSaving(false)
    }
  }

  const disabled = saving || !form.title.trim() || !form.orgUnitId || !selectedAsset

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 4, width: 480, maxHeight: "85vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,.25)" }}
      >
        {/* Header */}
        <div style={{ background: "linear-gradient(90deg,#1d4ed8,#2563eb)", color: "#fff", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>New Work Order</span>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 2, color: "#fff", cursor: "pointer", fontSize: 18, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "14px 16px" }}>
          {error && (
            <div style={{ marginBottom: 10, padding: "7px 10px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 3, fontSize: 11, color: "#dc2626" }}>
              ⚠ {error}
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <label style={LBL}>Quick Template</label>
            <select
              style={INP}
              value={selectedTemplate}
              onChange={e => applyTemplate(e.target.value)}
            >
              <option value="">— Select a template (optional) —</option>
              {DEFAULT_WO_TEMPLATES.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={LBL}>Title *</label>
            <input style={INP} value={form.title} onChange={e => set("title", e.target.value)} placeholder="Enter subject / title" />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={LBL}>Description</label>
            <textarea
              style={{ ...INP, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="Optional details"
            />
          </div>

          {/* Asset — retrieved from the assets table in the DB */}
          <div style={{ marginBottom: 10 }}>
            <label style={LBL}>Asset *</label>
            {selectedAsset ? (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 8px", border:"1px solid #d1d5db", borderRadius:3, background:"#f9fafb" }}>
                <div style={{ display:"flex", flexDirection:"column", minWidth:0, flex:1 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"#111827", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    {selectedAsset.tagNumber || selectedAsset.itemCode || "Asset"}
                    {selectedAsset.serialNumber && <span style={{ color:"#9ca3af", fontWeight:400 }}> · {selectedAsset.serialNumber}</span>}
                  </span>
                  <span style={{ fontSize:10, color:"#6b7280", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    {selectedAsset.assetDescription || selectedAsset.itemCodeDescription || ""}
                  </span>
                </div>
                <button
                  onClick={clearAsset}
                  title="Remove asset"
                  style={{ flexShrink:0, marginLeft:8, background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#6b7280", padding:"0 4px" }}
                >
                  ×
                </button>
              </div>
            ) : (
              <div style={{ position:"relative" }}>
                <input
                  style={INP}
                  value={assetQuery}
                  onChange={e => setAssetQuery(e.target.value)}
                  onFocus={() => assetResults.length && setAssetOpen(true)}
                  onBlur={() => setTimeout(() => setAssetOpen(false), 150)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && assetResults.length > 0) {
                      e.preventDefault()
                      selectAsset(assetResults[0])
                    }
                  }}
                  placeholder="Search by tag / serial / item code, then click a result or press Enter…"
                />
                {assetOpen && (
                  <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"#fff", border:"1px solid #d1d5db", borderTop:"none", maxHeight:200, overflowY:"auto", zIndex:10, boxShadow:"0 4px 8px rgba(0,0,0,.12)" }}>
                    {assetLoading && <div style={{ padding:8, fontSize:11, color:"#9ca3af" }}>Searching…</div>}
                    {!assetLoading && assetResults.length === 0 && assetQuery.trim() && (
                      <div style={{ padding:8, fontSize:11, color:"#9ca3af" }}>No assets found</div>
                    )}
                    {assetResults.map(a => (
                      <button
                        key={a.id}
                        onClick={() => selectAsset(a)}
                        style={{ display:"block", width:"100%", textAlign:"left", padding:"6px 8px", border:"none", background:"transparent", cursor:"pointer", fontSize:11 }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#f3f4f6" }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
                      >
                        <div style={{ fontWeight:600, color:"#111827" }}>
                          {a.tagNumber || a.itemCode || "—"}
                          {a.serialNumber && <span style={{ color:"#9ca3af", fontWeight:400 }}> · {a.serialNumber}</span>}
                        </div>
                        <div style={{ fontSize:10, color:"#6b7280", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                          {a.assetDescription || a.itemCodeDescription || ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={LBL}>Priority</label>
              <select style={INP} value={form.priority} onChange={e => set("priority", e.target.value as Priority)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={LBL}>Scheduled At</label>
              <input type="datetime-local" style={INP} value={form.scheduledAt} onChange={e => set("scheduledAt", e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={LBL}>
              Org Unit *
              {form.orgName && <span style={{ color: "#2d7d32", fontWeight: 400, marginLeft: 6 }}>— {form.orgName}</span>}
            </label>
            <div style={{ border: "1px solid #d1d5db", borderRadius: 3, maxHeight: 200, overflowY: "auto", background: "#fafafa", padding: "3px 2px" }}>
              {tree && (
                <OrgTree
                  node={tree}
                  selected={form.orgUnitId}
                  onSelect={id => { set("orgUnitId", id); set("orgName", findOrgName(tree, id)) }}
                />
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 12, borderTop: "1px solid #e5e7eb", justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{ padding: "7px 14px", fontSize: 11, fontWeight: 600, background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 3, cursor: saving ? "not-allowed" : "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={disabled}
              style={{ padding: "7px 18px", fontSize: 11, fontWeight: 600, background: disabled ? "#93c5fd" : "#1d4ed8", color: "#fff", border: "none", borderRadius: 3, cursor: disabled ? "not-allowed" : "pointer" }}
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
