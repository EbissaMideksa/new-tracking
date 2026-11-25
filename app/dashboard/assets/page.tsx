

//app/dashboard/assets/page.tsx
"use client"

import { useEffect, useState, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import AssignTreeSelector from "@/components/AssignTreeSelector"
import { useTree } from "@/components/useTree"
import { useToast } from "@/components/ToastProvider"
import { useConfirm } from "@/components/ConfirmProvider"
import { useBreadcrumbs } from "@/context/BreadcrumbContext"
import BreadcrumbBar from "@/components/BreadcrumbBar"

import { usePermissions } from "@/context/PermissionsContext"
import  { usePermissionGuard }  from "@/hooks/usePermissionGuard"
import { useLiveChannel } from "@/hooks/useLiveChannel"
import UploadPro from "@/components/UploadPro"
import { exportToExcel } from "@/lib/exportXlsx"
import { exportAssetsPDF } from "@/lib/pdfExport"
import { exportToCSV } from "@/lib/csvExport"
import { getCategoryBadge } from "@/lib/assetCategories"
import { politicalAreaLabel } from "@/lib/politicalArea"
import { ASSIGNABLE_TYPES } from "@/lib/orgStructure"


export default function AssetsPage() {
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
  const [selectedNode, setSelectedNode] = useState("")
  const [showBatchAssign, setShowBatchAssign] = useState(false)
  const [role, setRole] = useState("CHIEF")
  const [search, setSearch] = useState("")
  const [showUpload, setShowUpload] = useState(false)
  const [myOrgUnitId, setMyOrgUnitId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20
  // Server-side paging. `total` is the REAL number of matching assets in the
  // database. Previously the page downloaded at most 2000 rows and reported
  // that slice as the total, so ~99.8% of a 1M-row inventory was invisible with
  // no indication that anything was missing.
  const [total, setTotal] = useState(0)
  // Search input is debounced into `search`, which is the term actually sent to
  // the server (search used to be a browser-side filter over the 2000-row slice).
  const [searchInput, setSearchInput] = useState("")

  const { tree, reloadTree } = useTree()
  const router = useRouter()
  const params = useSearchParams()
  const orgId = params.get("org")
  const selectAllRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()
  const confirm = useConfirm()
  const { pushCrumb, setBreadcrumbs } = useBreadcrumbs()

  const pathMap = tree ? buildPathMap(tree) : {}
  const allSelected = assets.length > 0 && selectedAssets.size === assets.length
  const isIndeterminate = selectedAssets.size > 0 && selectedAssets.size < assets.length

  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingTagValue, setEditingTagValue] = useState<string>("")

   //const { ready, allowed } = usePermissionGuard("view_all_assets")
  const { canSelf } = usePermissions()
  
  const { ready, allowed, myRole } = usePermissionGuard("assets_page")
  //const {canAssetsPage} =  ready && myRole ? can(myRole, "view_assets") : false

  const canUpload = ready && !!myRole && canSelf("upload_assets")
  const uploadTargetOrgId = orgId || myOrgUnitId || tree?.id || null
  const uploadTargetName = uploadTargetOrgId
    ? (pathMap[uploadTargetOrgId] || []).slice(-1)[0]?.name || uploadTargetOrgId
    : ""
  
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = isIndeterminate
  }, [isIndeterminate])

// … inside the component, after your existing state declarations:

