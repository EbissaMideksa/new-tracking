// lib/exportXlsx.ts
// Client-side Excel (.xlsx) export using the `xlsx` package. Triggers a
// browser download — no server round-trip needed.

import * as XLSX from "xlsx"

export type ExportColumn = { key: string; label: string }

// Export an array of row objects to an .xlsx file.
// `columns` (optional) selects/renames/order fields; without it, all own
// enumerable keys are exported as-is.
export function exportToExcel(
  rows: Record<string, any>[],
  filename: string,
  columns?: ExportColumn[],
  sheetName = "Sheet1",
) {
  if (!rows.length) return

  const data = columns
    ? rows.map((r) => {
        const o: Record<string, any> = {}
        for (const c of columns) o[c.label] = r[c.key] ?? ""
        return o
      })
    : rows

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`)
}
