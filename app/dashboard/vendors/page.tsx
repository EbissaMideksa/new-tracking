"use client"

import { useEffect, useState } from "react"
import { useToast } from "@/components/ToastProvider"
import { useConfirm } from "@/components/ConfirmProvider"
import Modal from "@/components/Modal"

export default function VendorsPage() {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: "", contactName: "", email: "", phone: "", address: "", notes: "",
  })

  async function load() {
    try {
      const res = await fetch("/api/vendors")
      if (!res.ok) return
      const data = await res.json()
      setVendors(data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function resetForm() {
    setForm({ name: "", contactName: "", email: "", phone: "", address: "", notes: "" })
    setEditingId(null)
    setShowForm(false)
  }

  async function save() {
    if (!form.name) { showToast("Name required", "error"); return }
    try {
      if (editingId) {
        const res = await fetch(`/api/vendors/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        if (!res.ok) { showToast("Update failed", "error"); return }
        showToast("Vendor updated", "success")
      } else {
        const res = await fetch("/api/vendors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        if (!res.ok) { showToast("Create failed", "error"); return }
        showToast("Vendor created", "success")
      }
      resetForm()
      load()
    } catch { showToast("Failed", "error") }
  }

  function edit(v: any) {
    setForm({
      name: v.name, contactName: v.contactName || "", email: v.email || "",
      phone: v.phone || "", address: v.address || "", notes: v.notes || "",
    })
    setEditingId(v.id)
    setShowForm(true)
  }

  async function remove(id: string) {
    if (!(await confirm({ message: "Delete this vendor?", confirmLabel: "Delete vendor" }))) return
    await fetch(`/api/vendors/${id}`, { method: "DELETE" })
    showToast("Vendor deleted", "success")
    load()
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Vendors & Suppliers</h1>
        <button onClick={() => { resetForm(); setShowForm(!showForm) }} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
          {showForm ? "Cancel" : "+ New Vendor"}
        </button>
      </div>

      {showForm && (
        <Modal
          open={showForm}
          onClose={resetForm}
          title={editingId ? "Edit Vendor" : "New Vendor"}
          footer={
            <>
              <button type="button" onClick={resetForm} className="px-3 py-1.5 border rounded text-sm">Cancel</button>
              <button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold">
                {editingId ? "Update Vendor" : "Create Vendor"}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded text-sm w-full" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Contact Person</label>
                <input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} className="px-3 py-2 border rounded text-sm w-full" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Email</label>
                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="px-3 py-2 border rounded text-sm w-full" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Phone</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="px-3 py-2 border rounded text-sm w-full" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Address</label>
              <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="px-3 py-2 border rounded text-sm w-full" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="px-3 py-2 border rounded text-sm w-full" />
            </div>
          </div>
        </Modal>
      )}

      {vendors.length === 0 ? (
        <div className="bg-white p-8 rounded shadow text-center text-gray-400">
          No vendors yet. Click "+ New Vendor" to add one.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {vendors.map(v => (
            <div key={v.id} className="bg-white p-4 rounded shadow">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-sm">{v.name}</h3>
                  {v.contactName && <p className="text-xs text-gray-500">{v.contactName}</p>}
                </div>
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{v._count?.assets || 0} assets</span>
              </div>
              <div className="mt-2 space-y-1 text-xs text-gray-500">
                {v.email && <p>✉️ {v.email}</p>}
                {v.phone && <p>📞 {v.phone}</p>}
                {v.address && <p>📍 {v.address}</p>}
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => edit(v)} className="px-3 py-1 text-xs border rounded hover:bg-gray-50">Edit</button>
                <button onClick={() => remove(v.id)} className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
