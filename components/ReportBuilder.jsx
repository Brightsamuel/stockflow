'use client'
import { useState, useEffect } from 'react'
import styles from '@/dashboard/store.module.css'

function fmt(n) {
  return Number(n).toLocaleString()
}

const SCOPE_STORE = 'store'
const SCOPE_CATEGORY = 'category'
const SCOPE_EXTERNAL = 'external'
const SCOPE_REF = 'ref'

export default function ReportBuilder({ categories }) {
  const [scope, setScope] = useState(SCOPE_STORE)
  const [categoryId, setCategoryId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [refNoInput, setRefNoInput] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recipients, setRecipients] = useState([])
  const [recipientFilter, setRecipientFilter] = useState('')
  const [receipts, setReceipts] = useState([])
  const [showReceipts, setShowReceipts] = useState(false)

  useEffect(() => {
  fetch('/api/recipients')
    .then(res => res.json())
    .then(data => setRecipients(Array.isArray(data) ? data : []))
    .catch(() => setRecipients([]))
  }, [])

  const [settings, setSettings] = useState(null)

    useEffect(() => {
      fetch('/api/settings').then(res => res.json()).then(setSettings).catch(() => {})
    }, [])

  const allStores = categories.flatMap(c => c.stores.map(s => ({ ...s, categoryId: c.id, categoryName: c.name })))

  async function generate(e) {
    e.preventDefault()
    if (scope !== SCOPE_REF && (!from || !to)) { setError('Both dates are required.'); return }
    if (scope === SCOPE_STORE && !storeId) { setError('Select a store.'); return }
    if (scope === SCOPE_CATEGORY && !categoryId) { setError('Select a category.'); return }
    if (scope === SCOPE_REF && !refNoInput.trim()) { setError('Enter a ref no.'); return }

    setLoading(true); setError(''); setReport(null)
    try {
      const params = new URLSearchParams({ from, to })
      if (scope === SCOPE_REF) {
        params.set('refNo', refNoInput.trim())
      } else if (scope === SCOPE_STORE) params.set('storeId', storeId)
      else if (scope === SCOPE_CATEGORY) params.set('categoryId', categoryId)
      else params.set('external', recipientFilter || 'true')

      const res = await fetch(`/api/reports?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReport(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totals = report?.rows.reduce((acc, r) => ({
    opening: acc.opening + r.opening,
    added: acc.added + r.added,
    deducted: acc.deducted + r.deducted,
    closing: acc.closing + r.closing,
  }), { opening: 0, added: 0, deducted: 0, closing: 0 })

  async function exportPdf() {
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default

    const doc = new jsPDF()
    let y = 15

    if (settings?.companyName) {
      doc.setFontSize(14)
      doc.text(settings.companyName, 14, y)
      y += 6
      doc.setFontSize(9)
      doc.setTextColor(100)
      if (settings.address) { doc.text(settings.address, 14, y); y += 5 }
      const contact = [settings.phone, settings.email].filter(Boolean).join(' · ')
      if (contact) { doc.text(contact, 14, y); y += 5 }
      doc.setTextColor(0)
      y += 4
    }

    doc.setFontSize(12)
    doc.text(report.label, 14, y)
    y += 6
    doc.setFontSize(9)
    doc.setTextColor(100)
    // handle missing from/to for ref reports by deriving range from rows
    let fromText = report.from
    let toText = report.to
    if ((!fromText || !toText) && Array.isArray(report.rows) && report.rows.length > 0) {
      const dates = report.rows.map(r => new Date(r.date)).filter(d => !isNaN(d))
      if (dates.length) {
        const min = new Date(Math.min(...dates.map(d => d.getTime())))
        const max = new Date(Math.max(...dates.map(d => d.getTime())))
        fromText = fromText || min.toLocaleDateString()
        toText = toText || max.toLocaleDateString()
      }
    }
    const rangeText = (fromText || '') + (toText ? ` to ${toText}` : '')
    if (rangeText) doc.text(rangeText, 14, y)
    doc.setTextColor(0)
    y += 6

    const numericStyle = { halign: 'right' }

    if (report.scope === 'external') {
      autoTable(doc, {
        startY: y,
        head: [['Date', 'Recipient', 'Company', 'Product', 'Unit', 'Qty', 'From store', 'Issued by']],
        body: report.rows.map(r => [
          new Date(r.date).toLocaleDateString(),
          r.recipientName,
          r.recipientCompany || '—',
          r.product,
          r.unit,
          fmt(r.quantity),
          r.store,
          r.issuedBy || '—',
        ]),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
        headStyles: { fillColor: [40, 40, 40], textColor: 255, halign: 'left' },
        columnStyles: { 5: numericStyle },
      })
    } else {
      const head = report.scope === 'category'
        ? [['Store', 'Product', 'Unit', 'Opening', 'Added', 'Deducted', 'Closing']]
        : [['Product', 'Unit', 'Opening', 'Added', 'Deducted', 'Closing']]

      const body = report.rows.map(r => {
        const row = report.scope === 'category' ? [r.storeName] : []
        return [...row, r.productName, r.unit, fmt(r.opening), fmt(r.added), fmt(r.deducted), fmt(r.closing)]
      })

      const numericCols = report.scope === 'category' ? [3, 4, 5, 6] : [2, 3, 4, 5]
      const columnStyles = Object.fromEntries(numericCols.map(i => [i, numericStyle]))

      autoTable(doc, {
        startY: y,
        head,
        body,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
        headStyles: { fillColor: [40, 40, 40], textColor: 255, halign: 'left' },
        columnStyles,
        foot: report.rows.length > 0 ? [(() => {
          const totals = report.rows.reduce((acc, r) => ({
            opening: acc.opening + r.opening, added: acc.added + r.added,
            deducted: acc.deducted + r.deducted, closing: acc.closing + r.closing,
          }), { opening: 0, added: 0, deducted: 0, closing: 0 })
          const row = report.scope === 'category' ? ['', 'Total'] : ['Total']
          return [...row, ...(report.scope === 'category' ? [''] : ['']), fmt(totals.opening), fmt(totals.added), fmt(totals.deducted), fmt(totals.closing)]
        })()] : undefined,
        footStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: 'bold' },
      })
    }

    const filename = report.scope === 'ref' ? `receipt-${report.refNo || 'unknown'}.pdf` : `report-${report.from || 'n-a'}-to-${report.to || 'n-a'}.pdf`
    doc.save(filename)
  }

  return (
    <>
      <div className={styles.topbar} data-no-print="true">
        <div className={styles.topbarLeft}>
          <h2 className={styles.storeName}>Reports</h2>
          <span className={styles.storeMeta}>Opening/closing balance in a given period</span>
        </div>
        {report && (
          <div className={styles.topbarActions}>
            <button className={styles.btnGhost} onClick={() => window.print()}>
              <i className="ti ti-printer" /> Print
            </button>
            <button className={styles.btnGhost} onClick={exportPdf}>
              <i className="ti ti-file-type-pdf" /> Export PDF
            </button>
          </div>
        )}
      </div>

      <div className={styles.content}>
        <form onSubmit={generate} className={styles.field} style={{ maxWidth: 560, marginBottom: 24 }} data-no-print="true">
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Report for</label>
              <select value={scope} onChange={e => { setScope(e.target.value); setStoreId(''); setCategoryId(''); setRecipientFilter('') }}>
                <option value={SCOPE_STORE}>A single store</option>
                <option value={SCOPE_CATEGORY}>A whole category</option>
                <option value={SCOPE_EXTERNAL}>External recipients</option>
                <option value={SCOPE_REF}>Lookup by Ref No.</option>
              </select>
            </div>

            {scope === SCOPE_STORE ? (
              <div className={styles.field}>
                <label>Store</label>
                <select value={storeId} onChange={e => setStoreId(e.target.value)}>
                  <option value="">— select store —</option>
                  {allStores.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.categoryName})</option>
                  ))}
                </select>
              </div>
            ) : scope === SCOPE_CATEGORY ? (
              <div className={styles.field}>
                <label>Category</label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                  <option value="">— select category —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            ) : scope === SCOPE_REF ? (
              <div className={styles.field}>
                <label>Ref No.</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={refNoInput} onChange={e => setRefNoInput(e.target.value)} placeholder="e.g. RCT-0091" />
                  <button type="button" className={styles.btnGhost} onClick={async () => {
                    const next = !showReceipts
                    setShowReceipts(next)
                    if (next && receipts.length === 0) {
                      try {
                        const res = await fetch('/api/receipts')
                        const data = await res.json()
                        setReceipts(Array.isArray(data) ? data : [])
                      } catch (e) {
                        setReceipts([])
                      }
                    }
                  }}>{showReceipts ? 'Close' : 'Browse receipts'}</button>
                </div>
                {showReceipts && (
                  <div style={{ marginTop: 8, maxHeight: 200, overflow: 'auto', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: 8 }}>
                    {receipts.length === 0 ? (
                      <div className={styles.fieldHint}>No receipts found.</div>
                    ) : (
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {receipts.map(r => (
                          <li key={r.id} style={{ padding: '6px 4px', borderBottom: '0.5px solid rgba(255,255,255,0.03)' }}>
                            <button type="button" className={styles.btnGhost} style={{ width: '100%', textAlign: 'left' }} onClick={async () => {
                              setRefNoInput(r.refNo);
                              setShowReceipts(false);
                              setLoading(true); setError(''); setReport(null);
                              try {
                                const params = new URLSearchParams({ refNo: r.refNo })
                                const res = await fetch(`/api/reports?${params}`)
                                const data = await res.json()
                                if (!res.ok) throw new Error(data.error)
                                setReport(data)
                              } catch (err) {
                                setError(err.message)
                              } finally {
                                setLoading(false)
                              }
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{r.refNo}</span>
                                <span className={styles.fieldHint}>{new Date(r.createdAt).toLocaleString()}</span>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ) : (
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
          </div>

          <div className={styles.fieldRow} style={{ marginTop: 12 }}>
            <div className={styles.field}>
              <label>From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}

          <button type="submit" className={styles.btnPrimary} disabled={loading} style={{ marginTop: 12 }}>
            {loading ? 'Generating…' : 'Generate report'}
          </button>
        </form>

        {report && report.scope === 'external' && (
          <div id="report-printable">
            <div style={{ marginBottom: 16 }}>
              {settings?.companyName && (
                <div style={{ marginBottom: 12 }}>
                  {settings.logoUrl && <img src={settings.logoUrl} alt="" style={{ height: 40, marginBottom: 6 }} />}
                  <div style={{ fontWeight: 600 }}>{settings.companyName}</div>
                  {settings.address && <div className={styles.fieldHint}>{settings.address}</div>}
                  {(settings.phone || settings.email) && (
                    <div className={styles.fieldHint}>{[settings.phone, settings.email].filter(Boolean).join(' · ')}</div>
                  )}
                </div>
              )}
              <h3 style={{ marginBottom: 4 }}>{report.label}</h3>
              <p className={styles.storeMeta}>{report.from} to {report.to} · Issued to external parties</p>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Recipient</th>
                    <th>Company</th>
                    <th>Product</th>
                    <th>Unit</th>
                    <th>Qty</th>
                    <th>From store</th>
                    <th>Issued by</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={i}>
                      <td className={styles.mono}>{new Date(r.date).toLocaleDateString()}</td>
                      <td>{r.recipientName}</td>
                      <td className={styles.fieldHint}>{r.recipientCompany || '—'}</td>
                      <td className={styles.itemName}>{r.product}</td>
                      <td className={styles.mono}>{r.unit}</td>
                      <td className={styles.mono}>{fmt(r.quantity)}</td>
                      <td>{r.store}</td>
                      <td className={styles.fieldHint}>{r.issuedBy || '—'}</td>
                    </tr>
                  ))}
                  {report.rows.length === 0 && (
                    <tr><td colSpan={8} className={styles.fieldHint}>No issues to external parties in this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {report && report.scope === 'ref' && (
          <div id="report-printable">
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 4 }}>Ref No. {report.refNo}</h3>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Product</th><th>Unit</th><th>Type</th><th>Qty</th><th>Rate</th><th>Store</th><th>Added by</th><th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={i}>
                      <td className={styles.itemName}>{r.product}</td>
                      <td className={styles.mono}>{r.unit}</td>
                      <td>{r.type}</td>
                      <td className={styles.mono}>{fmt(r.quantity)}</td>
                      <td className={styles.mono}>{fmt(r.rate)}</td>
                      <td>{r.store}</td>
                      <td className={styles.fieldHint}>{r.addedBy || '—'}</td>
                      <td className={styles.mono}>{new Date(r.date).toLocaleString()}</td>
                    </tr>
                  ))}
                  {report.rows.length === 0 && (
                    <tr><td colSpan={8} className={styles.fieldHint}>No entries found for this ref no.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {report && report.scope !== 'external' && report.scope !== 'ref' && (
          <div id="report-printable">
            <div style={{ marginBottom: 16 }}>
              {settings?.companyName && (
                <div style={{ marginBottom: 12 }}>
                  {settings.logoUrl && <img src={settings.logoUrl} alt="" style={{ height: 40, marginBottom: 6 }} />}
                  <div style={{ fontWeight: 600 }}>{settings.companyName}</div>
                  {settings.address && <div className={styles.fieldHint}>{settings.address}</div>}
                  {(settings.phone || settings.email) && (
                    <div className={styles.fieldHint}>{[settings.phone, settings.email].filter(Boolean).join(' · ')}</div>
                  )}
                </div>
              )}
              <h3 style={{ marginBottom: 4 }}>{report.label}</h3>
              <p className={styles.storeMeta}>
                {report.from} to {report.to} · {report.scope === 'category' ? 'Category-wide' : 'Single store'}
              </p>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {report.scope === 'category' && <th>Store</th>}
                    <th>Product</th>
                    <th>Unit</th>
                    <th>Opening</th>
                    <th>Added</th>
                    <th>Deducted</th>
                    <th>Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={i}>
                      {report.scope === 'category' && <td>{r.storeName}</td>}
                      <td className={styles.itemName}>{r.productName}</td>
                      <td className={styles.mono}>{r.unit}</td>
                      <td className={styles.mono}>{fmt(r.opening)}</td>
                      <td className={styles.mono}>{fmt(r.added)}</td>
                      <td className={styles.mono}>{fmt(r.deducted)}</td>
                      <td className={styles.mono}>{fmt(r.closing)}</td>
                    </tr>
                  ))}
                  {report.rows.length === 0 && (
                    <tr>
                      <td colSpan={report.scope === 'category' ? 7 : 6} className={styles.fieldHint}>
                        No activity in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
                {totals && report.rows.length > 0 && (
                  <tfoot>
                    <tr>
                      {report.scope === 'category' && <td></td>}
                      <td className={styles.itemName}>Total</td>
                      <td></td>
                      <td className={styles.mono}>{fmt(totals.opening)}</td>
                      <td className={styles.mono}>{fmt(totals.added)}</td>
                      <td className={styles.mono}>{fmt(totals.deducted)}</td>
                      <td className={styles.mono}>{fmt(totals.closing)}</td>
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
