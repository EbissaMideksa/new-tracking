// scripts/lib/pdf-kit.mjs
// Minimal paginated layout engine for jsPDF.
//
// Wraps jsPDF + jspdf-autotable (both already used by the app in
// lib/pdfExport.ts) with flow-aware primitives: the kit tracks a cursor,
// breaks pages before content would overflow, and records the page number
// each heading lands on so a table of contents can be built in a second pass.
//
// Units are millimetres, page is A4 portrait. Node-only (uses node:fs).

import { writeFileSync } from "node:fs"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

export const PAGE_W = 210
export const PAGE_H = 297
export const MARGIN = { left: 18, right: 18, top: 20, bottom: 18 }
export const CONTENT_W = PAGE_W - MARGIN.left - MARGIN.right
export const CONTENT_TOP = MARGIN.top
export const CONTENT_BOTTOM = PAGE_H - MARGIN.bottom

// Palette (matches the app's teal accent in lib/pdfExport.ts).
export const C = {
  accent: [13, 148, 136],
  accentDark: [9, 106, 97],
  ink: [28, 33, 38],
  body: [55, 63, 71],
  muted: [125, 135, 145],
  faint: [247, 249, 250],
  rule: [214, 221, 226],
  warn: [190, 120, 20],
  warnBg: [253, 246, 233],
  danger: [183, 55, 55],
  dangerBg: [253, 240, 240],
  ok: [40, 130, 90],
  okBg: [237, 248, 242],
  info: [40, 95, 170],
  infoBg: [236, 243, 252],
  codeBg: [246, 248, 249],
  codeBar: [13, 148, 136],
}

const MM = 0.352778 // pt -> mm
const padTopOf = () => 4.0
const padBottomOf = () => 3.2

// jsPDF's built-in fonts are WinAnsi-encoded, so anything outside that
// repertoire renders as a stray glyph. Fold common typographic characters
// down to ASCII equivalents before drawing.
const FOLD = {
  "→": "->", "←": "<-", "↔": "<->", "•": "-", "·": "-", "…": "...",
  "—": "-", "–": "-", "‘": "'", "’": "'", "“": '"', "”": '"',
  "×": "x", "≥": ">=", "≤": "<=", "✓": "OK", "✗": "X", "⚠": "!",
}
const ascii = (s) =>
  String(s).replace(/[^\x20-\x7E\n]/g, (ch) => FOLD[ch] ?? (ch.charCodeAt(0) < 32 ? "" : "?"))

export class Book {
  constructor({ title = "", subject = "" } = {}) {
    this.doc = new jsPDF({ unit: "mm", format: "a4", compress: true })
    this.title = title
    this.subject = subject
    this.page = 1
    this.y = CONTENT_TOP
    this.marks = new Map() // heading -> page number
  }

  get ref() {
    return this.doc
  }

  // Start a new page if `height` would overflow the text area.
  need(height) {
    if (this.y + height > CONTENT_BOTTOM) {
      this.doc.addPage()
      this.page++
      this.y = CONTENT_TOP
      return true
    }
    return false
  }

  space(height) {
    this.y += height
  }

  rect(x, y, w, h, fill) {
    this.doc.setFillColor(...fill)
    this.doc.rect(x, y, w, h, "F")
  }

  // Draw a wrapped block of text. Returns lines consumed.
  text(raw, opts = {}) {
    const {
      size = 9.5,
      style = "normal",
      font = "helvetica",
      color = C.body,
      leading = 1.35,
      gap = 2.6,
      indent = 0,
      width = CONTENT_W,
    } = opts
    this.doc.setFont(font, style)
    this.doc.setFontSize(size)
    this.doc.setTextColor(...color)
    const lines = this.doc.splitTextToSize(ascii(raw), width - indent)
    const lh = size * MM * leading
    for (const line of lines) {
      this.need(lh)
      this.doc.text(line, MARGIN.left + indent, this.y + size * MM)
      this.y += lh
    }
    this.y += gap
    return lines.length
  }

