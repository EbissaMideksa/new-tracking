"use client"

import { useEffect, useState } from "react"
import { useToast } from "@/components/ToastProvider"
import { useConfirm } from "@/components/ConfirmProvider"

export default function ApiKeysPage() {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [keys, setKeys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")
  const [newKeyResult, setNewKeyResult] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch("/api/api-keys")
      if (!res.ok) return
      setKeys(await res.json())
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function createKey() {
    if (!newName) { showToast("Name required", "error"); return }
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    })
    const data = await res.json()
    if (!res.ok) { showToast(data.error || "Failed", "error"); return }
    setNewKeyResult(data.key)
    setNewName("")
    showToast("API key created", "success")
    load()
  }

  async function deleteKey(id: string) {
    if (!(await confirm({
      message: "Delete this API key? External integrations using it will stop working.",
      confirmLabel: "Delete key",
    }))) return
    await fetch(`/api/api-keys?id=${id}`, { method: "DELETE" })
    showToast("API key deleted", "success")
    load()
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">API Keys</h1>
      <p className="text-sm text-gray-500">
        Create API keys for external systems (ERP, CMMS, reports) to access asset and work order data.
      </p>

      {/* Create new key */}
      <div className="bg-white p-4 rounded shadow flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs font-semibold text-gray-600 block mb-1">Key Name</label>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="e.g. ERP Integration"
            className="px-3 py-2 border rounded text-sm w-full"
          />
        </div>
        <button onClick={createKey} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold">
          Generate Key
        </button>
      </div>

      {/* New key result (shown once) */}
      {newKeyResult && (
        <div className="bg-green-50 border border-green-200 p-4 rounded">
          <p className="text-sm font-semibold text-green-700 mb-2">✓ API Key Created — copy it now (won't be shown again):</p>
          <div className="flex gap-2">
            <code className="flex-1 px-3 py-2 bg-white border rounded text-sm font-mono break-all">{newKeyResult}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(newKeyResult); showToast("Copied to clipboard", "success") }}
              className="px-3 py-2 bg-gray-800 text-white rounded text-sm"
            >
              Copy
            </button>
            <button onClick={() => setNewKeyResult(null)} className="px-3 py-2 border rounded text-sm">Dismiss</button>
          </div>
        </div>
      )}

      {/* Existing keys */}
      {keys.length === 0 ? (
        <div className="bg-white p-8 rounded shadow text-center text-gray-400">
          No API keys yet.
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k.id} className="bg-white p-4 rounded shadow flex items-center justify-between">
              <div>
                <span className="font-semibold text-sm">{k.name}</span>
                <div className="text-xs text-gray-500 mt-1">
                  Created: {new Date(k.createdAt).toLocaleDateString()}
                  {k.lastUsedAt && ` · Last used: ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                  {k.active ? "" : " · INACTIVE"}
                </div>
              </div>
              <button onClick={() => deleteKey(k.id)} className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* API documentation */}
      <div className="bg-gray-50 p-4 rounded border">
        <h3 className="text-sm font-bold mb-2">API Usage</h3>
        <div className="space-y-2 text-xs font-mono text-gray-600">
          <div>
            <span className="text-gray-400"># List assets</span><br/>
            curl -H "X-API-Key: YOUR_KEY" https://your-domain/api/external/assets
          </div>
          <div>
            <span className="text-gray-400"># List work orders by status</span><br/>
            curl -H "X-API-Key: YOUR_KEY" "https://your-domain/api/external/workorders?status=CREATED"
          </div>
          <div>
            <span className="text-gray-400"># Filter by org unit</span><br/>
            curl -H "X-API-Key: YOUR_KEY" "https://your-domain/api/external/assets?org=ORG_ID&limit=50"
          </div>
        </div>
      </div>
    </div>
  )
}
