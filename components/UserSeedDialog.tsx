// components/UserSeedDialog.tsx
// Manual user seeding from an Excel workbook:
//   1. Download a template listing every user field (+ an "Org Units" sheet).
//   2. Upload a filled workbook.
//   3. Preview the rows with per-row validation (mandatory/optional fields).
//   4. Import the valid rows through POST /api/users.
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as XLSX from "xlsx"
import Modal from "./Modal"
import { USER_STATUSES } from "@/lib/userStatus"

const ROLES = ["SUPER_ADMIN", "ADMIN", "CHIEF", "DIRECTOR", "MANAGER", "SUPERVISOR", "USER"]
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Every user field, in template order. `required` drives validation + the
// template's header note.
const FIELDS: { key: string; header: string; required?: boolean; hint: string }[] = [
  { key: "name",     header: "name",     required: true,  hint: "Full name" },
  { key: "email",    header: "email",    required: true,  hint: "Login email" },
  { key: "phone",    header: "phone",                    hint: "Optional" },
  { key: "role",     header: "role",     required: true,  hint: ROLES.join(" / ") },
  { key: "orgUnitId", header: "orgUnitId", required: true, hint: "Org unit UUID — see the 'Org Units' sheet" },
  { key: "geoZoneId", header: "geoZoneId", hint: "Zone/Region UUID for non-corporate (field) workers — see the 'Geo Zones' sheet (leave blank for corporate workers)" },
  { key: "employeeId", header: "employeeId",              hint: "Oracle ID (optional)" },
  { key: "jobTitle", header: "jobTitle",                  hint: "Optional" },
  { key: "status",   header: "status",                    hint: `${USER_STATUSES.join(" / ")} (default ACTIVE)` },
  { key: "password", header: "password",                  hint: "Optional — blank uses the default password" },
  { key: "departmentId", header: "departmentId",          hint: "Optional UUID" },
  { key: "managerId",   header: "managerId",             hint: "Optional UUID — blank derives Reports-To" },
]

type OrgUnitLite = { id: string; name: string; type: string; path?: string }
type GeoZoneLite = { id: string; code: string; name: string; category: string }
type RawRow = { data: Record<string, string> }
type Row = RawRow & { errors: string[] }

const norm = (s: string) => String(s).toLowerCase().replace(/\s+/g, "")

function validateRow(
  data: Record<string, string>,
  orgUnitIds: Set<string>,
  fallbackOrgUnitId = "",
  zoneIds?: Set<string>,
): string[] {
  const errors: string[] = []
  if (!data.name) errors.push("name is required")
  if (!data.email) errors.push("email is required")
  else if (!EMAIL_RE.test(data.email)) errors.push("invalid email")

  const role = data.role.toUpperCase()
  if (!role) errors.push("role is required")
  else if (!ROLES.includes(role)) errors.push(`role must be one of ${ROLES.join(", ")}`)

  // The org unit id is taken from the page selection when one is set;
  // otherwise the row's orgUnitId column is used.
  const orgUnitId = fallbackOrgUnitId || data.orgUnitId
  if (!orgUnitId) errors.push("orgUnitId is required (fill the column or pick one on the page)")
  else if (!UUID_RE.test(orgUnitId)) errors.push("orgUnitId must be a UUID")
  else if (orgUnitIds.size && !orgUnitIds.has(orgUnitId)) errors.push("orgUnitId not found")

  // Zone/region — only for non-corporate (field) workers; optional.
  if (data.geoZoneId) {
    if (!UUID_RE.test(data.geoZoneId)) errors.push("geoZoneId must be a UUID")
    else if (zoneIds && zoneIds.size && !zoneIds.has(data.geoZoneId)) errors.push("geoZoneId not found")
  }

  if (data.password && data.password.length < 8) errors.push("password must be ≥ 8 characters")

  const status = data.status.toUpperCase()
  if (status && !USER_STATUSES.includes(status as any)) {
    errors.push(`status must be one of ${USER_STATUSES.join(", ")}`)
  }

  for (const k of ["departmentId", "managerId"]) {
    if (data[k] && !UUID_RE.test(data[k])) errors.push(`${k} must be a UUID`)
  }
  return errors
}

/**
 * Parse cells pasted straight from Excel/Sheets (tab-separated, newline rows).
 * If the first row contains known field headers it is used as a header map
 * (any column order); otherwise columns are assumed to follow the template
 * order. Returns raw rows ready for validation.
 */
