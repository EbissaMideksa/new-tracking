"use client"

import { useEffect, useState } from "react"
import { useToast } from "@/components/ToastProvider"
import { useConfirm } from "@/components/ConfirmProvider"
import Modal from "@/components/Modal"
import { DEFAULT_WO_TEMPLATES } from "@/lib/woTemplates"

export default function MaintenanceSchedulesPage() {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // form state
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [intervalDays, setIntervalDays] = useState(90)
  const [priority, setPriority] = useState("MEDIUM")
  const [orgUnitId, setOrgUnitId] = useState("")
  const [assetId, setAssetId] = useState("")
  const [templateId, setTemplateId] = useState("")

  async function load() {
    try {
      const res = await fetch("/api/maintenance-schedules")
      if (!res.ok) return
      const data = await res.json()
      setSchedules(data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function applyTemplate(id: string) {
    setTemplateId(id)
    const tpl = DEFAULT_WO_TEMPLATES.find(t => t.id === id)
    if (tpl) {
      setTitle(tpl.title)
      setDescription(tpl.description)
      setPriority(tpl.priority)
    }
  }

  async function createSchedule() {
    if (!title || !orgUnitId) { showToast("Title and org unit required", "error"); return }
    try {
      const res = await fetch("/api/maintenance-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, templateId, assetId, orgUnitId, intervalDays, priority }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || "Failed", "error"); return }
      showToast("Schedule created", "success")
      setTitle(""); setDescription(""); setShowForm(false)
      load()
    } catch { showToast("Failed", "error") }
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/maintenance-schedules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    })
    load()
  }

  async function deleteSchedule(id: string) {
    if (!(await confirm({ message: "Delete this schedule?", confirmLabel: "Delete schedule" }))) return
    await fetch(`/api/maintenance-schedules/${id}`, { method: "DELETE" })
    load()
  }

  async function runNow() {
    const res = await fetch("/api/maintenance-schedules/run", { method: "POST" })
    const data = await res.json()
    showToast(`Checked ${data.checked} schedules, created ${data.created} work orders`, "success")
    load()
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Preventive Maintenance Schedules</h1>
        <div className="flex gap-2">
          <button onClick={runNow} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium">Run Now</button>
          <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
            {showForm ? "Cancel" : "+ New Schedule"}
          </button>
        </div>
      </div>

      {showForm && (
        <Modal
          open={showForm}
          onClose={() => setShowForm(false)}
          title="New Schedule"
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded text-sm">Cancel</button>
              <button onClick={createSchedule} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold">Create Schedule</button>
            </>
          }
        >
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Template (optional)</label>
            <select value={templateId} onChange={e => applyTemplate(e.target.value)} className="px-3 py-2 border rounded text-sm w-full">
              <option value="">— Select template —</option>
              {DEFAULT_WO_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="px-3 py-2 border rounded text-sm w-full" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} className="px-3 py-2 border rounded text-sm w-full" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Interval (days) *</label>
              <input type="number" value={intervalDays} onChange={e => setIntervalDays(parseInt(e.target.value) || 90)} className="px-3 py-2 border rounded text-sm w-full" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className="px-3 py-2 border rounded text-sm w-full">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Org Unit ID *</label>
            <input value={orgUnitId} onChange={e => setOrgUnitId(e.target.value)} placeholder="Paste org unit ID" className="px-3 py-2 border rounded text-sm w-full font-mono" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Asset ID (optional)</label>
            <input value={assetId} onChange={e => setAssetId(e.target.value)} placeholder="Paste asset ID" className="px-3 py-2 border rounded text-sm w-full font-mono" />
          </div>
        </Modal>
      )}

      {schedules.length === 0 ? (
        <div className="bg-white p-8 rounded shadow text-center text-gray-400">
          No maintenance schedules yet. Click "+ New Schedule" to create one.
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map(s => (
            <div key={s.id} className="bg-white p-4 rounded shadow flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{s.title}</span>
                  {s.active ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Active</span>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Paused</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Every {s.intervalDays} days · Next: {new Date(s.nextRunAt).toLocaleDateString()}
                  {s.lastRunAt && ` · Last: ${new Date(s.lastRunAt).toLocaleDateString()}`}
                  {s.asset && ` · Asset: ${s.asset.tagNumber || s.asset.serialNumber}`}
                  {s.orgUnit && ` · ${s.orgUnit.name}`}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleActive(s.id, s.active)} className="px-3 py-1 text-xs border rounded hover:bg-gray-50">
                  {s.active ? "Pause" : "Resume"}
                </button>
                <button onClick={() => deleteSchedule(s.id)} className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