  h1(raw, { pageBreak = false } = {}) {
    if (pageBreak) {
      this.doc.addPage()
      this.page++
      this.y = CONTENT_TOP
    }
    this.need(30)
    if (this.y > CONTENT_TOP) this.space(5)
    this.marks.set(ascii(raw), this.page)

    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(16)
    this.doc.setTextColor(...C.accentDark)
    for (const line of this.doc.splitTextToSize(ascii(raw), CONTENT_W - 4)) {
      this.need(8)
      this.doc.text(line, MARGIN.left, this.y + 5.6)
      this.y += 7
    }
    this.y += 1.4
    this.rect(MARGIN.left, this.y, 26, 1.1, C.accent)
    this.y += 5
  }

  h2(raw) {
    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(11)
    this.doc.setTextColor(...C.ink)
    const lines = this.doc.splitTextToSize(ascii(raw), CONTENT_W)
    // Reserve room for the heading plus ~3 body lines so a heading is never
    // stranded alone at the foot of a page.
    this.need(lines.length * 6 + 15)
    this.y += 2.4
    for (const line of lines) {
      this.doc.text(line, MARGIN.left, this.y + 3.6)
      this.y += 5.4
    }
    this.y += 0.6
  }

  h3(raw) {
    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(9.8)
    this.doc.setTextColor(...C.accentDark)
    const lines = this.doc.splitTextToSize(ascii(raw), CONTENT_W)
    this.need(lines.length * 5 + 11)
    for (const line of lines) {
      this.doc.text(line, MARGIN.left, this.y + 3.2)
      this.y += 4.8
    }
    this.y += 0.4
  }

  // Bulleted / numbered list. Items may be a string or [label, detail].
  list(items, { numbered = false, indent = 4.8 } = {}) {
    const size = 9.3
    const lh = size * MM * 1.32
    items.forEach((item, i) => {
      const raw = Array.isArray(item) ? `${item[0]}  ${item[1]}` : item
      const marker = numbered ? `${i + 1}.` : "-"

      this.doc.setFont("helvetica", "bold")
      this.doc.setFontSize(size)
      this.doc.setTextColor(...C.accentDark)
      const first = this.doc.splitTextToSize(ascii(marker), indent)[0]

      this.doc.setFont("helvetica", "normal")
      this.doc.setTextColor(...C.body)
      const lines = this.doc.splitTextToSize(ascii(raw), CONTENT_W - indent - 1)

      this.need(lh)
      this.doc.setFont("helvetica", "bold")
      this.doc.setTextColor(...C.accentDark)
      this.doc.text(first, MARGIN.left, this.y + size * MM)

      this.doc.setFont("helvetica", "normal")
      this.doc.setTextColor(...C.body)
      lines.forEach((line, li) => {
        if (li > 0) this.need(lh)
        this.doc.text(line, MARGIN.left + indent, this.y + size * MM)
        this.y += lh
      })
      this.y += 0.7
    })
    this.y += 1.6
  }

  // Monospace block on a tinted panel with an accent bar.
  code(raw, { caption = null } = {}) {
    const size = 8.1
    const lh = size * MM * 1.42
    const lines = ascii(raw).replace(/\t/g, "    ").split("\n")
    const padTop = 3.0
    const padBottom = 2.4
    const capH = caption ? 4.8 : 0

    this.need(lh + padTop + padBottom + capH)
    let y0 = this.y

    if (caption) {
      this.doc.setFont("helvetica", "bold")
      this.doc.setFontSize(7.4)
      this.doc.setTextColor(...C.muted)
      this.doc.text(ascii(caption).toUpperCase(), MARGIN.left + 3.6, y0 + 3.2)
      y0 += capH
    }

    let idx = 0
    while (idx < lines.length) {
      const avail = CONTENT_BOTTOM - (y0 + padTop + padBottom)
      const maxLines = Math.max(1, Math.floor(avail / lh))
      const chunk = lines.slice(idx, idx + maxLines)
      const blockH = padTop + chunk.length * lh + padBottom

      this.need(blockH)
      this.rect(MARGIN.left, y0, CONTENT_W, blockH, C.codeBg)
      this.rect(MARGIN.left, y0, 1.4, blockH, C.codeBar)

      this.doc.setFont("courier", "normal")
      this.doc.setFontSize(size)
      this.doc.setTextColor(...C.ink)
      let ty = y0 + padTop + size * MM
      for (const line of chunk) {
        this.doc.text(line, MARGIN.left + 4.4, ty)
        ty += lh
      }
      y0 += blockH
      idx += chunk.length
      if (idx < lines.length) {
        this.doc.addPage()
        this.page++
        y0 = CONTENT_TOP
      }
    }
    this.y = y0 + 3.4
  }

