import { fmtNum } from "@/lib/format"

// Column definitions drive the on-screen tables, printing and the PDF / Excel exports alike:
//   { label, value: row => raw value, num: numeric (right-aligned, formatted),
//     format: value => text (instead of the standard number format), total: summed in the footer,
//     render: row => JSX for the screen only, strong / muted / mono: cell styling }

// Text shown for a cell on screen and in the PDF
export function cellText(col, row) {
  const value = col.value(row)
  if (value == null || value === "") return "—"
  if (col.format) return col.format(value)
  if (col.num) return fmtNum(value)
  return String(value)
}

// Raw value for Excel (numbers stay numbers)
export function cellValue(col, row) {
  const value = col.value(row)
  if (col.num) return value == null || value === "" ? "" : Number(value)
  return value == null ? "" : String(value)
}

// Footer row: "Total" in the first column, sums under the columns marked total
export function totalsRow(cols, rows) {
  if (!rows.length || !cols.some(c => c.total)) return null
  return cols.map((c, i) => {
    if (c.total) return rows.reduce((s, r) => s + (Number(c.value(r)) || 0), 0)
    return i === 0 ? "Total" : ""
  })
}

// Sections as ReportDocument and the exporters take them: { title?, cols, rows, empty?, footer }
export function withTotals(sections) {
  return sections.map(s => ({ ...s, footer: s.totals === false ? null : totalsRow(s.cols, s.rows) }))
}
