'use client'
import { useState, useEffect } from 'react'
import { NO_OWNER } from '@/lib/owners'
import styles from '@/dashboard/store.module.css'

function fmt(n) {
  return Number(n).toLocaleString()
}

const SCOPE_STORE = 'store'
const SCOPE_CATEGORY = 'category'
const SCOPE_EXTERNAL = 'external'
const SCOPE_FIELD = 'field'
const SCOPE_REF = 'ref'

const TYPE_LABEL = { IN: 'In', TRANSFER_IN: 'Transfer in', TRANSFER_OUT: 'Out', EDIT: 'Edit', DELETE: 'Removed', RESTORE: 'Restored' }
const KIND_BADGE = { Receipt: 'badgeOk', Issue: 'badgeLow', Transfer: 'pill' }

const dateCol = label => ({ label, value: r => new Date(r.date).toLocaleDateString(), mono: true })

// Columns per report type, shared by the on-screen table and the PDF / Excel exports.
// num: numeric (right-aligned, formatted); total: summed in the footer.
function columnsFor(scope) {
  const owner = { label: 'Owner', value: r => r.ownerName ?? r.owner }
  switch (scope) {
    case SCOPE_STORE:
    case SCOPE_CATEGORY:
      return [
        ...(scope === SCOPE_CATEGORY ? [{ label: 'Store', value: r => r.storeName }] : []),
        { label: 'Product', value: r => r.productName, strong: true },
        owner,
        { label: 'Unit', value: r => r.unit, mono: true },
        { label: 'Opening', value: r => r.opening, num: true, total: true },
        { label: 'Added', value: r => r.added, num: true, total: true },
        { label: 'Deducted', value: r => r.deducted, num: true, total: true },
        { label: 'Closing', value: r => r.closing, num: true, total: true },
      ]
    case SCOPE_EXTERNAL:
      return [
        dateCol('Date'),
        { label: 'Ref no.', value: r => r.refNo || '—', mono: true },
        { label: 'Recipient', value: r => r.recipientName },
        { label: 'Company', value: r => r.recipientCompany || '—', hint: true },
        { label: 'Product', value: r => r.product, strong: true },
        owner,
        { label: 'Unit', value: r => r.unit, mono: true },
        { label: 'Qty', value: r => r.quantity, num: true },
        { label: 'From store', value: r => r.store },
        { label: 'Issued by', value: r => r.issuedBy || '—', hint: true },
      ]
    case SCOPE_FIELD:
      return [
        dateCol('Date'),
        { label: 'Ref no.', value: r => r.refNo || '—', mono: true },
        { label: 'Project', value: r => r.project },
        { label: 'From store', value: r => r.store },
        { label: 'Product', value: r => r.product, strong: true },
        owner,
        { label: 'Unit', value: r => r.unit, mono: true },
        { label: 'Qty', value: r => r.quantity, num: true },
        { label: 'Rate', value: r => r.rate, num: true },
        { label: 'Value (UGX)', value: r => r.value, num: true, total: true },
        { label: 'Issued by', value: r => r.issuedBy || '—', hint: true },
      ]
    default:
      return [
        { label: 'Product', value: r => r.product, strong: true },
        owner,
        { label: 'Unit', value: r => r.unit, mono: true },
        { label: 'Type', value: r => TYPE_LABEL[r.type] ?? r.type },
        { label: 'Qty', value: r => r.quantity, num: true },
        { label: 'Rate', value: r => r.rate, num: true },
        { label: 'Amount', value: r => r.value, num: true, total: true },
        { label: 'Store', value: r => r.store },
        { label: 'Note', value: r => r.note || '—', hint: true },
        { label: 'By', value: r => r.addedBy || '—', hint: true },
        { label: 'Date', value: r => new Date(r.date).toLocaleString(), mono: true },
      ]
  }
}

const EMPTY_TEXT = {
  [SCOPE_STORE]: 'No activity in this period.',
  [SCOPE_CATEGORY]: 'No activity in this period.',
  [SCOPE_EXTERNAL]: 'No issues to external parties in this period.',
  [SCOPE_FIELD]: 'No stock used on projects in this period.',
  [SCOPE_REF]: 'No entries found for this ref no.',
}

const SUBTITLE = {
  [SCOPE_STORE]: 'Single store',
  [SCOPE_CATEGORY]: 'Category-wide',
  [SCOPE_EXTERNAL]: 'Issued to external parties',
  [SCOPE_FIELD]: 'Stock used on projects (field records)',
}

// Company details shown on the right of every report header (screen, print, PDF, Excel)
function companyLines(settings) {
  return [settings?.companyName, settings?.address, settings?.phone, settings?.email].filter(Boolean)
}

