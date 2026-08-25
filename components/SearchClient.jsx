'use client'
import { useEffect, useState } from 'react'
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

export default function SearchClient({ currentUser }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [clearError, setClearError] = useState('')

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

  useEffect(() => {
    if (!q.trim() || q.trim().length < 2) {
      setSuggestions([])
      return undefined
    }

    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
        .then(res => res.json())
        .then(data => setSuggestions(Array.isArray(data) ? data.slice(0, 6) : []))
        .catch(() => setSuggestions([]))
    }, 300)

    return () => clearTimeout(timer)
  }, [q])

  async function runSearch(e) {
    e.preventDefault()
    if (!q.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
      const data = await res.json()
      setResults(Array.isArray(data) ? data : [])
      setSelected(null)
      setShowSuggestions(false)
    } finally {
      setLoading(false)
    }
  }

  async function clearHistory() {
    if (!selected || !isSuperAdmin) return
    if (!confirm(`Clear all history for ${selected.name}? This cannot be undone.`)) return

    setLoading(true)
    setClearError('')
    try {
      const res = await fetch(`/api/products/${selected.id}/logs`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to clear history')
      setSelected(product => ({ ...product, logs: [] }))
    } catch (error) {
      setClearError(error.message)
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
    <>
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <h2 className={styles.storeName}>Product history</h2>
          <span className={styles.storeMeta}>Search a product to see its full movement log</span>
        </div>
      </div>

      <div className={styles.content}>
        {/* <div style={{ marginBottom: 12 }}>
          <button className={styles.btnGhost} onClick={() => router.back()}>
            <i className="ti ti-arrow-left" /> Back
          </button>
        </div> */}

        <form onSubmit={runSearch} className={styles.field} style={{ maxWidth: 480, marginBottom: 24 }}>
          <label>Product name</label>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={q}
                onChange={e => { setQ(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="e.g. Maize"
              />
              <button type="submit" className={styles.btnPrimary} disabled={loading}>
                {loading ? '…' : 'Search'}
              </button>
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                background: 'var(--surface-1)', border: '1px solid var(--border-strong)',
                borderRadius: 6, marginTop: 4, maxHeight: 220, overflowY: 'auto',
              }}>
                {suggestions.map(p => (
                  <div
                    key={p.id}
                    onClick={() => { setSelected(p); setShowSuggestions(false); setQ(p.name) }}
                    onMouseDown={e => e.preventDefault()}
                    style={{ padding: '8px 12px', cursor: 'pointer' }}
                  >
                    {p.name} <span className={styles.fieldHint}>({p.unit.name})</span>
                  </div>
                ))}
              </div>
            )}
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

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
              <h3>{selected.name}</h3>
              {isSuperAdmin && (
                <button className={styles.btnGhost} onClick={clearHistory} disabled={loading}>
                  <i className="ti ti-trash" /> {loading ? 'Clearing…' : 'Clear history'}
                </button>
              )}
            </div>
            {clearError && <p className={styles.errorMsg}>{clearError}</p>}
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
    </>
  )
}
