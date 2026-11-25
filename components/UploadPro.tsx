
"use client"
// components/UploadPro.tsx
//
// Two asset-entry modes:
//   • "Excel Upload"      — upload an .xlsx/.xls file (duplicates reported, not silently skipped)
//   • "Scanner / Manual"  — scan each serial number with a barcode scanner, then fill the
//                           remaining fields manually. Duplicate serials (in-batch or already
//                           in the DB) are rejected and reported.

import { useState, useEffect, useRef } from "react"
import { useTree } from "@/components/useTree"
import { usePermissions } from "@/context/PermissionsContext"
import { useAlert } from "@/components/AlertProvider"
import { targetTypesFor } from "@/lib/orgStructure"
import AssetScanner from "./AssetScanner"

interface UploadProProps {
  orgUnitId: string
  role: string
  onSuccess?: () => void
}

type ScanRow = {
  id: string
  serialNumber: string
  itemCode: string
  tagNumber: string
  itemCodeDescription: string
  assetDescription: string
  category: string
  owningDepartment: string
  criticality: string
  wipClass: string
}

const EMPTY_ROW = (serialNumber: string): ScanRow => ({
  id: crypto.randomUUID(),
  serialNumber,
  itemCode: "",
  tagNumber: "",
  itemCodeDescription: "",
  assetDescription: "",
  category: "",
  owningDepartment: "",
  criticality: "",
  wipClass: "",
})

