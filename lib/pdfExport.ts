// lib/pdfExport.ts
// Client-side PDF report generation using jsPDF + autoTable.
// Generates a printable asset inventory report.

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

interface AssetRow {
  tagNumber: string
  serialNumber: string
  itemCode: string
  description: string
  category: string
  orgUnit: string
  criticality: string
  warrantyExpiration: string
  active: boolean
}

export function exportAssetsPDF(assets: AssetRow[], orgName: string = "Ethio Telecom") {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })

  // Header
  doc.setFontSize(16)
 doc.setFont("helvetica", "bold")
  doc.text(`${orgName} — Asset Inventory Report`, 14, 15)
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 21)
  doc.text(`Total Assets: ${assets.length}`, 14, 26)

  // Summary stats
  const active = assets.filter(a => a.active).length
  const inactive = assets.length - active
  const expired = assets.filter(a => {
    if (!a.warrantyExpiration) return false
    return new Date(a.warrantyExpiration) < new Date()
  }).length
  doc.text(`Active: ${active}  |  Inactive: ${inactive}  |  Warranty Expired: ${expired}`, 14, 31)

  // Table
  autoTable(doc, {
    startY: 36,
    head: [["Tag #", "Serial #", "Item Code", "Description", "Category", "Org Unit", "Criticality", "Warranty", "Status"]],
    body: assets.map(a => [
      a.tagNumber || "-",
      a.serialNumber || "-",
      a.itemCode || "-",
      (a.description || "-").slice(0, 40),
      a.category || "-",
      a.orgUnit || "-",
      a.criticality || "-",
      a.warrantyExpiration || "-",
      a.active ? "Active" : "Inactive",
    ]),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [13, 148, 136], fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 251] },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 30 },
      2: { cellWidth: 25 },
      3: { cellWidth: 50 },
      4: { cellWidth: 25 },
      5: { cellWidth: 30 },
      6: { cellWidth: 20 },
      7: { cellWidth: 25 },
      8: { cellWidth: 20 },
    },
  })

  // Footer with page numbers
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text(
      `Page ${i} of ${pageCount}  ·  ${orgName} Asset Tracking System`,
      14, doc.internal.pageSize.height - 8
    )
  }

  doc.save(`asset-inventory-${new Date().toISOString().slice(0, 10)}.pdf`)
}
