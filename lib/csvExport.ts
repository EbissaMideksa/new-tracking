// lib/csvExport.ts
// Client-side CSV export utility.

interface CsvOptions {
  filename?: string
}

export function exportToCSV(data: Record<string, any>[], filename: string, columns?: { key: string; label: string }[]) {
  if (!data.length) return

  const keys = columns ? columns.map(c => c.key) : Object.keys(data[0])
  const headers = columns ? columns.map(c => c.label) : keys

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return ""
    const s = String(val).replace(/"/g, '""')
    return `"${s}"`
  }

  const rows = [
    headers.map(escapeCsv).join(","),
    ...data.map(row => keys.map(k => escapeCsv(row[k])).join(",")),
  ]

  const csv = rows.join("\n")
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