// Loads the logo for the PDF; returns null when the image can't be fetched (e.g. the host blocks it)
async function loadLogo(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = dataUrl
    })
    return { dataUrl, width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return null
  }
}

// Footer row: "Total" in the first column, sums under columns marked total
function totalsRow(cols, rows) {
  if (!rows.length || !cols.some(c => c.total)) return null
  return cols.map((c, i) => {
    if (c.total) return rows.reduce((s, r) => s + (Number(c.value(r)) || 0), 0)
    return i === 0 ? 'Total' : ''
  })
}

export default function ReportBuilder({ categories, owners = [], projects = [], initialScope = SCOPE_STORE }) {
  const [scope, setScope] = useState(initialScope)
  const [categoryId, setCategoryId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [refNoInput, setRefNoInput] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recipients, setRecipients] = useState([])
  const [recipientFilter, setRecipientFilter] = useState('')
  const [refList, setRefList] = useState([])
  const [showRefList, setShowRefList] = useState(false)
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    fetch('/api/recipients')
      .then(res => res.json())
      .then(data => setRecipients(Array.isArray(data) ? data : []))
      .catch(() => setRecipients([]))
    fetch('/api/settings').then(res => res.json()).then(setSettings).catch(() => {})
  }, [])

  // Ref no. suggestions follow what's typed; an empty box lists the most recent ones
  useEffect(() => {
    if (scope !== SCOPE_REF || !showRefList) return undefined
    const timer = setTimeout(() => {
      const q = refNoInput.trim()
      fetch(`/api/receipts${q ? `?q=${encodeURIComponent(q)}` : ''}`)
        .then(res => res.json())
        .then(data => setRefList(Array.isArray(data) ? data : []))
        .catch(() => setRefList([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [scope, refNoInput, showRefList])

  const allStores = categories.flatMap(c => c.stores.map(s => ({ ...s, categoryId: c.id, categoryName: c.name })))
  const ownerName = ownerFilter === NO_OWNER ? 'No owner' : owners.find(o => o.id === ownerFilter)?.name

  async function fetchReport(params) {
    setLoading(true); setError(''); setReport(null)
    try {
      const res = await fetch(`/api/reports?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReport({ ...data, ownerName: data.scope === SCOPE_REF ? null : ownerName })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function generate(e) {
    e.preventDefault()
    if (scope !== SCOPE_REF && (!from || !to)) { setError('Both dates are required.'); return }
    if (scope === SCOPE_STORE && !storeId) { setError('Select a store.'); return }
    if (scope === SCOPE_CATEGORY && !categoryId) { setError('Select a category.'); return }
    if (scope === SCOPE_REF && !refNoInput.trim()) { setError('Enter a ref no.'); return }

    if (scope === SCOPE_REF) {
      setShowRefList(false)
      fetchReport(new URLSearchParams({ refNo: refNoInput.trim() }))
      return
    }

    const params = new URLSearchParams({ from, to })
    if (scope === SCOPE_STORE) params.set('storeId', storeId)
    else if (scope === SCOPE_CATEGORY) params.set('categoryId', categoryId)
    else if (scope === SCOPE_FIELD) params.set('project', projectFilter || 'true')
    else params.set('external', recipientFilter || 'true')
    if (ownerFilter) params.set('ownerId', ownerFilter)
    fetchReport(params)
  }

  function pickRef(refNo) {
    setRefNoInput(refNo)
    setShowRefList(false)
    fetchReport(new URLSearchParams({ refNo }))
  }

  const cols = report ? columnsFor(report.scope) : []
  const footer = report ? totalsRow(cols, report.rows) : null
  const subtitle = report && report.scope !== SCOPE_REF
    ? [`${report.from} to ${report.to}`, SUBTITLE[report.scope], report.ownerName && `Owner: ${report.ownerName}`].filter(Boolean).join(' · ')
    : ''
  const fileBase = !report ? '' : report.scope === SCOPE_REF
    ? `receipt-${report.refNo || 'unknown'}`
    : `${report.scope === SCOPE_FIELD ? 'field-records' : 'report'}-${report.from}-to-${report.to}`

  async function exportPdf() {
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default

    const doc = new jsPDF({ orientation: cols.length > 8 ? 'landscape' : 'portrait' })
    const margin = 14
    const right = doc.internal.pageSize.getWidth() - margin

    // Left: report title and period
    doc.setFontSize(13)
    doc.text(report.label, margin, 20)
    let leftY = 26
    if (subtitle) {
      doc.setFontSize(9)
      doc.setTextColor(100)
      doc.text(subtitle, margin, leftY)
      doc.setTextColor(0)
      leftY += 6
    }

    // Right: logo, then company name, location, phone and email, right-aligned
    let rightY = 12
    const logo = await loadLogo(settings?.logoUrl)
    if (logo) {
      const h = 14
      const w = Math.min((logo.width / logo.height) * h, 50)
      try {
        doc.addImage(logo.dataUrl, right - w, rightY, w, h)
        rightY += h + 5
      } catch {
        // Unsupported image format; carry on without the logo
      }
    }
    companyLines(settings).forEach((line, i) => {
      doc.setFontSize(i === 0 ? 11 : 9)
      doc.setTextColor(i === 0 ? 0 : 100)
      doc.text(line, right, rightY + (i === 0 ? 3 : 0), { align: 'right' })
      rightY += i === 0 ? 8 : 5
    })
    doc.setTextColor(0)

    const y = Math.max(leftY, rightY) + 4

    const numeric = { halign: 'right' }
    autoTable(doc, {
      startY: y,
      head: [cols.map(c => c.label)],
      body: report.rows.map(r => cols.map(c => (c.num ? fmt(c.value(r)) : c.value(r)))),
      foot: footer ? [footer.map(v => (typeof v === 'number' ? fmt(v) : v))] : undefined,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
      headStyles: { fillColor: [40, 40, 40], textColor: 255, halign: 'left' },
      footStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(cols.flatMap((c, i) => (c.num ? [[i, numeric]] : []))),
    })

    doc.save(`${fileBase}.pdf`)
  }

  async function exportExcel() {
    const XLSX = await import('xlsx')

    // Title on the left, company details in the last column (right side)
    const left = [report.label, subtitle].filter(Boolean)
    const company = companyLines(settings)
    const headerRows = Array.from({ length: Math.max(left.length, company.length) }, (_, i) => {
      const row = Array(cols.length).fill('')
      row[0] = left[i] ?? ''
      if (company[i]) row[cols.length - 1] = company[i]
      return row
    })
    headerRows.push([])

    const rows = report.rows.map(r => cols.map(c => c.value(r)))
    const sheetData = [...headerRows, cols.map(c => c.label), ...rows, ...(footer ? [footer] : [])]
    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    ws['!cols'] = cols.map(() => ({ wch: 16 }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, `${fileBase}.xlsx`)
  }

  const isField = scope === SCOPE_FIELD

  return (
    <>
      <div className={styles.topbar} data-no-print="true">
        <div className={styles.topbarLeft}>
          <h2 className={styles.storeName}>{isField ? 'Field records' : 'Reports'}</h2>
          <span className={styles.storeMeta}>
            {isField ? 'Stock used on projects in a given period' : 'Opening/closing balance in a given period'}
          </span>
        </div>
      </div>

      <div className={styles.content}>
        <form onSubmit={generate} className={styles.field} style={{ maxWidth: 640, marginBottom: 24 }} data-no-print="true">
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Report for</label>
              <select
                value={scope}
                onChange={e => {
                  setScope(e.target.value); setStoreId(''); setCategoryId(''); setRecipientFilter(''); setProjectFilter('')
                  setShowRefList(false); setReport(null); setError('')
                }}
              >
                <option value={SCOPE_STORE}>A single store</option>
                <option value={SCOPE_CATEGORY}>A whole category</option>
                <option value={SCOPE_FIELD}>Field records (used on projects)</option>
                <option value={SCOPE_EXTERNAL}>External recipients</option>
                <option value={SCOPE_REF}>Lookup by Ref No.</option>
              </select>
            </div>

            {scope === SCOPE_STORE && (
              <div className={styles.field}>
                <label>Store</label>
                <select value={storeId} onChange={e => setStoreId(e.target.value)}>
                  <option value="">— select store —</option>
                  {allStores.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.categoryName})</option>
                  ))}
                </select>
              </div>
            )}

            {scope === SCOPE_CATEGORY && (
              <div className={styles.field}>
                <label>Category</label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                  <option value="">— select category —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {scope === SCOPE_FIELD && (
              <div className={styles.field}>
                <label>Project</label>
                <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
                  <option value="">All projects</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.location ? ` (${p.location})` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {scope === SCOPE_EXTERNAL && (
              <div className={styles.field}>
                <label>Recipient</label>
                <select value={recipientFilter} onChange={e => setRecipientFilter(e.target.value)}>
                  <option value="">All recipients</option>
                  {recipients.map(r => (
                    <option key={r.id} value={r.id}>{r.name}{r.company ? ` (${r.company})` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {scope === SCOPE_REF && (
              <div className={styles.field} style={{ position: 'relative' }}>
                <label>Ref No.</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={refNoInput}
                    onChange={e => { setRefNoInput(e.target.value); setShowRefList(true) }}
                    onFocus={() => setShowRefList(true)}
                    onKeyDown={e => { if (e.key === 'Escape') setShowRefList(false) }}
                    placeholder="Type to search, e.g. RCT-0091"
                    style={{ flex: 1 }}
                  />
                  <button type="button" className={styles.btnGhost} onClick={() => setShowRefList(s => !s)}>
                    {showRefList ? 'Close' : 'Browse'}
                  </button>
                </div>
                {showRefList && (
                  <div className={styles.suggestList}>
                    {refList.length === 0 ? (
                      <div className={styles.suggestEmpty}>
                        {refNoInput.trim() ? `No ref nos. matching "${refNoInput.trim()}".` : 'No ref nos. recorded yet.'}
                      </div>
                    ) : refList.map(r => (
                      <button
                        type="button"
                        key={r.id}
                        className={styles.suggestItem}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => pickRef(r.refNo)}
                      >
                        <span className={styles.suggestTop}>
                          <strong>{r.refNo}</strong>
                          <span className={styles[KIND_BADGE[r.kind]]}>{r.kind}</span>
                        </span>
                        <span className={styles.fieldHint}>
                          {new Date(r.date).toLocaleDateString()} · {r.items} item{r.items === 1 ? '' : 's'} · {r.preview}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {scope !== SCOPE_REF && (
            <div className={styles.fieldRow} style={{ marginTop: 12, gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div className={styles.field}>
                <label>From</label>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>To</label>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>Stock owner</label>
                <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
                  <option value="">All owners</option>
                  <option value={NO_OWNER}>No owner</option>
                  {owners.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {error && <p className={styles.errorMsg}>{error}</p>}

          <button type="submit" className={styles.btnPrimary} disabled={loading} style={{ marginTop: 12 }}>
            {loading ? 'Generating…' : 'Generate report'}
          </button>
        </form>

        {report && (
          <div className={styles.reportActions} data-no-print="true">
            <span className={styles.fieldHint}>
              {report.rows.length} row{report.rows.length === 1 ? '' : 's'}
            </span>
            <div className={styles.rowActions}>
              <button className={styles.btnGhost} onClick={() => window.print()}>
                <i className="ti ti-printer" /> Print
              </button>
              <button className={styles.btnGhost} onClick={exportPdf}>
                <i className="ti ti-file-type-pdf" /> Generate PDF
              </button>
              <button className={styles.btnGhost} onClick={exportExcel}>
                <i className="ti ti-file-spreadsheet" /> Export to Excel
              </button>
            </div>
          </div>
        )}

        {report && (
          <div id="report-printable">
            <div className={styles.reportHeader}>
              <div>
                <h3 style={{ marginBottom: 4 }}>{report.label}</h3>
                {subtitle && <p className={styles.storeMeta}>{subtitle}</p>}
              </div>
              {(settings?.logoUrl || companyLines(settings).length > 0) && (
                <div className={styles.companyBlock}>
                  {settings?.logoUrl && <img src={settings.logoUrl} alt="" className={styles.companyLogo} />}
                  {settings?.companyName && <div className={styles.companyName}>{settings.companyName}</div>}
                  {settings?.address && <div className={styles.fieldHint}>{settings.address}</div>}
                  {settings?.phone && <div className={styles.fieldHint}>{settings.phone}</div>}
                  {settings?.email && <div className={styles.fieldHint}>{settings.email}</div>}
                </div>
              )}
            </div>

            <div className={styles.tableWrap} style={{ overflowX: 'auto' }}>
              <table className={styles.table}>
                <thead>
                  <tr>{cols.map(c => <th key={c.label}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={i}>
                      {cols.map(c => (
                        <td
                          key={c.label}
                          className={c.strong ? styles.itemName : c.num || c.mono ? styles.mono : c.hint ? styles.fieldHint : undefined}
                        >
                          {c.num ? fmt(c.value(r)) : c.value(r)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {report.rows.length === 0 && (
                    <tr><td colSpan={cols.length} className={styles.fieldHint}>{EMPTY_TEXT[report.scope]}</td></tr>
                  )}
                </tbody>
                {footer && (
                  <tfoot>
                    <tr>
                      {footer.map((v, i) => (
                        <td key={i} className={typeof v === 'number' ? styles.mono : styles.itemName}>
                          {typeof v === 'number' ? fmt(v) : v}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
