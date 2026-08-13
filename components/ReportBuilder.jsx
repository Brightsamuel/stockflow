'use client'
import { useState, useEffect } from 'react'
import styles from '@/dashboard/store.module.css'

function fmt(n) {
  return Number(n).toLocaleString()
}

const SCOPE_STORE = 'store'
const SCOPE_CATEGORY = 'category'
const SCOPE_EXTERNAL = 'external'

export default function ReportBuilder({ categories }) {
  const [scope, setScope] = useState(SCOPE_STORE)
  const [categoryId, setCategoryId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recipients, setRecipients] = useState([])
  const [recipientFilter, setRecipientFilter] = useState('')

  useEffect(() => {
  fetch('/api/recipients')
    .then(res => res.json())
    .then(data => setRecipients(Array.isArray(data) ? data : []))
    .catch(() => setRecipients([]))
  }, [])

  const allStores = categories.flatMap(c => c.stores.map(s => ({ ...s, categoryId: c.id, categoryName: c.name })))

  async function generate(e) {
    e.preventDefault()
    if (!from || !to) { setError('Both dates are required.'); return }
    if (scope === SCOPE_STORE && !storeId) { setError('Select a store.'); return }
    if (scope === SCOPE_CATEGORY && !categoryId) { setError('Select a category.'); return }

    setLoading(true); setError(''); setReport(null)
    try {
      const params = new URLSearchParams({ from, to })
      if (scope === SCOPE_STORE) params.set('storeId', storeId)
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

        {report && report.scope !== 'external' && (
          <div id="report-printable">
            <div style={{ marginBottom: 16 }}>
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