// PDF and Excel exports for reports, product history and transaction notes (browser only).
// A document is a title, optional subtitle and meta lines, the company block on the right,
// one or more table sections and, for notes, signature blocks.
//   sections:   [{ title?, sheet?, cols, rows, footer?, empty? }]  (see lib/tables withTotals)
//   meta:       [[label, value]]
//   signatures: [{ label, name? }]
import { cellText, cellValue } from "@/lib/tables"
import { fmtDateTime, fmtNum } from "@/lib/format"

export function companyLines(settings) {
  return [settings?.companyName, settings?.address, settings?.phone, settings?.email].filter(Boolean)
}

// Loads the logo as a PNG data URL (any browser-readable format works, SVG included).
// Returns null when the image can't be read, e.g. a remote host that blocks it.
async function loadLogo(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const objectUrl = URL.createObjectURL(await res.blob())
    try {
      const img = await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = objectUrl
      })
      const width = img.naturalWidth || 300
      const height = img.naturalHeight || 100
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      canvas.getContext("2d").drawImage(img, 0, 0, width, height)
      return { dataUrl: canvas.toDataURL("image/png"), width, height }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}

const INK = [15, 23, 42]
const MUTED = [100, 116, 139]
const HEAD_FILL = [30, 41, 59]
const FOOT_FILL = [241, 245, 249]
const STRIPE_FILL = [248, 250, 252]
const MARGIN = 14

function isWide(spec) {
  return spec.sections.some(s => s.cols.length > 8)
}

// Draws one document starting on the current page
function drawDocument(pdf, autoTable, { title, subtitle, meta = [], sections, signatures = [] }, settings, logo) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const right = pageWidth - MARGIN

  // Left: title, subtitle and meta lines
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(15)
  pdf.setTextColor(...INK)
  pdf.text(title, MARGIN, 20)
  let leftY = 26
  pdf.setFont("helvetica", "normal")
  if (subtitle) {
    const lines = pdf.splitTextToSize(subtitle, pageWidth / 2)
    pdf.setFontSize(9)
    pdf.setTextColor(...MUTED)
    pdf.text(lines, MARGIN, leftY)
    leftY += 4.5 * lines.length + 1
  }
  meta.forEach(([label, value]) => {
    pdf.setFontSize(9)
    pdf.setTextColor(...MUTED)
    pdf.text(`${label}:`, MARGIN, leftY)
    pdf.setTextColor(...INK)
    pdf.text(String(value ?? "—"), MARGIN + 27, leftY)
    leftY += 5
  })

  // Right: logo, then company name, location, phone and email
  let rightY = 12
  if (logo) {
    const h = 14
    const w = Math.min((logo.width / logo.height) * h, 55)
    try {
      pdf.addImage(logo.dataUrl, "PNG", right - w, rightY, w, h)
      rightY += h + 5
    } catch {
      // Unreadable image; carry on without the logo
    }
  }
  companyLines(settings).forEach((line, i) => {
    pdf.setFont("helvetica", i === 0 ? "bold" : "normal")
    pdf.setFontSize(i === 0 ? 11 : 9)
    pdf.setTextColor(...(i === 0 ? INK : MUTED))
    pdf.text(line, right, rightY + (i === 0 ? 3 : 0), { align: "right" })
    rightY += i === 0 ? 8 : 4.5
  })
  pdf.setFont("helvetica", "normal")

  let y = Math.max(leftY, rightY) + 2
  pdf.setDrawColor(226, 232, 240)
  pdf.line(MARGIN, y, right, y)
  y += 6

  sections.forEach(section => {
    if (section.title) {
      if (y > pageHeight - 40) { pdf.addPage(); y = 20 }
      pdf.setFont("helvetica", "bold")
      pdf.setFontSize(10.5)
      pdf.setTextColor(...INK)
      pdf.text(section.title, MARGIN, y)
      pdf.setFont("helvetica", "normal")
      y += 3
    }
    autoTable(pdf, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 18 },
      head: [section.cols.map(c => c.label)],
      body: section.rows.length
        ? section.rows.map(r => section.cols.map(c => cellText(c, r)))
        : [[{ content: section.empty || "Nothing to show.", colSpan: section.cols.length, styles: { textColor: MUTED } }]],
      foot: section.footer ? [section.footer.map(v => (typeof v === "number" ? fmtNum(v) : v))] : undefined,
      showFoot: "lastPage",
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2.4, valign: "middle", lineColor: [226, 232, 240], lineWidth: 0.2, textColor: [30, 41, 59] },
      headStyles: { fillColor: HEAD_FILL, textColor: 255, fontStyle: "bold", halign: "left" },
      footStyles: { fillColor: FOOT_FILL, textColor: INK, fontStyle: "bold" },
      alternateRowStyles: { fillColor: STRIPE_FILL },
      columnStyles: Object.fromEntries(section.cols.flatMap((c, i) => (c.num ? [[i, { halign: "right" }]] : []))),
      didParseCell: data => {
        if ((data.section === "head" || data.section === "foot") && section.cols[data.column.index]?.num)
          data.cell.styles.halign = "right"
      },
    })
    y = pdf.lastAutoTable.finalY + 10
  })

  if (signatures.length) {
    if (y + 34 > pageHeight - 18) { pdf.addPage(); y = 24 }
    const gap = 10
    const width = (pageWidth - MARGIN * 2 - gap * (signatures.length - 1)) / signatures.length
    signatures.forEach((sig, i) => {
      const x = MARGIN + i * (width + gap)
      pdf.setFont("helvetica", "bold")
      pdf.setFontSize(9)
      pdf.setTextColor(...INK)
      pdf.text(sig.label, x, y)
      pdf.setFont("helvetica", "normal")
      pdf.setFontSize(8)
      pdf.setDrawColor(148, 163, 184)
      ;["Name", "Signature", "Date"].forEach((line, j) => {
        const ly = y + 9 + j * 8
        pdf.setTextColor(...MUTED)
        pdf.text(line, x, ly)
        pdf.line(x + 17, ly + 0.5, x + width, ly + 0.5)
        if (line === "Name" && sig.name) {
          pdf.setTextColor(...INK)
          pdf.text(sig.name, x + 18, ly - 0.6)
        }
      })
    })
  }
}

