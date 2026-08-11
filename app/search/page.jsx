'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from '@/dashboard/store.module.css'

function fmt(n) {
  return Number(n).toLocaleString()
}

function fmtDate(date) {
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function SearchPage() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)

  async function runSearch(e) {
    e.preventDefault()
    if (!q.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
      const data = await res.json()
      setResults(Array.isArray(data) ? data : [])
      setSelected(null)
    } finally {
      setLoading(false)
    }
  }

  // Merge logs + transfers into one chronological movement feed
  function buildTimeline(product) {
    const fromLogs = product.logs.map(l => ({
      kind: l.type,
      quantity: l.quantity,
      rate: l.rate,
      note: l.note,
      store: l.store.name,
      user: l.user?.username || null,
      createdAt: l.createdAt,
    }))
    return fromLogs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }

  return (
    <div className={styles.main} style={{ marginLeft: 0 }}>
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <h2 className={styles.storeName}>Product history</h2>
          <span className={styles.storeMeta}>Search a product to see its full movement log</span>
        </div>
      </div>

      <div className={styles.content}>
        <form onSubmit={runSearch} className={styles.field} style={{ maxWidth: 480, marginBottom: 24 }}>
          <label>Product name</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. Maize" />
            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? '…' : 'Search'}
            </button>
          </div>
        </form>

        {!selected && results.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit</th>
                  <th>Stores holding it</th>
                  <th>Total balance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map(p => {
                  const totalBalance = p.entries.reduce((s, e) => s + e.quantity, 0)
                  return (
                    <tr key={p.id}>
                      <td className={styles.itemName}>{p.name}</td>
                      <td className={styles.mono}>{p.unit.name}</td>
                      <td className={styles.mono}>{p.entries.length}</td>
                      <td className={styles.mono}>{fmt(totalBalance)}</td>
                      <td>
                        <button className={styles.btnGhost} onClick={() => setSelected(p)}>
                          View history
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && q && results.length === 0 && (
          <p className={styles.fieldHint}>No products matched "{q}".</p>
        )}

        {selected && (
          <>
            <button className={styles.btnGhost} onClick={() => setSelected(null)} style={{ marginBottom: 16 }}>
              <i className="ti ti-arrow-left" /> Back to results
            </button>

            <h3 style={{ marginBottom: 4 }}>{selected.name}</h3>
            <p className={styles.storeMeta} style={{ marginBottom: 16 }}>
              Unit: {selected.unit.name}
            </p>

            <div className={styles.metrics} style={{ marginBottom: 24 }}>
              {selected.entries.map(entry => (
                <div key={entry.store.id} className={styles.metric}>
                  <div className={styles.metricLabel}>{entry.store.name} ({entry.store.category.name})</div>
                  <div className={styles.metricValue}>{fmt(entry.quantity)} {selected.unit.name}</div>
                </div>
              ))}
              {selected.entries.length === 0 && (
                <p className={styles.fieldHint}>Not currently held in any store.</p>
              )}
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Store</th>
                    <th>Quantity</th>
                    <th>Rate</th>
                    <th>By</th>
                    <th>Note</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {buildTimeline(selected).map((entry, i) => (
                    <tr key={i}>
                      <td>
                        <span className={
                          entry.kind === 'IN' ? styles.badgeOk :
                          entry.kind === 'TRANSFER_OUT' ? styles.badgeLow : styles.badgeOk
                        }>
                          {entry.kind.replace('_', ' ')}
                        </span>
                      </td>
                      <td>{entry.store}</td>
                      <td className={styles.mono}>{fmt(entry.quantity)}</td>
                      <td className={styles.mono}>{fmt(entry.rate)}</td>
                      <td className={styles.fieldHint}>{entry.user || '—'}</td>
                      <td className={styles.fieldHint}>{entry.note || '—'}</td>
                      <td className={styles.mono}>{fmtDate(entry.createdAt)}</td>
                    </tr>
                  ))}
                  {buildTimeline(selected).length === 0 && (
                    <tr><td colSpan={7} className={styles.fieldHint}>No movement recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}