export default function UploadPro({ orgUnitId, role, onSuccess }: UploadProProps) {
  const { tree } = useTree()
  const { can, loading: matrixLoading } = usePermissions()
  const alert = useAlert()

  const [mode,         setMode]         = useState<"excel" | "scanner">("excel")
  const [file,         setFile]         = useState<File | null>(null)
  const [selectedNode, setSelectedNode] = useState<string>(orgUnitId)
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())
  const [loading,      setLoading]      = useState(false)

  // Scanner-mode state
  const [scanInput,        setScanInput]        = useState("")
  const [rows,             setRows]             = useState<ScanRow[]>([])
  const [scanError,        setScanError]        = useState<string | null>(null)
  const [submitError,      setSubmitError]      = useState<string | null>(null)
  const [feedback,         setFeedback]         = useState<string | null>(null)
  const [rejectedSerials,  setRejectedSerials]  = useState<Set<string>>(new Set())
  const scanRef = useRef<HTMLInputElement>(null)

  const normalizedRole = (role || "").toUpperCase().trim()

  // Matrix-driven permission checks
  const canUpload = !matrixLoading && can(normalizedRole, "upload_assets")
  const canAssign = !matrixLoading && can(normalizedRole, "assign_assets")
  const isAdmin   = !matrixLoading && (normalizedRole === "SUPER_ADMIN" || normalizedRole === "ADMIN")

  // Sync selected node when parent changes
  useEffect(() => {
    if (!tree || !orgUnitId) return
    setSelectedNode(orgUnitId)
    const path = findPath(tree, orgUnitId)
    if (path) {
      const newExpanded = new Set<string>()
      path.forEach(n => { if (n.id !== orgUnitId) newExpanded.add(n.id) })
      setExpanded(newExpanded)
    }
  }, [orgUnitId, tree])

  // Auto-focus the manual fallback input when scanner mode becomes active
  useEffect(() => { if (mode === "scanner") scanRef.current?.focus() }, [mode])

  // Which org unit types this role may upload to. Sourced from the shared
  // role→tier map. `null` is returned both for admins (pick any node) and for
  // roles with no tier of their own — the same "no restriction / nothing
  // selectable" semantics the old switch produced for default roles.
  const getAllowedTypes = (): string[] | null => {
    if (isAdmin) return null  // admins may select any node
    const tiers = targetTypesFor(normalizedRole)
    return tiers.length > 0 ? tiers : null
  }
  const allowedTypes = getAllowedTypes()

  const normalize = (v: any) => (v || "").toString().toUpperCase().trim()

  const toggle = (id: string) => {
    const copy = new Set(expanded)
    copy.has(id) ? copy.delete(id) : copy.add(id)
    setExpanded(copy)
  }

  const renderNode = (node: any, level = 0) => {
    const isOpen     = expanded.has(node.id)
    const selectable = isAdmin || !!allowedTypes?.includes(normalize(node.type))
    const isSelected = selectedNode === node.id

    return (
      <div key={node.id}>
        <div
          style={{ paddingLeft: level * 16 }}
          className={[
            "flex items-center gap-2 px-2 py-1 rounded",
            selectable ? "cursor-pointer hover:bg-blue-50" : "text-gray-400 opacity-60",
            isSelected ? "bg-blue-100 font-semibold" : "",
          ].join(" ")}
          onClick={() => selectable && setSelectedNode(node.id)}
        >
          {node.children?.length > 0 && (
            <button
              onClick={e => { e.stopPropagation(); toggle(node.id) }}
              className="text-xs w-4"
            >
              {isOpen ? "▼" : "▶"}
            </button>
          )}
          <span className="flex-1">{node.name}</span>
          <span className="text-[10px] text-gray-400">{node.type}</span>
          {isSelected && <span className="text-blue-600">✔</span>}
        </div>
        {isOpen && node.children?.map((c: any) => renderNode(c, level + 1))}
      </div>
    )
  }

  // ── Scanner-mode handlers ──────────────────────────────────────────────────
  // addSerial is called by the camera scanner (on each detected barcode) and by
  // the manual fallback input.
  function addSerial(v: string) {
    const s = v.trim()
    if (!s) return
    if (rows.some(r => r.serialNumber === s)) {
      setScanError(`Serial "${s}" is already in the list.`)
      setScanInput("")
      return
    }
    setRows(prev => [...prev, EMPTY_ROW(s)])
    setScanError(null)
    setFeedback(null)
    setRejectedSerials(prev => { const n = new Set(prev); n.delete(s); return n })
  }

  function updateRow(id: string, field: keyof ScanRow, value: string) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)))
  }
  function removeRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id))
  }

  async function submitScanner() {
    setSubmitError(null)
    setFeedback(null)
    if (!selectedNode) { setSubmitError("Select a target org unit."); return }
    if (noPermission)  { setSubmitError("Selected node is not allowed for your role."); return }
    if (rows.length === 0) { setSubmitError("Add at least one asset by scanning a serial number."); return }
    const missing = rows.filter(r => !r.itemCode.trim())
    if (missing.length) { setSubmitError(`${missing.length} row(s) are missing the required Item Code.`); return }

    setLoading(true)
    try {
      const res = await fetch("/api/assets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgUnitId: selectedNode, assets: rows }),
      })
      const data = await res.json()
      if (!res.ok) { setSubmitError(data.error || "Upload failed"); return }

      const dup = new Set<string>(data.duplicates || [])
      const parts: string[] = [`✓ Inserted: ${data.inserted}`]
      if (dup.size) parts.push(`✗ Rejected (serial already exists): ${Array.from(dup).join(", ")}`)
      if (data.duplicateInBatch?.length) parts.push(`Duplicate in batch: ${data.duplicateInBatch.join(", ")}`)
      if (data.errors?.length) parts.push(`${data.errors.length} row(s) invalid`)
      setFeedback(parts.join("   ·   "))
      setRejectedSerials(dup)
      // Keep only the rejected rows for review; inserted ones are cleared.
      setRows(prev => prev.filter(r => dup.has(r.serialNumber)))
      if (data.inserted > 0) onSuccess?.()
    } catch {
      setSubmitError("Upload failed")
    } finally {
      setLoading(false)
    }
  }

  // ── Excel-mode handler ─────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file || !selectedNode) return
    if (!canUpload) { await alert("You don't have permission to upload assets"); return }

    const formData = new FormData()
    formData.append("file", file)
    formData.append("orgUnitId", selectedNode)

    setLoading(true)
    try {
      const res  = await fetch("/api/assets/upload", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) { await alert(data.error || "Upload failed"); return }
      const parts = [`Inserted: ${data.inserted}`]
      if (data.duplicates?.length) parts.push(`✗ Rejected (serial already exists): ${data.duplicates.join(", ")}`)
      if (data.skipped) parts.push(`Skipped (missing fields): ${data.skipped}`)
      await alert(parts.join("   ·   "))
      setFile(null)
      onSuccess?.()
    } catch {
      await alert("Upload failed")
    } finally {
      setLoading(false)
    }
  }

  // Still loading matrix or tree
  if (!tree || matrixLoading) return null

  // Role has no upload permission at all
  if (!canUpload) return (
    <div style={{
      padding: "12px 16px", borderRadius: 8, background: "#fef2f2",
      border: "1px solid #fca5a5", color: "#dc2626", fontSize: 13, fontWeight: 500,
    }}>
      🔒 You don't have permission to upload assets.
    </div>
  )

  const selectedType = getNodeType(tree, selectedNode)
  const noPermission = !isAdmin && !!allowedTypes && !allowedTypes.includes(normalize(selectedType))

  const btn = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer",
    background: active ? "#1d4ed8" : "#fff", color: active ? "#fff" : "#374151",
    border: `1px solid ${active ? "#1d4ed8" : "#d1d5db"}`, transition: "all .15s",
  })

  return (
    <div className="border rounded-xl p-4 bg-gray-50 space-y-4">

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button style={btn(mode === "excel")} onClick={() => setMode("excel")}>📊 Excel Upload</button>
        <button style={btn(mode === "scanner")} onClick={() => setMode("scanner")}>📷 Scanner / Manual Entry</button>
      </div>

      {/* Selected node label + permission indicators (shared) */}
      <div className="flex items-center gap-4 flex-wrap text-sm text-gray-600">
        <div>
          Selected Node:{" "}
          <span className="text-blue-600 font-medium">
            {selectedNode ? findNodeName(tree, selectedNode) : "None"}
          </span>
          {!isAdmin && noPermission && (
            <span className="ml-2 text-red-500 text-xs">⚠ Not allowed for your role</span>
          )}
        </div>
        {!canAssign && (
          <span style={{
            fontSize: 11, color: "#92400e", background: "#fef3c7",
            border: "1px solid #fcd34d", borderRadius: 4, padding: "2px 8px",
          }}>
            ⚠ No assign permission — upload only
          </span>
        )}
      </div>

      {/* Org tree (shared) */}
      <div className="border p-2 max-h-64 overflow-auto bg-white rounded">
        {renderNode(tree)}
      </div>

      {mode === "excel" ? (
        /* ── Excel mode ── */
        <div className="flex items-center gap-4 flex-wrap">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="
              block w-auto p-6 text-sm text-gray-600
              border-2 border-dashed border-blue-200 rounded-xl bg-blue-50 cursor-pointer
              file:mr-4 file:px-6 file:py-5 file:rounded-lg file:border-0
              file:text-sm file:font-semibold file:bg-blue-600 file:text-white file:cursor-pointer
              hover:border-blue-400 hover:bg-blue-100 hover:file:bg-blue-700 transition
            "
          />
          <button
            onClick={handleUpload}
            disabled={!file || loading || Boolean(noPermission)}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {loading ? "Uploading…" : "Upload"}
          </button>
        </div>
      ) : (
        /* ── Scanner / manual mode ── */
        <div className="space-y-3">
          {/* Camera scanner (phone back camera or webcam) */}
          <AssetScanner onDetected={addSerial} />

          {/* Manual fallback — type a serial if the barcode is unreadable */}
          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <input
                ref={scanRef}
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { addSerial(scanInput); setScanInput("") } }}
                placeholder="…or type a serial number manually, then Enter"
                className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-lg bg-gray-50 focus:outline-none focus:border-green-500 text-sm"
              />
              <button
                onClick={() => { setRows([]); setRejectedSerials(new Set()); setFeedback(null); setScanError(null) }}
                disabled={!rows.length}
                className="px-3 py-2 text-sm border rounded-lg disabled:opacity-50"
              >
                Clear all
              </button>
            </div>
            {scanError && <div className="text-xs text-red-600">{scanError}</div>}
          </div>

          {rows.length > 0 && (
            <div className="overflow-x-auto border rounded-lg bg-white">
              <table className="min-w-full text-xs border-collapse">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    {["Serial (scanned)", "Item Code *", "Tag Number", "Item Code Desc", "Asset Description", "Category", "Owning Dept", "Criticality", "WIP Class", ""].map((h, i) => (
                      <th key={i} className="px-2 py-1 text-left font-semibold text-gray-600 whitespace-nowrap border-b">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const rejected = rejectedSerials.has(r.serialNumber)
                    return (
                      <tr key={r.id} style={{ background: rejected ? "#fef2f2" : i % 2 ? "#f9fafb" : "#fff" }}>
                        <td className="px-2 py-1 font-mono whitespace-nowrap" style={{ color: rejected ? "#dc2626" : "#111827" }}>
                          {r.serialNumber}{rejected && <span className="ml-1 font-bold">✗ exists</span>}
                        </td>
                        {([
                          ["itemCode", "w-32"],
                          ["tagNumber", "w-28"],
                          ["itemCodeDescription", "w-40"],
                          ["assetDescription", "w-44"],
                          ["category", "w-24"],
                          ["owningDepartment", "w-32"],
                          ["criticality", "w-24"],
                          ["wipClass", "w-24"],
                        ] as [keyof ScanRow, string][]).map(([field, w]) => (
                          <td key={field} className="px-1 py-1">
                            <input
                              value={r[field]}
                              onChange={e => updateRow(r.id, field, e.target.value)}
                              className={`${w} px-1 py-0.5 border border-gray-300 rounded focus:outline-none focus:border-blue-400`}
                            />
                          </td>
                        ))}
                        <td className="px-1 py-1 text-center">
                          <button onClick={() => removeRow(r.id)} className="text-red-500 hover:text-red-700" title="Remove">✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={submitScanner}
              disabled={loading || !rows.length || Boolean(noPermission)}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
            >
              {loading ? "Submitting…" : `Submit ${rows.length} asset(s)`}
            </button>
            {submitError && <span className="text-xs text-red-600 font-medium">{submitError}</span>}
            {feedback && <span className="text-xs text-gray-700">{feedback}</span>}
            <span className="text-xs text-gray-400">Tip: scan each serial, then fill the fields manually. Duplicates are rejected.</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Helpers ── */

function findNodeName(node: any, id: string): string {
  if (node.id === id) return node.name
  for (const c of node.children ?? []) {
    const f = findNodeName(c, id); if (f) return f
  }
  return ""
}

function getNodeType(node: any, id: string): string | null {
  if (node.id === id) return node.type
  for (const c of node.children ?? []) {
    const f = getNodeType(c, id); if (f) return f
  }
  return null
}

function findPath(node: any, targetId: string, path: any[] = []): any[] | null {
  if (!node) return null
  const newPath = [...path, node]
  if (node.id === targetId) return newPath
  for (const c of node.children ?? []) {
    const res = findPath(c, targetId, newPath); if (res) return res
  }
  return null
}