function parsePasted(text: string): RawRow[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "")
  if (!lines.length) return []

  const split = (line: string) => line.split("\t").map((c) => c.trim())
  const fieldNorms = FIELDS.map((f) => norm(f.header))
  const first = split(lines[0]).map(norm)
  const headerMap = new Map<number, number>() // column index → field index
  first.forEach((h, i) => {
    const fi = fieldNorms.indexOf(h)
    if (fi >= 0) headerMap.set(i, fi)
  })
  const hasHeader = headerMap.size > 0

  const toRow = (cols: string[]): RawRow => {
    const data: Record<string, string> = {}
    for (const f of FIELDS) data[f.key] = ""
    if (hasHeader) {
      for (const [ci, fi] of headerMap) data[FIELDS[fi].key] = (cols[ci] ?? "").trim()
    } else {
      FIELDS.forEach((f, i) => { data[f.key] = (cols[i] ?? "").trim() })
    }
    return { data }
  }

  return (hasHeader ? lines.slice(1) : lines).map((l) => toRow(split(l)))
}

export default function UserSeedDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: (created: any[]) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [orgUnits, setOrgUnits] = useState<OrgUnitLite[]>([])
  const [zones, setZones] = useState<GeoZoneLite[]>([])
  const [rows, setRows] = useState<RawRow[]>([])
  const [fileName, setFileName] = useState("")
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ created: number; failed: { name: string; error: string }[] } | null>(null)

  // Default org unit applied to every row whose orgUnitId column is blank.
  const [selectedOrgId, setSelectedOrgId] = useState("")
  const [orgQuery, setOrgQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [copied, setCopied] = useState(false)

  // Copy-paste from Excel (TSV) as an alternative to file upload.
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")

  const orgUnitIds = useMemo(() => new Set(orgUnits.map((o) => o.id)), [orgUnits])
  const zoneIds = useMemo(() => new Set(zones.map((z) => z.id)), [zones])
  const validatedRows: Row[] = useMemo(
    () => rows.map((r) => ({ data: r.data, errors: validateRow(r.data, orgUnitIds, selectedOrgId, zoneIds) })),
    [rows, orgUnitIds, selectedOrgId, zoneIds],
  )
  const validRows = validatedRows.filter((r) => r.errors.length === 0)
  const invalidCount = validatedRows.length - validRows.length

  const orgTypes = useMemo(
    () => Array.from(new Set(orgUnits.map((o) => o.type))).sort(),
    [orgUnits],
  )

  const filteredOrgUnits = useMemo(() => {
    const q = orgQuery.trim().toLowerCase()
    return orgUnits.filter((o) => {
      if (typeFilter && o.type !== typeFilter) return false
      if (!q) return true
      return `${o.name} ${o.path ?? ""}`.toLowerCase().includes(q)
    })
  }, [orgUnits, orgQuery, typeFilter])

  const selectedOrg = orgUnits.find((o) => o.id === selectedOrgId) ?? null

  async function copyOrgId() {
    if (!selectedOrgId) return
    try {
      await navigator.clipboard.writeText(selectedOrgId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  // Reset state each time the dialog opens; load the org-unit list for the
  // template's reference sheet and for orgUnitId validation.
  useEffect(() => {
    if (!open) return
    setRows([])
    setFileName("")
    setResult(null)
    setProgress(null)
    setSelectedOrgId("")
    setOrgQuery("")
    setTypeFilter("")
    setCopied(false)
    setPasteOpen(false)
    setPasteText("")
    fetch("/api/org", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setOrgUnits(Array.isArray(d) ? d : []))
      .catch(() => setOrgUnits([]))
    // Zones/regions for the geoZoneId column + template reference sheet.
    fetch("/api/org/overview", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setZones(d?.overview?.zones ?? []))
      .catch(() => setZones([]))
  }, [open])

  function downloadTemplate() {
    const wb = XLSX.utils.book_new()

    // Users sheet — header row + one example row.
    const header = FIELDS.map((f) => f.header)
    const sample = FIELDS.map((f) => {
      switch (f.key) {
        case "name": return "Jane Doe"
        case "email": return "jane.doe@example.com"
        case "phone": return "+251911000000"
        case "role": return "USER"
        case "orgUnitId": return selectedOrgId || ""
        case "status": return "ACTIVE"
        default: return ""
      }
    })
    const ws = XLSX.utils.aoa_to_sheet([header, sample])
    ws["!cols"] = header.map((h) => ({ wch: h === "orgUnitId" || h.endsWith("Id") ? 40 : 22 }))
    XLSX.utils.book_append_sheet(wb, ws, "Users")

    // Org Units reference sheet — id / name / type / path.
    const ouSheet = XLSX.utils.json_to_sheet(
      orgUnits.map((o) => ({ id: o.id, name: o.name, type: o.type, path: o.path ?? "" })),
    )
    ouSheet["!cols"] = [{ wch: 40 }, { wch: 30 }, { wch: 16 }, { wch: 60 }]
    XLSX.utils.book_append_sheet(wb, ouSheet, "Org Units")

    // Geo Zones reference sheet — id / code / name / category.
    const gzSheet = XLSX.utils.json_to_sheet(
      zones.map((z) => ({ id: z.id, code: z.code, name: z.name, category: z.category })),
    )
    gzSheet["!cols"] = [{ wch: 40 }, { wch: 10 }, { wch: 30 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, gzSheet, "Geo Zones")

    // Field guide sheet.
    const guide = XLSX.utils.aoa_to_sheet([
      ["Field", "Required", "Notes"],
      ...FIELDS.map((f) => [f.header, f.required ? "Yes" : "No", f.hint]),
    ])
    guide["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 60 }]
    XLSX.utils.book_append_sheet(wb, guide, "Field guide")

    XLSX.writeFile(wb, "user-import-template.xlsx")
  }

  async function handleFile(file: File) {
    setFileName(file.name)
    setResult(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const sheetName = wb.SheetNames.find((n) => norm(n) === "users") ?? wb.SheetNames[0]
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[sheetName], { defval: "" })

      const parsed: RawRow[] = raw.map((r) => {
        const lookup: Record<string, any> = {}
        for (const [k, v] of Object.entries(r)) lookup[norm(k)] = v
        const data: Record<string, string> = {}
        for (const f of FIELDS) data[f.key] = String(lookup[norm(f.header)] ?? "").trim()
        return { data }
      })
      setRows(parsed)
    } catch (e: any) {
      setRows([])
      setFileName(`Failed to read file: ${e?.message ?? "unknown error"}`)
    }
  }

  function applyPaste() {
    const parsed = parsePasted(pasteText)
    setResult(null)
    if (!parsed.length) {
      setRows([])
      setFileName("Nothing to import — paste at least one data row.")
      return
    }
    setRows(parsed)
    setFileName(`Pasted from Excel · ${parsed.length} row${parsed.length === 1 ? "" : "s"}`)
    setPasteOpen(false)
    setPasteText("")
  }

  async function runImport() {
    if (!validRows.length || importing) return
    setImporting(true)
    setProgress({ done: 0, total: validRows.length })
    const created: any[] = []
    const failed: { name: string; error: string }[] = []

    for (let i = 0; i < validRows.length; i++) {
      const d = validRows[i].data
      const body = {
        name: d.name,
        email: d.email,
        phone: d.phone || undefined,
        role: d.role.toUpperCase(),
        orgUnitId: selectedOrgId || d.orgUnitId,
        geoZoneId: d.geoZoneId || null,
        employeeId: d.employeeId || null,
        jobTitle: d.jobTitle || null,
        status: d.status ? d.status.toUpperCase() : undefined,
        password: d.password || undefined,
        departmentId: d.departmentId || null,
        managerId: d.managerId || null,
      }
      try {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) created.push(data.user ?? data)
        else failed.push({ name: d.name || d.email, error: data.error || `Request failed (${res.status})` })
      } catch {
        failed.push({ name: d.name || d.email, error: "Network error" })
      }
      setProgress({ done: i + 1, total: validRows.length })
    }

    setImporting(false)
    setResult({ created: created.length, failed })
    if (created.length) onImported(created)
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!importing) onClose() }}
      title="Seed users from Excel"
      subtitle="Download the template, fill in one row per user, upload it, review the preview, then import."
      size="xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
          >
            {result ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={runImport}
            disabled={!validRows.length || importing}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {importing
              ? `Importing… ${progress ? `${progress.done}/${progress.total}` : ""}`
              : `Import ${validRows.length} user${validRows.length === 1 ? "" : "s"}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded-lg border border-indigo-500 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600"
          >
            ⬇ Download template
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
              e.target.value = ""
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            ⬆ Upload Excel
          </button>
          {fileName && <span className="text-xs text-slate-500">{fileName}</span>}
          {rows.length > 0 && (
            <span className="ml-auto flex items-center gap-2 text-[11px]">
              <span className="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-700">{validRows.length} valid</span>
              {invalidCount > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">{invalidCount} invalid</span>
              )}
            </span>
          )}
        </div>

        {/* Paste from Excel — copy cells, paste here (tab-separated). */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setPasteOpen((o) => !o)}
              className="rounded-lg border border-emerald-500 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-600"
            >
              📋 Paste from Excel
            </button>
            <span className="text-[10px] text-slate-400">Copy cells in Excel, then paste below (tab-separated)</span>
          </div>
          {pasteOpen && (
            <div className="mt-2">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"name\t...\trole\torgUnitId\t..."}
                className="h-24 w-full rounded-md border border-slate-200 bg-white p-2 font-mono text-[11px] outline-none"
              />
              <div className="mt-1.5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setPasteText(""); setPasteOpen(false) }}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyPaste}
                  disabled={!pasteText.trim()}
                  className="rounded-md bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  Use pasted data
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Default org unit — applied to every row whose orgUnitId is blank. Use
            the filters to locate the exact unit; its id can be copied into the
            sheet for rows that need another org. */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">Default org unit</span>
            <span className="text-[10px] text-slate-400">The org unit id is taken from this page selection</span>
          </div>
          <div className="flex gap-1.5">
            <input
              value={orgQuery}
              onChange={(e) => setOrgQuery(e.target.value)}
              placeholder="Filter by name or path…"
              className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
            >
              <option value="">All types</option>
              {orgTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="mt-1.5 max-h-40 overflow-auto rounded-md border border-slate-200 bg-white">
            {filteredOrgUnits.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-slate-400">
                {orgUnits.length === 0 ? "No org units available." : "No matches."}
              </div>
            ) : (
              filteredOrgUnits.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { setSelectedOrgId(o.id); setCopied(false) }}
                  className={[
                    "flex w-full flex-col items-start gap-px border-b border-slate-100 px-2.5 py-1.5 text-left last:border-b-0",
                    o.id === selectedOrgId ? "bg-blue-50" : "hover:bg-slate-50",
                  ].join(" ")}
                >
                  <span className="text-[11.5px] font-medium text-slate-800">{o.name}</span>
                  <span className="font-mono text-[9.5px] text-slate-400">{o.path || o.id}</span>
                </button>
              ))
            )}
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>{filteredOrgUnits.length} of {orgUnits.length} org units</span>
            {(orgQuery || typeFilter) && (
              <button
                type="button"
                onClick={() => { setOrgQuery(""); setTypeFilter("") }}
                className="text-slate-500 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600">
              {selectedOrgId || "no default selected"}
            </code>
            <button
              type="button"
              onClick={copyOrgId}
              disabled={!selectedOrgId}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
            >
              {copied ? "Copied!" : "Copy ID"}
            </button>
            {selectedOrgId && (
              <button
                type="button"
                onClick={() => { setSelectedOrgId(""); setCopied(false) }}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-500"
              >
                Clear
              </button>
            )}
          </div>
          {selectedOrg && (
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
              Selected: <span className="font-semibold text-slate-600">{selectedOrg.name}</span> — this id is used for
              the import (overrides the sheet&apos;s <span className="font-mono">orgUnitId</span> column).
            </p>
          )}
        </div>

        {/* Result summary */}
        {result && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <p className="font-semibold text-slate-800">
              Imported {result.created} user{result.created === 1 ? "" : "s"}
              {result.failed.length > 0 && ` · ${result.failed.length} failed`}
            </p>
            {result.failed.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-red-600">
                {result.failed.slice(0, 10).map((f, i) => (
                  <li key={i}>{f.name}: {f.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Preview */}
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-xs text-slate-400">
            {fileName ? "No rows found in the uploaded file." : "Upload a filled template to see a preview and validation here."}
          </div>
        ) : (
          <div className="max-h-[46vh] overflow-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 bg-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5">Name</th>
                  <th className="px-2 py-1.5">Email</th>
                  <th className="px-2 py-1.5">Role</th>
                  <th className="px-2 py-1.5">Org Unit</th>
                  <th className="px-2 py-1.5">Zone</th>
                  <th className="px-2 py-1.5">Notes</th>
                </tr>
              </thead>
              <tbody>
                {validatedRows.map((r, i) => {
                  const orgLabel = selectedOrgId
                    ? `${selectedOrgId.slice(0, 8)} (page)`
                    : r.data.orgUnitId
                      ? r.data.orgUnitId.slice(0, 8)
                      : "—"
                  return (
                    <tr key={i} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-1.5">
                        {r.errors.length === 0 ? (
                          <span className="rounded bg-green-100 px-1.5 py-0.5 font-semibold text-green-700">OK</span>
                        ) : (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">Invalid</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-slate-800">{r.data.name || "—"}</td>
                      <td className="px-2 py-1.5 text-slate-600">{r.data.email || "—"}</td>
                      <td className="px-2 py-1.5 text-slate-600">{r.data.role || "—"}</td>
                      <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500">{orgLabel}</td>
                      <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500">
                        {r.data.geoZoneId
                          ? (zones.find((z) => z.id === r.data.geoZoneId)?.code ?? r.data.geoZoneId.slice(0, 8))
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-red-600">{r.errors.join("; ")}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}