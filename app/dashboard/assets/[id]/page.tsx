
"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import AssignTreeSelector from "@/components/AssignTreeSelector"
import OrgTree from "@/components/workorders/OrgTree"
import AssetQRLabel from "@/components/AssetQRLabel"
import { getCategoryBadge } from "@/lib/assetCategories"
import { DEFAULT_CUSTOM_FIELDS } from "@/lib/customFields"
import { computeDepreciation, formatCurrency } from "@/lib/depreciation"
import { useTree } from "@/components/useTree"
import { useToast } from "@/components/ToastProvider"
import { useConfirm } from "@/components/ConfirmProvider"
import Modal from "@/components/Modal"
import { useBreadcrumbs } from "@/context/BreadcrumbContext"
import BreadcrumbBar from "@/components/BreadcrumbBar"
import { CameraModal } from "@/components/CameraModal"
import { ASSIGNABLE_TYPES } from "@/lib/orgStructure"

export default function AssetDetails() {
  const { tree, reloadTree } = useTree()

  const [asset, setAsset] = useState<any>(null)
  const [selectedNode, setSelectedNode] = useState("")
  const [role, setRole] = useState<string | null>(null)

  const pathMap = tree ? buildPathMap(tree) : {}
  const [assignedAssetsMap, setAssignedAssetsMap] = useState<any>({})
  const [woTitle, setWoTitle] = useState("")
  const [woPriority, setWoPriority] = useState("MEDIUM")
  const [woScheduledAt, setWoScheduledAt] = useState("")
  const [woOrgUnitId, setWoOrgUnitId] = useState("")
  const [creatingWo, setCreatingWo] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  // Camera capture: desktop webcam modal vs native mobile capture input.
  const [showCamera, setShowCamera] = useState(false)
  const mobileCameraRef = useRef<HTMLInputElement>(null)
  /**
   * Holds the live MediaStream while the webcam modal is open (lifted ref —
   * same pattern as PersonalInfoForm) so it can be killed directly on unmount.
   */
  const activeCameraStream = useRef<MediaStream | null>(null)
  const isMobile = typeof window !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  const [customFields, setCustomFields] = useState<Record<string, any>>({})
  const [savingCustomFields, setSavingCustomFields] = useState(false)

  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id

  const { showToast } = useToast()
  const confirm = useConfirm()
  const { breadcrumbs, setBreadcrumbs, pushCrumb } = useBreadcrumbs()  // ← added breadcrumbs + setBreadcrumbs

  async function loadAsset() {
    // Fetch the single asset directly. This used to pull the ENTIRE asset list
    // (capped at 2000 rows) and .find() the record in the browser, which meant
    // the detail page rendered nothing for any asset outside that first slice —
    // i.e. for all but ~0.2% of a 1M-row inventory.
    const res = await fetch(`/api/assets/${id}`)
    if (!res.ok) { setAsset(null); return }
    const found = await res.json()
    setAsset(found)
    if (found?.orgUnit?.id) setWoOrgUnitId(found.orgUnit.id)
  }

  async function loadUser() {
    const res = await fetch("/api/auth/me")
    const data = await res.json()
    setRole(data.role)
  }

  async function loadAssignments() {
    try {
      const res = await fetch("/api/assets/assigned-map")
      const data = await res.json()
      console.log("Assigned map:", data)
      setAssignedAssetsMap(data || {})
    } catch (err) {
      console.error("Failed to load assignments", err)
    }
  }

  useEffect(() => {
    loadAsset()
    loadUser()
    loadAssignments()
  }, [])

  useEffect(() => {
    if (!id) return
    setHistoryLoading(true)
    fetch(`/api/assets/${id}/history`)
      .then(r => r.ok ? r.json() : { entries: [] })
      .then(data => setHistory(data.entries || []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))
    fetch(`/api/assets/${id}/custom-fields`)
      .then(r => r.ok ? r.json() : { customFields: {} })
      .then(data => setCustomFields(data.customFields || {}))
      .catch(() => {})
  }, [id])

  // ── push asset crumb; if context is empty (direct navigation),
  //    seed the full org path first so the bar is never blank ──
 
  useEffect(() => {
  if (!asset || !tree) return

  const assetCrumb = {
    id: asset.id,
    name: asset.tagNumber || asset.serialNumber || "Asset",
    type: "ASSET"
  }

  // Direct navigation
  if (breadcrumbs.length === 0 && asset.orgUnit?.id) {
    const orgPath = findPath(tree, asset.orgUnit.id)

    if (orgPath) {
      setBreadcrumbs([
        ...orgPath,
        assetCrumb
      ])
      return
    }
  }

  // Prevent duplicate asset crumb
  const alreadyExists = breadcrumbs.some(
    (c: any) => c.id === asset.id
  )

  if (!alreadyExists) {
    pushCrumb(assetCrumb)
  }

}, [
  asset,
  tree,
  breadcrumbs,
  pushCrumb,
  setBreadcrumbs
])

  const assignSingle = async () => {
    if (!selectedNode) {
      showToast("Please select a target organizational unit", "error")
      return
    }

    if (asset?.orgUnit?.id === selectedNode) {
      const selectedPath = pathMap[selectedNode]
      const selectedName = selectedPath
        ? selectedPath.slice(-3).map((n: any) => n.name).join(" / ")
        : selectedNode
      showToast(`Asset is already within ${selectedName}`, "error")
      return
    }

    const res = await fetch("/api/assets/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: id,
        targetOrgUnitId: selectedNode
      })
    })

    const selectedPath = pathMap[selectedNode]
    const selectedName = selectedPath
      ? selectedPath.slice(-3).map((n: any) => n.name).join(" / ")
      : selectedNode

    const data = await res.json()

    if (!res.ok) {
      showToast("Assignment failed", "error")
      return
    }

    showToast(`Asset assigned successfully to ${selectedName}`, "success")

    await reloadTree()
    await loadAssignments()
    setSelectedNode("")
  }

  // ── Create a work order linked to this asset (snapshot captured server-side) ──
  const createWorkOrder = async () => {
    if (!woOrgUnitId) { showToast("Select an org unit for the work order", "error"); return }
    const title = woTitle.trim() || `Maintenance — ${asset.tagNumber || asset.serialNumber || asset.id.slice(0, 8)}`
    setCreatingWo(true)
    try {
      const res = await fetch("/api/workorders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          orgUnitId: woOrgUnitId,
          assetId: asset.id,
          priority: woPriority,
          scheduledAt: woScheduledAt || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || "Failed to create work order", "error"); return }
      showToast(`Work order created: ${data.workOrderNo || data.id?.slice(0, 8)}`, "success")
      setWoTitle(""); setWoPriority("MEDIUM"); setWoScheduledAt("")
    } catch {
      showToast("Failed to create work order", "error")
    } finally {
      setCreatingWo(false)
    }
  }

  // ── Upload photo ──────────────────────────────────────────────────────────
  // Shared by the file input, the mobile native camera input and the desktop
  // webcam modal — all three paths end up here with a File.
  async function uploadPhotoFile(file: File) {
    if (!asset) return
    setUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append("photo", file)
      const res = await fetch(`/api/assets/${asset.id}/photo`, { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || "Upload failed", "error"); return }
      setAsset({ ...asset, photoUrl: data.photoUrl })
      showToast("Photo uploaded", "success")
    } catch { showToast("Upload failed", "error") }
    finally { setUploadingPhoto(false) }
  }

  function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset so the same file can be re-selected after a remove/retry.
    e.target.value = ""
    if (file) uploadPhotoFile(file)
  }

  // ── Camera capture ────────────────────────────────────────────────────────
  function openCamera() {
    // On mobile, the native camera input is smoother than getUserMedia
    // (same approach as the profile photo form). `capture="environment"`
    // opens the rear camera — what you point at an asset.
    if (isMobile) {
      mobileCameraRef.current?.click()
    } else {
      setShowCamera(true)
    }
  }

  async function onCameraCapture(file: File) {
    setShowCamera(false)
    await uploadPhotoFile(file)
  }

  // Safety: kill the webcam stream if this page unmounts while the modal is open.
  useEffect(() => () => {
    activeCameraStream.current?.getTracks().forEach(t => t.stop())
    activeCameraStream.current = null
  }, [])

  async function removePhoto() {
    if (!asset) return
    await fetch(`/api/assets/${asset.id}/photo`, { method: "DELETE" })
    setAsset({ ...asset, photoUrl: null })
    showToast("Photo removed", "success")
  }

  // ── Asset checkout to individual ──────────────────────────────────────────
  const [checkoutUserId, setCheckoutUserId] = useState("")
  const [users, setUsers] = useState<any[]>([])

  useEffect(() => {
    fetch("/api/users/assignable").then(r => r.ok ? r.json() : []).then(setUsers).catch(() => {})
  }, [])

  async function checkoutAsset() {
    if (!asset || !checkoutUserId) { showToast("Select a user", "error"); return }
    const res = await fetch(`/api/assets/${asset.id}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "checkout", userId: checkoutUserId }),
    })
    const data = await res.json()
    if (!res.ok) { showToast(data.error || "Checkout failed", "error"); return }
    setAsset({ ...asset, checkedOut: true, assignedToId: checkoutUserId })
    showToast("Asset checked out", "success")
  }

  async function checkinAsset() {
    if (!asset) return
    const res = await fetch(`/api/assets/${asset.id}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "checkin" }),
    })
    const data = await res.json()
    if (!res.ok) { showToast(data.error || "Check-in failed", "error"); return }
    setAsset({ ...asset, checkedOut: false, assignedToId: null, startedAt: null })
    showToast("Asset checked in", "success")
  }

  // ── Save custom fields ────────────────────────────────────────────────────
  async function saveCustomFields() {
    if (!asset) return
    setSavingCustomFields(true)
    try {
      const res = await fetch(`/api/assets/${asset.id}/custom-fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customFields }),
      })
      if (!res.ok) { showToast("Failed to save custom fields", "error"); return }
      showToast("Custom fields saved", "success")
    } catch { showToast("Failed", "error") }
    finally { setSavingCustomFields(false) }
  }

  // ── Asset retirement ──────────────────────────────────────────────────────
  const [showRetireForm, setShowRetireForm] = useState(false)
  const [retireReason, setRetireReason] = useState("")
  const [retireMethod, setRetireMethod] = useState("STORED")

  async function retireAsset() {
    if (!asset || !retireReason) { showToast("Reason required", "error"); return }
    if (!(await confirm({
      message: `Retire asset ${asset.tagNumber || asset.serialNumber}? This will mark it as inactive and non-operational.`,
      confirmLabel: "Retire asset",
    }))) return
    const res = await fetch(`/api/assets/${asset.id}/retire`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: retireReason, disposalMethod: retireMethod }),
    })
    const data = await res.json()
    if (!res.ok) { showToast(data.error || "Failed", "error"); return }
    setAsset({ ...asset, active: false, operational: false })
    setShowRetireForm(false)
    showToast("Asset retired", "success")
  }

  async function reactivateAsset() {
    if (!asset) return
    if (!(await confirm({
      message: "Reactivate this retired asset?",
      tone: "default",
      confirmLabel: "Reactivate",
    }))) return
    const res = await fetch(`/api/assets/${asset.id}/retire`, { method: "PATCH" })
    if (res.ok) {
      setAsset({ ...asset, active: true, operational: true })
      showToast("Asset reactivated", "success")
    }
  }

  // ── Print QR label ────────────────────────────────────────────────────────
  const [showQR, setShowQR] = useState(false)

  function printLabel() {
    const label = document.getElementById("qr-label")
    if (!label) return
    const w = window.open("", "_blank", "width=400,height=500")
    if (!w) return
    w.document.write(`
      <html><head><title>Asset Label - ${asset?.tagNumber || ""}</title>
      <style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:system-ui,sans-serif}</style>
      </head><body>${label.outerHTML}</body></html>
    `)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 250)
  }

  if (!asset) return <p className="p-6">Loading...</p>

  // Area (Political Admin) = the REGION or ZONE where the asset is located
  const assetPath = asset.orgUnit?.id ? pathMap[asset.orgUnit.id] : undefined
  const areaNode =
    assetPath?.find((n: any) => n.type === "REGION") ||
    assetPath?.find((n: any) => n.type === "ZONE")
  const politicalArea = areaNode?.name || "—"

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── BREADCRUMB BAR ── */}
      <BreadcrumbBar />

      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Asset Details</h1>
          <button
            onClick={() => setShowQR(!showQR)}
            className="px-3 py-1.5 bg-gray-800 text-white rounded text-sm font-medium hover:bg-gray-700"
          >
            {showQR ? "Hide Label" : "QR Label"}
          </button>
        </div>

        {showQR && asset && (
          <Modal
            open={showQR && !!asset}
            onClose={() => setShowQR(false)}
            title="QR Label"
            footer={
              <button
                onClick={printLabel}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-500"
              >
                Print Label
              </button>
            }
          >
            <div className="flex flex-col items-center gap-3">
              <AssetQRLabel
                tagNumber={asset.tagNumber || ""}
                serialNumber={asset.serialNumber || ""}
                itemCode={asset.itemCode || ""}
                description={asset.assetDescription || asset.itemCodeDescription || ""}
                baseUrl={typeof window !== "undefined" ? window.location.origin : ""}
                assetId={asset.id}
              />
            </div>
          </Modal>
        )}

        {/* Asset photo */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-sm font-bold mb-2">Asset Photo</h2>
          {asset.photoUrl ? (
            <div className="flex flex-col items-center gap-3">
              <img src={asset.photoUrl} alt="Asset" className="max-w-full rounded shadow" style={{ maxHeight: 300 }} />
              <button onClick={removePhoto} className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded text-sm font-medium hover:bg-red-100">
                Remove Photo
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="text-gray-300 text-4xl">📷</div>
              <div className="flex gap-2">
                <label className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold cursor-pointer hover:bg-blue-500">
                  {uploadingPhoto ? "Uploading..." : "Upload Photo"}
                  <input type="file" accept="image/*" onChange={uploadPhoto} className="hidden" disabled={uploadingPhoto} />
                </label>
                <button
                  onClick={openCamera}
                  disabled={uploadingPhoto}
                  className="px-4 py-2 bg-white border border-blue-600 text-blue-600 rounded text-sm font-semibold hover:bg-blue-50 disabled:opacity-50"
                >
                  Take Photo
                </button>
              </div>
              <p className="text-xs text-gray-400">JPG, PNG, GIF · max 4MB</p>
            </div>
          )}
          {/* Hidden native camera input — used on mobile, where it opens the
              camera app directly (rear camera, for pointing at assets). */}
          <input
            ref={mobileCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={uploadPhoto}
            disabled={uploadingPhoto}
          />
        </div>

        {/* Webcam capture modal — desktop path of the Take Photo button. */}
        {showCamera && (
          <CameraModal
            activeStreamRef={activeCameraStream}
            onCapture={onCameraCapture}
            onClose={() => setShowCamera(false)}
          />
        )}

        {/* Asset checkout to individual */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-sm font-bold mb-2">Checkout to Individual</h2>
          {asset.checkedOut ? (
            <div className="flex items-center justify-between">
              <div>
                <span className="inline-flex items-center gap-2 px-3 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded text-sm font-medium">
                  🔒 Checked Out
                </span>
                <span className="text-sm text-gray-500 ml-2">
                  to {users.find(u => u.id === asset.assignedToId)?.name || "Unknown user"}
                </span>
                {asset.startedAt && (
                  <span className="text-xs text-gray-400 ml-2">
                    since {new Date(asset.startedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <button onClick={checkinAsset} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-500">
                Check In
              </button>
            </div>
          ) : (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs font-semibold text-gray-600 block mb-1">Assign to user</label>
                <select value={checkoutUserId} onChange={e => setCheckoutUserId(e.target.value)} className="px-3 py-2 border rounded text-sm w-full">
                  <option value="">— Select user —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </select>
              </div>
              <button onClick={checkoutAsset} disabled={!checkoutUserId} className="px-4 py-2 bg-orange-600 text-white rounded text-sm font-semibold disabled:opacity-50 hover:bg-orange-500">
                Check Out
              </button>
            </div>
          )}
        </div>

        {/* ✅ ASSET ID ADDED */}

        {/* Warranty status card */}
        {asset.warrantyExpiration && (
          <div className="bg-white p-3 rounded shadow flex items-center gap-3">
            {(() => {
              const expiry = new Date(asset.warrantyExpiration)
              const now = new Date()
              const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
              let color = "#10b981", bg = "#ecfdf5", label = "Under Warranty", detail = `${daysLeft} days remaining`
              if (daysLeft < 0) { color = "#ef4444"; bg = "#fef2f2"; label = "Warranty Expired"; detail = `${Math.abs(daysLeft)} days ago` }
              else if (daysLeft <= 30) { color = "#f59e0b"; bg = "#fffbeb"; label = "Expiring Soon"; detail = `${daysLeft} days remaining` }
              return (
                <>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color }}>{label}</span>
                    <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>
                      Expires: {expiry.toLocaleDateString()} ({detail})
                    </span>
                  </div>
                </>
              )
            })()}
          </div>
        )}
        

        <div className="bg-white p-4 rounded shadow">
  {[
    { label: "Asset ID",              value: asset.id,                 mono: true  },
    { label: "Asset Group (Item Code)", value: asset.itemCode,         mono: true  },
    { label: "Item Code Description", value: asset.itemCodeDescription            },
    { label: "Tag Number",            value: asset.tagNumber,          mono: true, mandatory: true },
    { label: "Serial Number",         value: asset.serialNumber,       mono: true  },
    { label: "Asset Description",     value: asset.assetDescription                },
    { label: "Category",              value: asset.category ? (() => {
        const badge = getCategoryBadge(asset.category)
        return `${badge.icon} ${asset.category} (${badge.label})`
      })() : null, chip: true  },
    { label: "Owning Department",     value: asset.orgUnit?.id ? formatOwningDepartment(pathMap[asset.orgUnit.id]) : asset.owningDepartment },
    { label: "Criticality",           value: asset.criticality,        criticality: true },
    { label: "WIP Acct Class",        value: asset.wipClass                        },
    { label: "Area (Political Admin)",value: politicalArea },
                     
    { label: "Maintainable",          value: asset.maintainable,       bool: true  },
    { label: "Active",                value: asset.active,             bool: true  },
    { label: "Production Org",        value: asset.productionOrg                   },
    { label: "Equipment Item",        value: asset.equipmentItem                   },
    { label: "EQP Serial Number",     value: asset.eqpSerial,          mono: true  },
    { label: "Fixed Asset Category",  value: asset.faCategory                      },
    { label: "Fixed Asset Number",    value: asset.faNumber,           mono: true  },
    { label: "Parent Asset Number",   value: asset.parentAsset,        mono: true  },
    { label: "Parent Asset Serial",   value: asset.parentSerial,       mono: true  },
    { label: "Property Location Name",value: asset.locationName                    },
    { label: "Property Location Code",value: asset.locationCode,       mono: true  },
    { label: "Address",               value: asset.address                         },
    { label: "Warranty Expiration",   value: asset.warrantyExpiration              },
    { label: "Checked Out",           value: asset.checkedOut,         bool: true  },
    { label: "FA Synchronized",       value: asset.faSynced,           bool: true  },
    { label: "Operational Flag",      value: asset.operational,        bool: true  },
    { label: "[ ] Custom Flag",       value: asset.customFlag,         bool: true  },
    { label: "Wireless Site ID",      value: asset.wirelessSiteId,     mono: true  },
  ].map(({ label, value, mono, bool, chip, criticality, mandatory }) => (
    <div
  key={label}
  style={{
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    padding: "5px 0",
    borderBottom: "1px solid #f1f5f9",
    minWidth: 0,
    flexWrap: "wrap"
  }}
>
      <span style={{ minWidth: 140, fontSize: 12, color: "#64748b", flexShrink: 0 }}>
        {label}{mandatory && <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>}
      </span>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
      {bool ? (
        value === true  ? <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 4, padding: "1px 8px" }}>Yes</span>
        : value === false ? <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 4, padding: "1px 8px" }}>No</span>
        : <span style={{ color: "#cbd5e1" }}>—</span>
      ) : chip ? (
        value ? <span style={{ fontSize: 11, fontWeight: 600, background: "#7c3aed15", color: "#7c3aed", border: "1px solid #7c3aed30", borderRadius: 4, padding: "1px 8px" }}>{String(value)}</span>
              : <span style={{ color: "#cbd5e1" }}>—</span>
      ) : criticality ? (
        value ? <span style={{
          fontSize: 11, fontWeight: 700, borderRadius: 4, padding: "1px 8px",
          color:       String(value) === "HIGH" ? "#ef4444" : String(value) === "MEDIUM" ? "#f59e0b" : "#22c55e",
          background:  String(value) === "HIGH" ? "#fef2f2" : String(value) === "MEDIUM" ? "#fffbeb" : "#f0fdf4",
          border: `1px solid ${String(value) === "HIGH" ? "#fca5a5" : String(value) === "MEDIUM" ? "#fcd34d" : "#bbf7d0"}`,
        }}>{String(value)}</span>
              : <span style={{ color: "#cbd5e1" }}>—</span>
      ) : mono ? (
        <span style={{ fontFamily: "monospace", fontSize: 12, color: value ? "#0f172a" : "#cbd5e1" }}>{value ? String(value) : "—"}</span>
      ) : (
        <span style={{ fontSize: 12, color: value ? "#334155" : "#cbd5e1" }}>{value ? String(value) : "—"}</span>
      )}
      </div>
    </div>
  ))}
</div>


        {tree && (
          <div
  className="bg-white p-4 rounded shadow grid grid-cols-1 md:grid-cols-2 gap-6"
>

            
            <AssignTreeSelector
  tree={tree}
  assignableTypes={ASSIGNABLE_TYPES}
  onSelect={setSelectedNode}
  assignedAssetsMap={assignedAssetsMap}
/>

          </div>
        )}
        
            <button
              onClick={assignSingle}
              className="mt-3 px-4 py-2 bg-green-600 text-white rounded"
            >
              Assign Asset
            </button>

            {/* ── Create Work Order from this asset ── */}
            <div className="mt-6 bg-white p-4 rounded shadow">
              <h2 className="text-sm font-bold mb-1">Create Work Order from this Asset</h2>
              <p className="text-xs text-gray-500 mb-3">
                Opens a work order linked to this asset. The asset's details are snapshotted into the order.
              </p>
              <div className="flex flex-col gap-2">
                <input
                  value={woTitle}
                  onChange={e => setWoTitle(e.target.value)}
                  placeholder={`Title (default: Maintenance — ${asset.tagNumber || asset.serialNumber || ""})`}
                  className="px-3 py-2 border rounded text-sm"
                />
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Org Unit for Work Order *</label>
                  <div className="border rounded max-h-48 overflow-y-auto p-2 bg-gray-50">
                    {tree && <OrgTree node={tree} selected={woOrgUnitId} onSelect={setWoOrgUnitId} />}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Defaults to the asset's org unit — click to change.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={woPriority}
                    onChange={e => setWoPriority(e.target.value)}
                    className="px-2 py-2 border rounded text-sm"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                  <input
                    type="date"
                    value={woScheduledAt}
                    onChange={e => setWoScheduledAt(e.target.value)}
                    className="px-2 py-2 border rounded text-sm"
                  />
                  <button
                    onClick={createWorkOrder}
                    disabled={creatingWo}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold disabled:opacity-50"
                  >
                    {creatingWo ? "Creating…" : "Create Work Order"}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Custom Fields ── */}
            <div className="mt-6 bg-white p-4 rounded shadow">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold">Custom Fields</h2>
                <button
                  onClick={saveCustomFields}
                  disabled={savingCustomFields}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-semibold disabled:opacity-50"
                >
                  {savingCustomFields ? "Saving..." : "Save"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {DEFAULT_CUSTOM_FIELDS.map(field => (
                  <div key={field.id}>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">{field.label}</label>
                    {field.type === "boolean" ? (
                      <select
                        value={customFields[field.name] ?? "false"}
                        onChange={e => setCustomFields({ ...customFields, [field.name]: e.target.value === "true" })}
                        className="px-3 py-2 border rounded text-sm w-full"
                      >
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </select>
                    ) : (
                      <input
                        type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                        value={customFields[field.name] ?? ""}
                        onChange={e => setCustomFields({ ...customFields, [field.name]: e.target.value })}
                        className="px-3 py-2 border rounded text-sm w-full"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Depreciation ── */}
            {asset.purchaseCost && (
              <div className="mt-6 bg-white p-4 rounded shadow">
                <h2 className="text-sm font-bold mb-3">Depreciation (Straight-Line)</h2>
                {(() => {
                  const dep = computeDepreciation(asset.purchaseCost, asset.purchaseDate, 5)
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 bg-gray-50 rounded">
                        <div className="text-xs text-gray-500">Purchase Cost</div>
                        <div className="text-sm font-bold">{formatCurrency(dep.purchaseCost)}</div>
                        {asset.purchaseDate && (
                          <div className="text-xs text-gray-400">{new Date(asset.purchaseDate).toLocaleDateString()}</div>
                        )}
                      </div>
                      <div className="p-3 bg-blue-50 rounded">
                        <div className="text-xs text-gray-500">Annual Depreciation</div>
                        <div className="text-sm font-bold text-blue-700">{formatCurrency(dep.annualDepreciation)}</div>
                      </div>
                      <div className="p-3 bg-orange-50 rounded">
                        <div className="text-xs text-gray-500">Accumulated</div>
                        <div className="text-sm font-bold text-orange-700">{formatCurrency(dep.accumulatedDepreciation)}</div>
                        <div className="text-xs text-gray-400">{dep.yearsElapsed} yrs elapsed</div>
                      </div>
                      <div className={`p-3 rounded ${dep.fullyDepreciated ? "bg-red-50" : "bg-green-50"}`}>
                        <div className="text-xs text-gray-500">Book Value</div>
                        <div className={`text-sm font-bold ${dep.fullyDepreciated ? "text-red-700" : "text-green-700"}`}>
                          {formatCurrency(dep.bookValue)}
                        </div>
                        <div className="text-xs text-gray-400">
                          {dep.fullyDepreciated ? "Fully depreciated" : `${dep.yearsRemaining} yrs remaining`}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ── Asset Retirement ── */}
            <div className="mt-6 bg-white p-4 rounded shadow">
              <h2 className="text-sm font-bold mb-3">Asset Lifecycle</h2>
              {asset.active ? (
                <div>
                  <button
                    onClick={() => setShowRetireForm(!showRetireForm)}
                    className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded text-sm font-medium hover:bg-red-100"
                  >
                    {showRetireForm ? "Cancel" : "Retire / Dispose Asset"}
                  </button>
                  {showRetireForm && (
                    <Modal
                      open={showRetireForm}
                      onClose={() => setShowRetireForm(false)}
                      title="Retire / Dispose Asset"
                      footer={
                        <>
                          <button type="button" onClick={() => setShowRetireForm(false)} className="px-3 py-1.5 border rounded text-sm">Cancel</button>
                          <button onClick={retireAsset} className="px-4 py-2 bg-red-600 text-white rounded text-sm font-semibold">Confirm Retirement</button>
                        </>
                      }
                    >
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-600 block mb-1">Reason *</label>
                          <select value={retireReason} onChange={e => setRetireReason(e.target.value)} className="px-3 py-2 border rounded text-sm w-full">
                            <option value="">— Select reason —</option>
                            <option value="End of life">End of life</option>
                            <option value="Beyond repair">Beyond repair</option>
                            <option value="Obsolete">Obsolete</option>
                            <option value="Lost or stolen">Lost or stolen</option>
                            <option value="Transferred out">Transferred out</option>
                            <option value="Donated">Donated</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-600 block mb-1">Disposal Method</label>
                          <select value={retireMethod} onChange={e => setRetireMethod(e.target.value)} className="px-3 py-2 border rounded text-sm w-full">
                            <option value="STORED">Stored (warehouse)</option>
                            <option value="SOLD">Sold</option>
                            <option value="DONATED">Donated</option>
                            <option value="SCRAPPED">Scrapped</option>
                            <option value="RECYCLED">Recycled</option>
                            <option value="DISPOSED">Disposed</option>
                          </select>
                        </div>
                      </div>
                    </Modal>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded text-sm font-medium">
                      ⛔ Retired
                    </span>
                    {customFields?._retirement && (
                      <span className="text-xs text-gray-500">
                        {customFields._retirement.reason} · {customFields._retirement.disposalMethod} ·
                        {new Date(customFields._retirement.retiredAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <button onClick={reactivateAsset} className="px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded text-sm font-medium hover:bg-green-100">
                    Reactivate
                  </button>
                </div>
              )}
            </div>

            {/* ── Asset History Timeline ── */}
            <div className="mt-6 bg-white p-4 rounded shadow">
              <h2 className="text-sm font-bold mb-3">Asset History Timeline</h2>
              {historyLoading ? (
                <p className="text-xs text-gray-400">Loading history...</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-gray-400">No history recorded yet.</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {history.map((entry, i) => {
                    const colors: Record<string, string> = {
                      created: "#10b981",
                      assignment: "#3b82f6",
                      audit: "#6b7280",
                      wo_created: "#8b5cf6",
                      wo_checkout: "#f59e0b",
                      wo_started: "#06b6d4",
                      wo_completed: "#10b981",
                      wo_archived: "#9ca3af",
                    }
                    const color = colors[entry.type] || "#6b7280"
                    const date = new Date(entry.date).toLocaleString()
                    return (
                      <div key={i} className="flex gap-3" style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold" style={{ color }}>{entry.title}</span>
                          </div>
                          {entry.description && (
                            <p className="text-xs text-gray-500 mt-0.5">{entry.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-gray-400">{date}</span>
                            {entry.user && (
                              <span className="text-xs text-gray-400">by {entry.user}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
      </div>
    </div>
  )
}

/* ---------------- HELPERS — unchanged ---------------- */


function formatOwningDepartment(pathNodes: any[]) {
  if (!pathNodes) return "-"
  const node = (type: string) => pathNodes.find((n) => n.type === type)
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



function buildPathMap(tree: any, path: any[] = [], map: any = {}) {
  if (!tree) return map
  const currentPath = [...path, tree]
  map[tree.id] = currentPath
  for (const child of tree.children || []) {
    buildPathMap(child, currentPath, map)
  }
  return map
}

// ← added: needed to seed breadcrumbs on direct navigation
function findPath(node: any, targetId: string, path: any[] = []): any[] | null {
  if (!node) return null
  const newPath = [...path, { id: node.id, name: node.name, type: node.type }]
  if (node.id === targetId) return newPath
  if (node.children) {
    for (const child of node.children) {
      const result = findPath(child, targetId, newPath)
      if (result) return result
    }
  }
  return null
}