// ── Live updates ────────────────────────────────────────────────────────────
useLiveChannel("/api/assets/events", (payload) => {
  if (payload.event === "created") {
    setAssets(prev => {
      // avoid duplicates (skipDuplicates on DB side, but SSE may fire twice on re-render)
      if (prev.some(a => a.id === payload.asset.id)) return prev
      return [payload.asset, ...prev]
    })
  }

  if (payload.event === "updated") {
    setAssets(prev =>
      prev.map(a => a.id === payload.asset.id ? payload.asset : a)
    )
  }

  if (payload.event === "deleted") {
    setAssets(prev => prev.filter(a => a.id !== payload.asset.id))
  }
})
// ────────────────────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(pageSize),
      })
      if (orgId) params.set("org", orgId)
      if (search.trim()) params.set("q", search.trim())

      const res = await fetch(`/api/assets?${params.toString()}`)
      if (!res.ok) { setAssets([]); setTotal(0); return }
      const data = await res.json()
      setAssets(Array.isArray(data.items) ? data.items : [])
      setTotal(typeof data.total === "number" ? data.total : 0)
    } catch {
      setAssets([]); setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  // Debounce the search box into the term we actually query with, and jump back
  // to page 1 whenever the term changes (otherwise you can be left on a page
  // that no longer exists for the new result set).
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setCurrentPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  /**
   * Exports need the whole matching set, not just the visible page. The paged
   * endpoint can't serve that, so this asks the (legacy) unpaged endpoint for
   * the current filter and reports honestly when its 2000-row safety cap
   * truncates the result instead of silently exporting partial data.
   */
  async function fetchExportRows(): Promise<any[]> {
    const params = new URLSearchParams()
    if (orgId) params.set("org", orgId)
    if (search.trim()) params.set("q", search.trim())

    const res = await fetch(`/api/assets?${params.toString()}`)
    if (!res.ok) { showToast("Could not load rows to export", "error"); return [] }

    const rows = await res.json()
    const safeRows = Array.isArray(rows) ? rows : []

    if (res.headers.get("X-Truncated") === "true") {
      const serverTotal = Number(res.headers.get("X-Total-Count") || safeRows.length)
      showToast(
        `Exported the first ${safeRows.length.toLocaleString()} of ${serverTotal.toLocaleString()} matching assets — narrow the filter (e.g. pick an org unit) to export the rest.`,
        "error",
      )
    }
    return safeRows
  }

  useEffect(() => {
    async function loadUser() {
      const res = await fetch("/api/auth/me")
      const user = await res.json()
      setRole(user.role)
      setMyOrgUnitId(user.orgUnitId || null)
    }
    loadUser()
  }, [])

  // A selection made on page 1 must not silently persist while the user
  // paginates (batch assign would then act on rows that are no longer visible).
  useEffect(() => { setSelectedAssets(new Set()) }, [currentPage, search, orgId])

  useEffect(() => { load() }, [orgId, currentPage, search])

  useEffect(() => {
    if (!tree) return
    if (!orgId) { setBreadcrumbs([]); return }
    const orgPath = findPath(tree, orgId)
    if (orgPath) setBreadcrumbs(orgPath)
  }, [orgId, tree, setBreadcrumbs])

  // The server already applied org scope, the search term, the sort and the page
  // window, so what came back IS the filtered set for this page. The old name is
  // kept so the render code below (exports, table, footer) needs no rewrites.
  const filteredAssets = assets
  const paginatedAssets = assets

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const toggleAssetSelection = (id: string) => {
    setSelectedAssets((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedAssets(allSelected ? new Set() : new Set(assets.map((a) => a.id)))
  }

  const assignBatch = async () => {
    if (!selectedNode) return showToast("Select a target node", "error")
    if (selectedAssets.size === 0) return showToast("Select assets first", "error")
    const res = await fetch("/api/org/assignable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetIds: Array.from(selectedAssets), assignToId: selectedNode })
    })
    const data = await res.json()
    if (!res.ok) { showToast(data.error || "Assignment failed", "error"); return }
    showToast(`Assigned ${selectedAssets.size} assets successfully`, "success")
    setSelectedAssets(new Set())
    setSelectedNode("")
    setShowBatchAssign(false)
    await load()
    await reloadTree?.()
    router.refresh()
  }

  function findPath(node: any, targetId: string, path: any[] = []): any[] | null {
    if (!node) return null
    const newPath = [...path, { id: node.id, name: node.name, type: node.type }]
    if (node.id === targetId) return newPath
    for (const child of node.children || []) {
      const result = findPath(child, targetId, newPath)
      if (result) return result
    }
    return null
  }

  function buildPathMap(node: any, path: any[] = [], map: any = {}) {
    if (!node) return map
    const currentPath = [...path, node]
    map[node.id] = currentPath
    for (const child of node.children || []) buildPathMap(child, currentPath, map)
    return map
  }

  
  function formatOwningDepartment(pathNodes: any[]) {
    if (!pathNodes || pathNodes.length === 0) return "-"
    const node = (type: string) => pathNodes.find((n: any) => n.type === type)
    const division   = node("DIVISION")?.name
    const department = node("DEPARTMENT")?.name
    // Zone/Region shown as its short code (EAAZ, CWR, …), falling back to name.
    const zoneRegionNode = node("ZONE") || node("REGION")
    const zoneRegion = zoneRegionNode ? (zoneRegionNode.code || zoneRegionNode.name) : ""
    const area       = node("AREA")?.name
    const site       = node("SITE")?.name
    const shortDivision   = division  === "Fixed Network"         ? "FN"  : division
    const shortDepartment = department === "Operations & Maintenance" ? "O&M" : department
    const divDept = [shortDivision, shortDepartment].filter(Boolean).join("-")
    // area-group: e.g. "Holeta Group-1" → "Holeta-Group-1"
    const areaGroup = site ? site.replace(/\s+(Group[- ]?\d+)$/i, "-$1") : (area || "")
    // Format: <Zone/Region> <Div-Dep> <Area>
    return [zoneRegion, divDept, areaGroup].filter(Boolean).join(" ") || "-"
  }


function getPoliticalAreaFromPath(pathNodes: any[]) {
  // Delegates to the shared resolver (lib/politicalArea.ts) that the server uses
  // when it derives the stored column, so the table and the exported value can
  // never disagree.
  return politicalAreaLabel(pathNodes)
}

/** "3 d ago" / "2 h ago" — how long an asset has been checked out. */
function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ""
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} mo ago`
  return `${Math.floor(months / 12)} y ago`
}



  const startEditTag = (asset: any) => {
    setEditingTagId(asset.id)
    setEditingTagValue(asset.tagNumber || "")
  }

  const cancelEditTag = () => {
    setEditingTagId(null)
    setEditingTagValue("")
  }

  const saveTag = async (assetId: string) => {
    const res = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagNumber: editingTagValue })
    })
    if (res.ok) {
      setAssets(prev => prev.map(a => a.id === assetId ? { ...a, tagNumber: editingTagValue } : a))
      cancelEditTag()
    }
  }

  
  const canEditTag = (asset: any) => {
    if (!tree || !asset.orgUnit?.id) return false
    // Use matrix instead of hardcoded roles
    if (!canSelf( "edit_asset_tags")) return false
    const assetPath = findPath(tree, asset.orgUnit.id)
    if (!assetPath) return false
    const scopeId = orgId || tree.id
    return assetPath.some(n => n.id === scopeId)
  }


  const adminAreaLabel = (() => {
    if (!tree || !orgId) return "All Areas"
    const path = findPath(tree, orgId)
    if (!path) return "Unknown Area"
    const zoneNode =
      path.find(n => n.type === "ZONE") ||
      path.find(n => n.type === "REGION") ||
      path.find(n => n.type === "AREA") ||
      path.find(n => n.type === "SITE")
    return zoneNode?.name || "Unknown Area"
  })()

  // ── Column definitions ──
  const columns = [
    { key: "id",                  label: "Asset ID",                  w: 110, mono: true },
    { key: "itemCode",            label: "Asset Group (Item Code)",   w: 160, mono: true },
    { key: "itemCodeDescription", label: "Item Code Description",     w: 200 },
    { key: "tagNumber",           label: "Tag Number",                w: 140, mono: true, editable: true, mandatory: true },
    { key: "serialNumber",        label: "Serial Number (Permanent)", w: 180, mono: true },
    { key: "assetDescription",    label: "Asset Description",         w: 200 },
    { key: "category",            label: "Category",                  w: 160, chip: "purple" },
    { key: "owningDepartment",    label: "Owning Department",         w: 180 },
    { key: "criticality",         label: "Criticality",               w: 110, chip: "criticality" },
    { key: "wipClass",            label: "WIP Acct Class",            w: 140 },
    { key: "politicalArea",       label: "Area (Political Admin)",    w: 180 },
    { key: "maintainable",        label: "Maintainable",              w: 110, bool: true },
    { key: "active",              label: "Active",                    w: 90,  bool: true },
    { key: "productionOrg",       label: "Production Org",            w: 160 },
    { key: "equipmentItem",       label: "Equipment Item",            w: 180 },
    { key: "eqpSerial",           label: "EQP Serial Number",         w: 160, mono: true },
    { key: "faCategory",          label: "Fixed Asset Category",      w: 180 },
    { key: "faNumber",            label: "Fixed Asset Number",        w: 160, mono: true },
    { key: "parentAsset",         label: "Parent Asset Number",       w: 170, mono: true },
    { key: "parentSerial",        label: "Parent Asset Serial",       w: 170, mono: true },
    { key: "locationName",        label: "Property Location Name",    w: 200 },
    { key: "locationCode",        label: "Property Location Code",    w: 180, mono: true },
    { key: "address",             label: "Address",                   w: 220 },
    { key: "warrantyExpiration",  label: "Warranty Expiration",       w: 160 },
    // Not `bool` — it renders holder + elapsed time for the approver
    // follow-up report, so renderCell handles it by key instead.
    { key: "checkedOut",          label: "Checked Out",               w: 200 },
    { key: "faSynced",            label: "FA Synchronized",           w: 140, bool: true },
    { key: "operational",         label: "Operational Flag",          w: 130, bool: true },
    { key: "customFlag",          label: "[ ]",                       w: 60,  bool: true },
    { key: "wirelessSiteId",      label: "Wireless Site ID",          w: 150, mono: true },
  ]

  // ── Cell renderer — used in tbody only ──
  function renderCell(col: any, a: any) {
    const val = a[col.key]
    const tdBase = "whitespace-nowrap border-b border-slate-100 px-2.5 py-1.5"

    if (col.key === "id") return (
      <td key={col.key} className={tdBase}>
        <span className="font-mono text-[10px] text-slate-400">{a.id?.slice(0, 8)}…</span>
      </td>
    )

    if (col.key === "tagNumber") return (
      <td key={col.key} className={tdBase}>
        <div className="group relative inline-flex items-center gap-1.5">
          {editingTagId === a.id ? (
            <div className="flex items-center gap-1.5">
              <input
                value={editingTagValue}
                onChange={(e) => setEditingTagValue(e.target.value)}
                className="text-[11px] px-1.5 py-1 border border-slate-300 rounded w-[var(--asset-input-w,120px)] max-w-[42vw]"
              />
              <button onClick={() => saveTag(a.id)} className="text-[10px] px-1.5 py-1 bg-green-600 text-white rounded border-0 cursor-pointer whitespace-nowrap">Save</button>
              <button onClick={cancelEditTag}       className="text-[10px] px-1.5 py-1 bg-red-500 text-white rounded border-0 cursor-pointer whitespace-nowrap">Cancel</button>
            </div>
          ) : (
            <>
              {val
                ? <span className="font-mono font-semibold text-slate-900">{val}</span>
                : <span className="text-[9px] font-bold text-red-500">MISSING</span>}
              {canEditTag(a) && (
                <button onClick={() => startEditTag(a)} className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 text-white border-0 rounded px-1.5 py-0.5 cursor-pointer">
                  Edit
                </button>
              )}
            </>
          )}
        </div>
      </td>
    )

    if (col.bool) return (
      <td key={col.key} className={tdBase}>
        {val === true  && <span className="text-[9px] font-bold text-green-600 bg-green-100 border border-green-200 rounded-[3px] px-[7px] py-px">Yes</span>}
        {val === false && <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded-[3px] px-[7px] py-px">No</span>}
        {val == null   && <span className="text-slate-300">—</span>}
      </td>
    )

    if (col.chip === "criticality") return (
      <td key={col.key} className={tdBase}>
        {val ? (
          <span
            className="text-[9px] font-bold rounded-[3px] px-[7px] py-px"
            style={{
              color:      val === "HIGH" ? "#ef4444" : val === "MEDIUM" ? "#f59e0b" : "#22c55e",
              backgroundColor: val === "HIGH" ? "#fef2f2" : val === "MEDIUM" ? "#fffbeb" : "#f0fdf4",
              border: `1px solid ${val === "HIGH" ? "#fca5a5" : val === "MEDIUM" ? "#fcd34d" : "#bbf7d0"}`,
            }}
          >{val}</span>
        ) : <span className="text-slate-300">—</span>}
      </td>
    )

    if (col.chip === "purple") return (
      <td key={col.key} className={tdBase}>
        {val
          ? (() => {
              const badge = getCategoryBadge(val)
              return (
                <span
                  className="text-[9px] font-semibold rounded px-2 py-0.5 inline-flex items-center gap-1"
                  style={{ backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.color}33` }}
                >
                  <span className="text-[11px]">{badge.icon}</span>
                  <span>{val}</span>
                </span>
              )
            })()
          : <span className="text-slate-300">—</span>}
      </td>
    )

    if (col.key === "owningDepartment") return (
      <td key={col.key} className={tdBase}>
        <span className="font-mono text-[10px] text-slate-600">
          {a.orgUnit?.id ? formatOwningDepartment(pathMap[a.orgUnit.id]) : (val ?? "—")}
        </span>
      </td>
    )

    if (col.key === "politicalArea") return (
      <td key={col.key} className={tdBase}>
        <span className="font-semibold text-slate-700 font-mono">
          {a.orgUnit?.id
            ? getPoliticalAreaFromPath(pathMap[a.orgUnit.id])
            : (val ?? "—")}
        </span>
      </td>
    )

    // "Address" is the political-administration title: the name of the
    // region / zone / corporate the asset's current org unit rolls up to. It is
    // derived live from the org path rather than read from the free-text
    // Address column, so it follows the asset when it is moved. The stored
    // `address` value is still shown in the asset detail for reference.
    if (col.key === "address") return (
      <td key={col.key} className={tdBase}>
        <span className="font-mono text-[10px] text-slate-700"
              title={val ? `Recorded address: ${val}` : undefined}>
          {a.orgUnit?.id
            ? getPoliticalAreaFromPath(pathMap[a.orgUnit.id])
            : (val ?? "—")}
        </span>
      </td>
    )

    // "Checked Out" is a follow-up report for department approvers, so it shows
    // WHO holds the asset and SINCE when, not a bare Yes/No.
    if (col.key === "checkedOut") return (
      <td key={col.key} className={tdBase}>
        {val === true ? (
          <span className="inline-flex items-center gap-1.5 text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-[3px] px-[7px] py-px">
            <span className="font-mono text-[9px] text-amber-800">
              {a.assignedTo?.name ?? "Unknown"}
            </span>
            {a.startedAt && (
              <span className="font-normal text-amber-800">
                · {relativeTime(a.startedAt)}
              </span>
            )}
          </span>
        ) : val === false ? (
          <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded-[3px] px-[7px] py-px">No</span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
    )
    if (col.mono) return (
      <td key={col.key} className={tdBase}>
        <span className="font-mono text-[10px] text-slate-600">{val ?? "—"}</span>
      </td>
    )

    return (
      <td key={col.key} className={tdBase} style={{ maxWidth: col.w }}>
        <span className="block truncate text-slate-600">
          {val ?? "—"}
        </span>
      </td>
    )
  }

  // ── ADD before the existing loading check ──
  if (!ready) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <div className="flex gap-1.5">
          {[0,1,2].map((i) => (
            <div
              key={i}
              className="h-2 w-2 rounded-full bg-blue-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    )
  }
  if (!allowed) return null  // usePermissionGuard handles redirect

   

  if (loading) return (
    <div className="flex items-center justify-center h-64 bg-gray-50">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  )

  const ASSET_EXPORT_COLUMNS = [
    { key: "itemCode", label: "Item Code" },
    { key: "itemCodeDescription", label: "Item Code Description" },
    { key: "tagNumber", label: "Tag Number" },
    { key: "serialNumber", label: "Serial Number" },
    { key: "assetDescription", label: "Asset Description" },
    { key: "category", label: "Category" },
    { key: "criticality", label: "Criticality" },
    { key: "wipClass", label: "WIP Class" },
    { key: "politicalArea", label: "Area (Political Admin)" },
    // Address is the political-administration title (region / zone / corporate),
    // derived per row so the export cannot disagree with the table.
    { key: "address", label: "Address" },
    { key: "operational", label: "Operational" },
    { key: "checkedOut", label: "Checked Out" },
    { key: "active", label: "Active" },
    { key: "orgUnit", label: "Org Unit" },
  ]

  return (
    <div className="flex h-full flex-col bg-slate-50">

      <BreadcrumbBar />

      {/* ── TOP TOOLBAR ── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-slate-900">Assets</span>
          <span className="rounded bg-slate-100 px-[7px] py-px text-[10px] font-medium text-slate-500">
            {total.toLocaleString()}
          </span>
          {selectedAssets.size > 0 && (
            <span className="rounded border border-blue-200 bg-blue-100 px-2 py-px text-[10px] font-semibold text-blue-700">
              {selectedAssets.size} selected
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 gap-y-2">
          {canUpload && (
            <button
              onClick={() => setShowUpload(v => !v)}
              className={[
                "whitespace-nowrap rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer",
                showUpload ? "border-red-300 bg-red-50 text-red-600" : "border-green-600 bg-green-600 text-white",
              ].join(" ")}
            >
              {showUpload ? "✕ Close" : "↑ Upload"}
            </button>
          )}
          <button
            onClick={async () => {
              const rows = await fetchExportRows()
              if (!rows.length) return
              exportToExcel(
                // Area and Address are derived from the row's org path, exactly as
                // the table does — exporting the stored column would ship a value
                // that can predate the asset's last move.
                rows.map(a => {
                  const area = a.orgUnit?.id ? getPoliticalAreaFromPath(pathMap[a.orgUnit.id]) : (a.politicalArea ?? "")
                  return {
                    ...a,
                    orgUnit: a.orgUnit?.name ?? "",
                    politicalArea: area,
                    address: area,
                    checkedOut: a.checkedOut
                      ? `${a.assignedTo?.name ?? "Unknown"}${a.startedAt ? ` (since ${new Date(a.startedAt).toISOString().slice(0, 10)})` : ""}`
                      : "No",
                  }
                }),
                "assets",
                ASSET_EXPORT_COLUMNS,
              )
            }}
            disabled={!filteredAssets.length}
            className="whitespace-nowrap rounded-md border border-indigo-500 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-500 cursor-pointer disabled:opacity-50"
          >
            ⬇ Export Excel
          </button>
          <button
            onClick={async () => {
              const rows = await fetchExportRows()
              if (!rows.length) return
              exportAssetsPDF(
                rows.map(a => ({
                  tagNumber: a.tagNumber || "",
                  serialNumber: a.serialNumber || "",
                  itemCode: a.itemCode || "",
                  description: a.assetDescription || a.itemCodeDescription || "",
                  category: a.category || "",
                  orgUnit: a.orgUnit?.name || "",
                  criticality: a.criticality || "",
                  warrantyExpiration: a.warrantyExpiration || "",
                  active: a.active ?? true,
                }))
              )
            }}
            disabled={!filteredAssets.length}
            className="whitespace-nowrap rounded-md border border-red-600 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-600 cursor-pointer disabled:opacity-50"
          >
            ⬇ Export PDF
          </button>
          <button
            onClick={async () => {
              const rows = await fetchExportRows()
              if (!rows.length) return
              exportToCSV(
                rows.map(a => {
                  const area = a.orgUnit?.id ? getPoliticalAreaFromPath(pathMap[a.orgUnit.id]) : (a.politicalArea ?? "")
                  return {
                    tagNumber: a.tagNumber || "",
                    serialNumber: a.serialNumber || "",
                    itemCode: a.itemCode || "",
                    description: a.assetDescription || a.itemCodeDescription || "",
                    category: a.category || "",
                    orgUnit: a.orgUnit?.name || "",
                    // Derived like the table, so the report never carries a value
                    // that predates the asset's last move.
                    politicalArea: area,
                    address: area,
                    criticality: a.criticality || "",
                    warrantyExpiration: a.warrantyExpiration || "",
                    active: a.active ? "Yes" : "No",
                    operational: a.operational ? "Yes" : "No",
                    checkedOut: a.checkedOut
                      ? `${a.assignedTo?.name ?? "Unknown"}${a.startedAt ? ` (since ${new Date(a.startedAt).toISOString().slice(0, 10)})` : ""}`
                      : "No",
                  }
                }),
                `assets-${new Date().toISOString().slice(0, 10)}`,
                [
                  { key: "tagNumber", label: "Tag Number" },
                  { key: "serialNumber", label: "Serial Number" },
                  { key: "itemCode", label: "Item Code" },
                  { key: "description", label: "Description" },
                  { key: "category", label: "Category" },
                  { key: "orgUnit", label: "Org Unit" },
                  { key: "politicalArea", label: "Area (Political Admin)" },
                  { key: "address", label: "Address" },
                  { key: "criticality", label: "Criticality" },
                  { key: "warrantyExpiration", label: "Warranty Expiration" },
                  { key: "active", label: "Active" },
                  { key: "operational", label: "Operational" },
                  { key: "checkedOut", label: "Checked Out" },
                ]
              )
            }}
            disabled={!filteredAssets.length}
            className="whitespace-nowrap rounded-md border border-cyan-600 bg-white px-2.5 py-1 text-[11px] font-semibold text-cyan-600 cursor-pointer disabled:opacity-50"
          >
            ⬇ Export CSV
          </button>
          <div className="relative flex-1 basis-[200px] min-w-[120px]">
            <svg className="absolute left-2.5 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-slate-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search assets…"
              className="w-full rounded-md border border-slate-200 bg-slate-50 py-1 pl-7 pr-2.5 text-[11px] text-slate-700 outline-none"
            />
          </div>

          <button
            onClick={() => { setShowBatchAssign(!showBatchAssign); setSelectedAssets(new Set()) }}
            className={[
              "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer",
              showBatchAssign ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600",
            ].join(" ")}
          >
            {showBatchAssign ? "✕ Cancel" : "Batch Assign"}
          </button>

          {showBatchAssign && selectedAssets.size > 0 && (
            <button onClick={assignBatch} className="rounded-md border border-green-600 bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer">
              Assign {selectedAssets.size}
            </button>
          )}

          {/* Bulk operations */}
          {selectedAssets.size > 0 && (
            <>
              <select
                onChange={async (e) => {
                  const val = e.target.value
                  if (!val) return
                  const [field, value] = val.split("=")
                  if (!(await confirm({ message: `Update ${selectedAssets.size} assets: set ${field} to ${value}?`, tone: "default", confirmLabel: "Update" }))) return
                  const res = await fetch("/api/assets/bulk-update", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ assetIds: Array.from(selectedAssets), updates: { [field]: value === "true" ? true : value === "false" ? false : value } }),
                  })
                  const data = await res.json()
                  if (res.ok) { showToast(`Updated ${data.updated} assets`, "success"); load() }
                  else { showToast(data.error || "Bulk update failed", "error") }
                  e.target.value = ""
                }}
                className="rounded-md border border-slate-300 px-2 py-1 text-[11px] cursor-pointer"
                defaultValue=""
              >
                <option value="">Bulk Actions ({selectedAssets.size})</option>
                <option value="active=true">Set Active</option>
                <option value="active=false">Set Inactive</option>
                <option value="operational=true">Set Operational</option>
                <option value="operational=false">Set Non-Operational</option>
                <option value="maintainable=true">Set Maintainable</option>
                <option value="maintainable=false">Set Not Maintainable</option>
              </select>
            </>
          )}
        </div>
      </div>

      {/* ── UPLOAD PANEL ── */}
      {showUpload && uploadTargetOrgId && (
        <>
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2 text-[11px] text-slate-500">
            <span className="text-slate-400">Uploading to:</span>
            <span className="font-bold text-blue-600">{uploadTargetName}</span>
          </div>
          <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-3">
            <UploadPro
              orgUnitId={uploadTargetOrgId}
              role={role}
              onSuccess={() => { load(); setShowUpload(false) }}
            />
          </div>
        </>
      )}

      {/* ── BATCH ASSIGN PANEL ── */}
      {showBatchAssign && (
        <div className="shrink-0 border-b border-blue-200 bg-blue-50 px-5 py-2.5">
          <p className="mb-1.5 text-[10px] font-semibold text-blue-700">Select target org unit:</p>
          <div className="max-h-[140px] overflow-y-auto rounded-md border border-blue-200 bg-white p-2">
           <AssignTreeSelector
  tree={tree}
  assignableTypes={ASSIGNABLE_TYPES}
  selectedId={selectedNode}
  onSelect={(id: string) => setSelectedNode(id)}
/>

          </div>
        </div>
      )}

      {/* ── TABLE ── */}
      <div className="flex-1 overflow-hidden pt-4">
        <div className="h-full overflow-auto overscroll-x-contain border-y border-slate-200 bg-white shadow-sm">
          <table className="w-max min-w-full border-collapse" style={{ fontSize: "var(--asset-font, 11px)" }}>

            {/* ── THEAD ── columns.map renders <th> here */}
            <thead>
              <tr>
                {/* Sticky checkbox col */}
                <th className="sticky left-0 top-0 z-40 w-9 min-w-9 border-b-2 border-r border-slate-200 bg-slate-100 px-2.5 py-[7px] shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                  {showBatchAssign && (
                    <input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 cursor-pointer rounded-sm accent-blue-600" />
                  )}
                </th>

                {/* ← columns.map renders <th> tags here in thead */}
                {columns.map((col) => (
                  <th key={col.key} style={{ minWidth: col.w }}
                    className="sticky top-0 z-30 border-b-2 border-slate-300 bg-slate-100 px-2.5 py-[7px] text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    {col.label}
                    {col.mandatory && <span className="ml-0.5 text-red-500">*</span>}
                  </th>
                ))}

                {/* Sticky action col */}
                <th className="sticky right-0 top-0 z-40 border-b-2 border-l border-slate-200 bg-slate-100 px-2.5 py-[7px] text-center text-[9px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap shadow-[-2px_0_4px_rgba(0,0,0,0.04)]"
                  style={{ width: "var(--asset-action-w, 110px)", minWidth: "var(--asset-action-w, 110px)" }}>
                  Action
                </th>
              </tr>
            </thead>

            {/* ── TBODY ── renderCell called per row per column here */}
            <tbody>
              {paginatedAssets.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2} className="py-[60px] text-center text-[13px] text-slate-400">
                    No assets found
                  </td>
                </tr>
              ) : paginatedAssets.map((a) => {
                const isSelected = selectedAssets.has(a.id)

                return (
                  <tr key={a.id}
                    className={[
                      "transition-colors",
                      isSelected ? "bg-blue-100" : "odd:bg-white even:bg-slate-50 hover:bg-sky-50",
                    ].join(" ")}
                  >
                    {/* Sticky checkbox cell */}
                    <td className="sticky left-0 z-10 w-9 min-w-9 border-b border-r border-slate-100 bg-inherit px-2.5 py-1.5 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
                      {showBatchAssign && (
                        <input type="checkbox" checked={isSelected} onChange={() => toggleAssetSelection(a.id)}
                          className="h-3.5 w-3.5 cursor-pointer rounded-sm accent-blue-600" />
                      )}
                    </td>

                    {/* ← renderCell called here in tbody with actual asset `a` */}
                    {columns.map((col) => renderCell(col, a))}

                    {/* Sticky action cell */}
                    <td className="sticky right-0 z-10 border-b border-l border-slate-100 bg-inherit px-2 py-1.5 text-center shadow-[-2px_0_4px_rgba(0,0,0,0.03)]"
                      style={{ width: "var(--asset-action-w, 110px)", minWidth: "var(--asset-action-w, 110px)" }}>
                      <div className="flex flex-col gap-[3px]">

                        <button
                          onClick={() => {
                            if (tree && a.orgUnit?.id) {
                              const orgPath = findPath(tree, a.orgUnit.id)
                              if (orgPath) setBreadcrumbs([...orgPath, { id: a.id, name: a.tagNumber || a.serialNumber || "Asset", type: "ASSET" }])
                            }
                            router.push(`/dashboard/assets/${a.id}`)
                          }}
                          className="w-full rounded-md bg-blue-600 bg-linear-to-br from-blue-700 to-blue-600 py-2 min-h-[34px] sm:min-h-[32px] text-xs sm:text-[13px] font-semibold text-white shadow transition-all hover:brightness-90"
                        >
                          Details
                        </button>

{/*                         <button
                          onClick={() => {
                            const p = new URLSearchParams({ assetId: a.id, assetTag: a.tagNumber || "", assetSerial: a.serialNumber || "", orgUnitId: a.orgUnit?.id || "" })
                            router.push(`/dashboard/workorders?create=1&${p.toString()}`)
                          }}
                          style={{ fontSize: 9, fontWeight: 700, padding: "4px 0", borderRadius: 4, background: "#7c3aed20", color: "#7c3aed", border: "1px solid #7c3aed40", cursor: "pointer", width: "100%" }}
                        >
                          + WO
                        </button> */}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PAGINATION ── */}
      <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-2.5">
        <span className="text-[10px] text-slate-400">
          {total === 0 ? "No results" : (
            <>Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, total)} of {total.toLocaleString()}{loading ? " (loading…)" : ""}</>
          )}
        </span>

        <div className="flex items-center gap-1">
          {[
            { label: "«", action: () => setCurrentPage(1),                             disabled: currentPage === 1 },
            { label: "‹", action: () => setCurrentPage(p => Math.max(1, p - 1)),      disabled: currentPage === 1 },
          ].map(({ label, action, disabled }) => (
            <button key={label} onClick={action} disabled={disabled}
              className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 cursor-pointer disabled:cursor-not-allowed disabled:text-slate-300">{label}</button>
          ))}

          {(() => {
            const range: number[] = []
            // `pageCount` (not `total`) — `total` is the row count from the server.
            const pageCount = totalPages || 1
            let start = Math.max(1, currentPage - 2)
            let end = Math.min(pageCount, start + 4)
            if (end - start < 4) start = Math.max(1, end - 4)
            for (let p = start; p <= end; p++) range.push(p)
            return range.map(p => (
              <button key={p} onClick={() => setCurrentPage(p)}
                className={[
                  "flex h-6 w-6 items-center justify-center rounded border text-[11px] cursor-pointer",
                  p === currentPage
                    ? "border-blue-600 bg-blue-600 font-bold text-white"
                    : "border-slate-200 bg-white font-normal text-slate-600",
                ].join(" ")}>{p}</button>
            ))
          })()}

          {[
            { label: "›", action: () => setCurrentPage(p => Math.min(totalPages, p + 1)), disabled: currentPage >= totalPages },
            { label: "»", action: () => setCurrentPage(totalPages || 1),                  disabled: currentPage >= totalPages },
          ].map(({ label, action, disabled }) => (
            <button key={label} onClick={action} disabled={disabled}
              className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 cursor-pointer disabled:cursor-not-allowed disabled:text-slate-300">{label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}