  // autoTable wrapper that keeps the cursor and page count in sync.
  table(head, body, opts = {}) {
    const {
      widths = null,
      fontSize = 8.4,
      headSize = 8.4,
      align = null,
      zebra = true,
      cellPadding = 2.0,
      caption = null,
      headColor = C.accent,
    } = opts

    if (caption) {
      this.doc.setFont("helvetica", "bold")
      this.doc.setFontSize(7.6)
      this.doc.setTextColor(...C.muted)
      for (const l of this.doc.splitTextToSize(ascii(caption).toUpperCase(), CONTENT_W)) {
        this.need(4.4)
        this.doc.text(l, MARGIN.left, this.y + 2.9)
        this.y += 3.8
      }
      this.y += 0.8
    }

    const before = this.doc.getNumberOfPages()
    autoTable(this.doc, {
      startY: this.y,
      // autoTable requires a 2-D head. A 1-D array such as ["A","B"] is read
      // as two *rows*, which both mangles the header and trips its internal
      // width check, so normalise here rather than at every call site.
      head: [head.map((h) => ascii(h))],
      body: body.map((row) =>
        row.map((cell) => (cell == null ? "" : ascii(String(cell))))
      ),
      margin: { left: MARGIN.left, right: MARGIN.right, top: cellPadding, bottom: cellPadding },
      styles: { fontSize, cellPadding, lineColor: C.rule, lineWidth: 0.15, overflow: "linebreak" },
      headStyles: {
        fillColor: headColor,
        textColor: [255, 255, 255],
        fontSize: headSize,
        fontStyle: "bold",
      },
      alternateRowStyles: zebra ? { fillColor: C.faint } : undefined,
      columnStyles: widths
        ? Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w }]))
        : undefined,
      columnStylesAlign: align || undefined,
      // No explicit tableWidth: autoTable fits the area between the left and
      // right margins, which is already CONTENT_W. Setting tableWidth as well
      // double-counts the margins and overflows the page.
      theme: "grid",
    })

    // autoTable may have paginated; resync cursor and page counter.
    const after = this.doc.getNumberOfPages()
    this.page = after
    const finalY = this.doc.lastAutoTable?.finalY
    if (after > before) {
      this.y = CONTENT_TOP + (typeof finalY === "number" ? finalY : 0)
    } else if (typeof finalY === "number") {
      this.y = finalY + 4.2
    }
    return finalY
  }

  // Key -> value two-column table.
  kv(pairs, opts = {}) {
    this.table(
      ["Setting", "Value"],
      pairs.map(([k, v]) => [k, v]),
      { widths: [56, CONTENT_W - 56], ...opts }
    )
  }

  // Bordered note panel. kind: info | warn | danger | ok
  callout(title, body, kind = "info") {
    const tones = {
      info: [C.info, C.infoBg],
      warn: [C.warn, C.warnBg],
      danger: [C.danger, C.dangerBg],
      ok: [C.ok, C.okBg],
    }
    const [accent, bg] = tones[kind] || tones.info
    const size = 9.1
    const lh = size * MM * 1.32

    this.doc.setFont("helvetica", "normal")
    this.doc.setFontSize(size)
    const bodyLines = this.doc.splitTextToSize(ascii(body), CONTENT_W - 11)
    const titleH = title ? 5.6 : 0
    const h = padTopOf() + bodyLines.length * lh + titleH + padBottomOf()

    this.need(h)
    const y0 = this.y
    this.rect(MARGIN.left, y0, CONTENT_W, h, bg)
    this.rect(MARGIN.left, y0, 1.6, h, accent)

    let ty = y0 + padTopOf()
    if (title) {
      this.doc.setFont("helvetica", "bold")
      this.doc.setFontSize(9.1)
      this.doc.setTextColor(...accent)
      this.doc.text(ascii(title), MARGIN.left + 5.6, ty + size * MM)
      ty += titleH
    }
    this.doc.setFont("helvetica", "normal")
    this.doc.setFontSize(size)
    this.doc.setTextColor(...C.body)
    for (const line of bodyLines) {
      this.doc.text(line, MARGIN.left + 5.6, ty + size * MM)
      ty += lh
    }
    this.y = y0 + h + 3.6
  }

  // Tick-box checklist card. Items may be strings or [label, detail].
  checklist(title, items, opts = {}) {
    const { accent = C.accentDark } = opts
    const size = 9.1
    const lh = size * MM * 1.3
    const dh = 8.2 * MM * 1.3

    const prepared = items.map((it) => {
      const label = Array.isArray(it) ? it[0] : it
      const detail = Array.isArray(it) ? it[1] : null
      return { label: ascii(label), detail: detail ? ascii(detail) : null }
    })

    this.doc.setFont("helvetica", "normal")
    this.doc.setFontSize(size)
    let total = 4.4
    if (title) total += 5.8
    for (const it of prepared) {
      total += this.doc.splitTextToSize(it.label, CONTENT_W - 15).length * lh + 1.8
      if (it.detail) {
        total += this.doc.splitTextToSize(it.detail, CONTENT_W - 15).length * dh + 1.4
      }
    }
    total += 3.4

    this.need(total)
    const y0 = this.y
    this.rect(MARGIN.left, y0, CONTENT_W, total, [251, 253, 253])
    this.rect(MARGIN.left, y0, CONTENT_W, 0.8, accent)
    this.rect(MARGIN.left, y0 + total - 0.8, CONTENT_W, 0.8, accent)

    let ty = y0 + 4.4
    if (title) {
      this.doc.setFont("helvetica", "bold")
      this.doc.setFontSize(9.6)
      this.doc.setTextColor(...accent)
      this.doc.text(ascii(title), MARGIN.left + 4.6, ty + 3.4)
      ty += 5.8
    }

    for (const it of prepared) {
      this.doc.setDrawColor(168, 180, 188)
      this.doc.setLineWidth(0.25)
      this.doc.rect(MARGIN.left + 4.6, ty + 0.8, 3.4, 3.4)

      this.doc.setFont("helvetica", "bold")
      this.doc.setFontSize(size)
      this.doc.setTextColor(...C.ink)
      for (const line of this.doc.splitTextToSize(it.label, CONTENT_W - 15)) {
        this.doc.text(line, MARGIN.left + 10.8, ty + size * MM)
        ty += lh
      }
      ty += 1.8
      if (it.detail) {
        this.doc.setFont("helvetica", "normal")
        this.doc.setFontSize(8.2)
        this.doc.setTextColor(...C.muted)
        for (const line of this.doc.splitTextToSize(it.detail, CONTENT_W - 15)) {
          this.doc.text(line, MARGIN.left + 10.8, ty + 8.2 * MM)
          ty += dh
        }
        ty += 1.4
      }
    }
    this.y = y0 + total + 3.6
  }

  // Cover page (first thing drawn on a fresh document).
  cover({ title, subtitle, kicker, meta = [] }) {
    const d = this.doc
    this.rect(0, 0, PAGE_W, 78, C.accentDark)
    this.rect(0, 78, PAGE_W, 1.6, C.accent)

    d.setFont("helvetica", "bold")
    d.setFontSize(9)
    d.setTextColor(186, 230, 224)
    d.text(ascii(kicker || "READING MATERIAL").toUpperCase(), MARGIN.left, 26)

    d.setFontSize(26)
    d.setTextColor(255, 255, 255)
    let ty = 46
    for (const line of d.splitTextToSize(ascii(title), CONTENT_W)) {
      d.text(line, MARGIN.left, ty)
      ty += 10.6
    }

    d.setFont("helvetica", "normal")
    d.setFontSize(10.6)
    d.setTextColor(205, 235, 231)
    for (const line of d.splitTextToSize(ascii(subtitle || ""), CONTENT_W - 24)) {
      d.text(line, MARGIN.left, ty + 1.5)
      ty += 6.2
    }

    this.y = 100
    if (meta.length) {
      const endY = this.table(
        ["", ""],
        meta.map(([k, v]) => [k, v]),
        { widths: [48, CONTENT_W - 48], zebra: true, fontSize: 9, cellPadding: 2.4 }
      )
      // The empty header row is only a sizing device; paint over it.
      d.setFillColor(255, 255, 255)
      d.rect(MARGIN.left, 96.5, CONTENT_W, 7.2, "F")
      this.y = (typeof endY === "number" ? endY : this.y) + 2
    }

    d.setDrawColor(...C.rule)
    d.setLineWidth(0.3)
    d.line(MARGIN.left, PAGE_H - 42, PAGE_W - MARGIN.right, PAGE_H - 42)
    d.setFont("helvetica", "normal")
    d.setFontSize(8)
    d.setTextColor(...C.muted)
    d.text("Compiled from the repository sources: Production-Migration-Guide.pdf,", MARGIN.left, PAGE_H - 35)
    d.text("DevOps-Hardening-Complete.pdf and README.md.", MARGIN.left, PAGE_H - 31)
    d.text("Commands verified against the Makefile, compose files and scripts in the repo.", MARGIN.left, PAGE_H - 27)

    this.doc.addPage()
    this.page = 2
    this.y = CONTENT_TOP
  }

  // Table of contents built from marks recorded during pass 1.
  toc(entries, { title = "Contents" } = {}) {
    this.h1(title)
    const size = 9.4
    const rowH = 6.2
    this.doc.setFont("helvetica", "normal")
    this.doc.setFontSize(size)

    for (const [label, page] of entries) {
      const t = ascii(label)
      const pages = page == null ? "" : String(page)
      const pw = this.doc.getTextWidth(pages)
      const lines = this.doc.splitTextToSize(t, CONTENT_W - 16 - pw)

      this.need(lines.length * rowH)
      this.doc.setTextColor(...C.body)
      lines.forEach((line, i) => {
        this.doc.text(line, MARGIN.left + 3, this.y + size * MM)
        if (i === lines.length - 1) {
          const labelEnd = MARGIN.left + 3 + this.doc.getTextWidth(line)
          const pageStart = PAGE_W - MARGIN.right - pw
          this.doc.setDrawColor(...C.rule)
          this.doc.setLineWidth(0.2)
          this.doc.setLineDashPattern([0.5, 1.4], 0)
          this.doc.line(labelEnd + 2.2, this.y + 1.2, pageStart - 2.2, this.y + 1.2)
          this.doc.setLineDashPattern([], 0)
          this.doc.setTextColor(...C.accentDark)
          this.doc.text(pages, pageStart, this.y + size * MM)
        }
        this.y += rowH
      })
    }
  }

  // Stamp running header + footer on every page. Call once, at the end.
  finish({ footer = "", skipHeaderOn = [1] } = {}) {
    const d = this.doc
    const total = d.getNumberOfPages()
    for (let i = 1; i <= total; i++) {
      d.setPage(i)
      if (!skipHeaderOn.includes(i)) {
        d.setFont("helvetica", "normal")
        d.setFontSize(7.4)
        d.setTextColor(...C.muted)
        d.text(ascii(this.title), MARGIN.left, MARGIN.top - 6)
        if (this.subject) {
          const s = ascii(this.subject)
          d.text(s, PAGE_W - MARGIN.right - d.getTextWidth(s), MARGIN.top - 6)
        }
        d.setDrawColor(...C.rule)
        d.setLineWidth(0.2)
        d.line(MARGIN.left, MARGIN.top - 4, PAGE_W - MARGIN.right, MARGIN.top - 4)
      }
      d.setFont("helvetica", "normal")
      d.setFontSize(7.4)
      d.setTextColor(...C.muted)
      if (footer) d.text(ascii(footer), MARGIN.left, PAGE_H - MARGIN.bottom + 7)
      const right = `Page ${i} of ${total}`
      d.text(right, PAGE_W - MARGIN.right - d.getTextWidth(right), PAGE_H - MARGIN.bottom + 7)
    }
    this.page = total
    return total
  }

  save(path) {
    const buf = Buffer.from(this.doc.output("arraybuffer"))
    writeFileSync(path, buf)
    return buf.length
  }
}
