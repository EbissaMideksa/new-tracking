// components/SystemSettingsTable.tsx
// Generic key/value editor for the SystemSetting table.
// Reserved keys (grant_matrix, wo_permission_matrix) are shown read-only.

"use client"

import { useCallback, useEffect, useState } from "react"
import { useToast } from "@/components/ToastProvider"
import { useConfirm } from "@/components/ConfirmProvider"
import { RESERVED_KEYS } from "@/lib/systemSettings.constants"

type SettingsMap = Record<string, string>

export default function SystemSettingsTable() {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [settings, setSettings] = useState<SettingsMap>({})
  const [defs, setDefs] = useState<Record<string, any>>({})
  const [categories, setCategories] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  // new-setting form
  const [newKey, setNewKey] = useState("")
  const [newValue, setNewValue] = useState("")

  // inline-edit draft values
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings", { credentials: "include" })
      if (!res.ok) {
        showToast("Failed to load settings", "error")
        return
      }
      const data = await res.json()
      const m: SettingsMap = data.settings ?? {}
      setSettings(m)
      setDrafts(m)
      setDefs(data.defs ?? {})
      setCategories(data.categories ?? [])
    } catch {
      showToast("Failed to load settings", "error")
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function saveKey(key: string) {
    const value = drafts[key] ?? ""
    setSavingKey(key)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || "Save failed", "error")
        return
      }
      setSettings((p) => ({ ...p, [key]: value }))
      showToast(`Saved "${key}"`, "success")
    } catch (e: any) {
      showToast(e.message || "Save failed", "error")
    } finally {
      setSavingKey(null)
    }
  }

  async function deleteKey(key: string) {
    if (!(await confirm({
      message: `Delete setting "${key}"?`,
      confirmLabel: "Delete setting",
    }))) return
    try {
      const res = await fetch(`/api/admin/settings?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || "Delete failed", "error")
        return
      }
      setSettings((p) => {
        const next = { ...p }
        delete next[key]
        return next
      })
      setDrafts((p) => {
        const next = { ...p }
        delete next[key]
        return next
      })
      showToast(`Deleted "${key}"`, "success")
    } catch (e: any) {
      showToast(e.message || "Delete failed", "error")
    }
  }

  async function addSetting() {
    const key = newKey.trim()
    if (!key) {
      showToast("Key is required", "error")
      return
    }
    if (settings[key] !== undefined) {
      showToast("Key already exists")
      return
    }
    setSavingKey("__new__")
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: newValue }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || "Add failed")
        return
      }
      setSettings((p) => ({ ...p, [key]: newValue }))
      setDrafts((p) => ({ ...p, [key]: newValue }))
      setNewKey("")
      setNewValue("")
      showToast(`Added "${key}"`)
    } catch (e: any) {
      showToast(e.message || "Add failed")
    } finally {
      setSavingKey(null)
    }
  }

  if (!loaded) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 300,
          color: "#94a3b8",
          fontSize: 13,
        }}
      >
        Loading settings…
      </div>
    )
  }

  const entries = Object.entries(settings).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
            Configuration
          </h2>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>
            {entries.length} setting{entries.length !== 1 ? "s" : ""} · use{" "}
            <code style={{ fontSize: 11 }}>theme</code> ={" "}
            <code style={{ fontSize: 11 }}>light</code> |{" "}
            <code style={{ fontSize: 11 }}>dark</code> for the global default theme
          </p>
        </div>
      </div>

      {/* Add new setting */}
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid #e2e8f0",
          background: "#f8fafc",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>KEY</label>
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="e.g. site_name"
            style={{
              padding: "6px 10px",
              fontSize: 12,
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              width: 200,
              outline: "none",
              fontFamily: "monospace",
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 240 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>VALUE</label>
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            style={{
              padding: "6px 10px",
              fontSize: 12,
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
        </div>
        <button
          onClick={addSetting}
          disabled={savingKey === "__new__"}
          style={{
            padding: "7px 16px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 6,
            border: "none",
            background: "#0ea5e9",
            color: "#fff",
            cursor: savingKey === "__new__" ? "not-allowed" : "pointer",
            opacity: savingKey === "__new__" ? 0.7 : 1,
          }}
        >
          {savingKey === "__new__" ? "Adding…" : "+ Add Setting"}
        </button>
      </div>

      {/* Settings list — grouped by category */}
      <div style={{ overflowX: "auto" }}>
        {entries.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
            No settings yet — add one above.
          </div>
        )}
        {categories.map((cat) => {
          const catEntries = entries.filter(([key]) => defs[key]?.category === cat)
          if (catEntries.length === 0) return null
          return (
            <div key={cat} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ padding: "10px 20px", background: "#f8fafc", fontWeight: 700, fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: ".05em" }}>
                {cat}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <tbody>
                  {catEntries.map(([key, value]) => {
                    const reserved = (RESERVED_KEYS as readonly string[]).includes(key)
                    const dirty = (drafts[key] ?? "") !== value
                    const def = defs[key]
                    return (
                      <tr key={key} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "9px 14px", verticalAlign: "top", width: 220 }}>
                          <div style={{ fontWeight: 600, color: "#334155", fontFamily: "monospace", fontSize: 12 }}>{key}</div>
                          {def?.description && (
                            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{def.description}</div>
                          )}
                          <div style={{ marginTop: 3, display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {def?.type && (
                              <span style={{ fontSize: 9, color: "#64748b", background: "#f1f5f9", padding: "1px 6px", borderRadius: 3 }}>{def.type}</span>
                            )}
                            {reserved && (
                              <span style={{ fontSize: 9, color: "#94a3b8", background: "#fef3c7", padding: "1px 6px", borderRadius: 3 }}>reserved</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "9px 14px" }}>
                          {reserved ? (
                            <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={value}>
                              {value.slice(0, 120)}{value.length > 120 ? "..." : ""}
                            </div>
                          ) : def?.type === "enum" && def?.options ? (
                            <select
                              value={drafts[key] ?? ""}
                              onChange={(e) => setDrafts((p) => ({ ...p, [key]: e.target.value }))}
                              style={{ padding: "6px 8px", fontSize: 12, border: `1px solid ${dirty ? "#f59e0b" : "#e2e8f0"}`, borderRadius: 6, background: dirty ? "#fffbeb" : "#fff" }}
                            >
                              {def.options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : (
                            <textarea
                              value={drafts[key] ?? ""}
                              onChange={(e) => setDrafts((p) => ({ ...p, [key]: e.target.value }))}
                              rows={2}
                              style={{ width: "100%", maxWidth: 520, padding: "6px 8px", fontSize: 12, border: `1px solid ${dirty ? "#f59e0b" : "#e2e8f0"}`, borderRadius: 6, outline: "none", boxSizing: "border-box", fontFamily: "monospace", background: dirty ? "#fffbeb" : "#fff" }}
                            />
                          )}
                        </td>
                        <td style={{ padding: "9px 14px", textAlign: "right", width: 150 }}>
                          {!reserved && (
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button
                                onClick={() => saveKey(key)}
                                disabled={!dirty || savingKey === key}
                                style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 5, border: "none", background: dirty ? "#0ea5e9" : "#e2e8f0", color: dirty ? "#fff" : "#94a3b8", cursor: !dirty || savingKey === key ? "not-allowed" : "pointer" }}
                              >
                                {savingKey === key ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={() => deleteKey(key)}
                                style={{ padding: "5px 10px", fontSize: 11, borderRadius: 5, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", cursor: "pointer" }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}
        {/* Uncategorized settings (user-added keys without a def) */}
        {entries.filter(([key]) => !defs[key]?.category).length > 0 && (
          <div style={{ borderBottom: "1px solid #e2e8f0" }}>
            <div style={{ padding: "10px 20px", background: "#f8fafc", fontWeight: 700, fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: ".05em" }}>
              Custom
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                {entries.filter(([key]) => !defs[key]?.category).map(([key, value]) => {
                  const reserved = (RESERVED_KEYS as readonly string[]).includes(key)
                  const dirty = (drafts[key] ?? "") !== value
                  return (
                    <tr key={key} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "9px 14px", verticalAlign: "top", width: 220 }}>
                        <div style={{ fontWeight: 600, color: "#334155", fontFamily: "monospace", fontSize: 12 }}>{key}</div>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <textarea value={drafts[key] ?? ""} onChange={(e) => setDrafts((p) => ({ ...p, [key]: e.target.value }))} rows={2} style={{ width: "100%", maxWidth: 520, padding: "6px 8px", fontSize: 12, border: `1px solid ${dirty ? "#f59e0b" : "#e2e8f0"}`, borderRadius: 6, outline: "none", boxSizing: "border-box", fontFamily: "monospace", background: dirty ? "#fffbeb" : "#fff" }} />
                      </td>
                      <td style={{ padding: "9px 14px", textAlign: "right", width: 150 }}>
                        {!reserved && (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button onClick={() => saveKey(key)} disabled={!dirty || savingKey === key} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 5, border: "none", background: dirty ? "#0ea5e9" : "#e2e8f0", color: dirty ? "#fff" : "#94a3b8", cursor: !dirty || savingKey === key ? "not-allowed" : "pointer" }}>
                              {savingKey === key ? "Saving..." : "Save"}
                            </button>
                            <button onClick={() => deleteKey(key)} style={{ padding: "5px 10px", fontSize: 11, borderRadius: 5, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", cursor: "pointer" }}>
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