// Builds and downloads a PDF holding one or more documents, each starting on a new page
export async function exportPdfDocuments({ documents, settings, fileBase }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")])
  const logo = await loadLogo(settings?.logoUrl)
  const pdf = new jsPDF({ orientation: isWide(documents[0]) ? "landscape" : "portrait", unit: "mm", format: "a4" })

  documents.forEach((spec, i) => {
    if (i > 0) pdf.addPage("a4", isWide(spec) ? "landscape" : "portrait")
    drawDocument(pdf, autoTable, spec, settings, logo)
  })

  // Footer on every page
  const pages = pdf.internal.getNumberOfPages()
  const stamp = `Generated by StockFlow · ${fmtDateTime(new Date())}`
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i)
    const width = pdf.internal.pageSize.getWidth()
    const height = pdf.internal.pageSize.getHeight()
    pdf.setFontSize(7.5)
    pdf.setTextColor(...MUTED)
    pdf.text(stamp, MARGIN, height - 8)
    pdf.text(`Page ${i} of ${pages}`, width - MARGIN, height - 8, { align: "right" })
  }

  pdf.save(`${fileBase}.pdf`)
}

export async function exportPdf({ settings, fileBase, ...spec }) {
  return exportPdfDocuments({ documents: [spec], settings, fileBase })
}

function sheetName(name, used) {
  const base = (name || "Report").replace(/[[\]:*?/\\]/g, " ").slice(0, 28).trim() || "Report"
  let candidate = base
  for (let n = 2; used.has(candidate); n++) candidate = `${base} ${n}`
  used.add(candidate)
  return candidate
}

// One sheet per section, each headed by the title (left) and company details (right)
export async function exportExcel({ title, subtitle, meta = [], settings, fileBase, sections }) {
  const XLSX = await import("xlsx")
  const wb = XLSX.utils.book_new()
  const used = new Set()

  sections.forEach(section => {
    const width = Math.max(section.cols.length, 2)
    const left = [
      title,
      sections.length > 1 ? section.title : null,
      subtitle,
      ...meta.map(([label, value]) => `${label}: ${value ?? "—"}`),
    ].filter(Boolean)
    const company = companyLines(settings)
    const headerRows = Array.from({ length: Math.max(left.length, company.length) }, (_, i) => {
      const row = Array(width).fill("")
      row[0] = left[i] ?? ""
      if (company[i]) row[width - 1] = company[i]
      return row
    })

    const body = section.rows.map(r => section.cols.map(c => cellValue(c, r)))
    const ws = XLSX.utils.aoa_to_sheet([
      ...headerRows,
      [],
      section.cols.map(c => c.label),
      ...body,
      ...(section.footer ? [section.footer] : []),
    ])
    ws["!cols"] = section.cols.map((c, i) => {
      const longest = Math.max(c.label.length, ...body.map(r => String(r[i] ?? "").length))
      return { wch: Math.min(Math.max(longest + 2, 10), 45) }
    })
    XLSX.utils.book_append_sheet(wb, ws, sheetName(section.sheet || section.title, used))
  })

  XLSX.writeFile(wb, `${fileBase}.xlsx`)
}

// Safe file-name part, e.g. from a ref no. or product name
export function fileSafe(text) {
  return String(text || "export").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "export"
}
