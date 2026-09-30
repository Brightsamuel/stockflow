'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconAlertCircle, IconArrowLeft, IconHistory, IconPackage, IconSearch } from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import ExportBar from '@/components/ui/ExportBar'
import ReportDocument from '@/components/ui/ReportDocument'
import EmptyState from '@/components/ui/EmptyState'
import { MovementBadge } from '@/components/ui/Badge'
import { api } from '@/lib/api'
import { NO_OWNER } from '@/lib/owners'
import { fmtDate, fmtMoney, fmtNum, fmtSigned, plural } from '@/lib/format'
import { withTotals } from '@/lib/tables'
import { exportExcel, exportPdf, fileSafe } from '@/lib/exporters'
import ui from '@/styles/ui.module.css'

const BALANCE_COLS = [
  { label: 'Store', value: r => r.store, strong: true },
  { label: 'Category', value: r => r.category, muted: true },
  { label: 'Owner', value: r => r.owner },
  { label: 'Quantity', value: r => r.quantity, num: true, total: true },
  { label: 'Rate (UGX)', value: r => r.rate, num: true },
  { label: 'Value (UGX)', value: r => r.value, num: true, total: true },
]

const MOVEMENT_COLS = [
  { label: 'Date', value: r => fmtDate(r.date), nowrap: true },
  { label: 'Type', value: r => r.type, render: r => <MovementBadge kind={r.kind} /> },
  { label: 'Store', value: r => r.store },
  { label: 'Owner', value: r => r.owner },
  { label: 'Change', value: r => r.change, num: true, format: fmtSigned },
  { label: 'Rate', value: r => r.rate, num: true },
  { label: 'Value (UGX)', value: r => r.value || null, num: true },
  {
    label: 'Ref no.',
    value: r => r.refNo,
    nowrap: true,
    render: r => (r.refNo ? <Link href={`/notes?ref=${encodeURIComponent(r.refNo)}`} className={`${ui.link} ${ui.mono}`}>{r.refNo}</Link> : '—'),
  },
  { label: 'Details', value: r => r.note, muted: true },
  { label: 'Taken by', value: r => r.takenBy },
  { label: 'By', value: r => r.by, muted: true },
]

function historyUrl(productId, ownerId) {
  return `/api/products/${productId}/logs${ownerId ? `?ownerId=${encodeURIComponent(ownerId)}` : ''}`
}

// Product history: search a product, then see its balances and every movement, and print,
// save as PDF or export them. History is permanent; nothing here can delete it.
export default function SearchClient({ owners = [], settings, initialHistory = null }) {
  const [q, setQ] = useState(initialHistory?.product.name ?? '')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [results, setResults] = useState(null)
  const [history, setHistory] = useState(initialHistory)
  const [ownerId, setOwnerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const term = q.trim()

  useEffect(() => {
    if (term.length < 2) return undefined
    const timer = setTimeout(() => {
      api(`/api/search?lite=1&q=${encodeURIComponent(term)}`)
        .then(data => setSuggestions(Array.isArray(data) ? data : []))
        .catch(() => setSuggestions([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [term])

  // Keeps the address bar in step (so the page can be bookmarked or refreshed) without a reload
  function setAddress(productId) {
    window.history.replaceState(null, '', productId ? `/search?product=${productId}` : '/search')
  }

  async function openProduct(productId, owner = ownerId) {
    setLoading(true); setError(''); setShowSuggestions(false)
    try {
      const data = await api(historyUrl(productId, owner))
      setHistory(data)
      setQ(data.product.name)
      setAddress(productId)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function runSearch(e, owner = ownerId) {
    e?.preventDefault()
    if (!term) return
    setLoading(true); setError(''); setShowSuggestions(false)
    try {
      const params = new URLSearchParams({ q: term })
      if (owner) params.set('ownerId', owner)
      const data = await api(`/api/search?${params}`)
      setResults(Array.isArray(data) ? data : [])
      setHistory(null)
      setAddress(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function changeOwner(next) {
    setOwnerId(next)
    if (history) openProduct(history.product.id, next)
    else if (results) runSearch(null, next)
  }

  function backToResults() {
    setHistory(null)
    setAddress(null)
  }

  const ownerLabel = ownerId === NO_OWNER ? 'No owner' : owners.find(o => o.id === ownerId)?.name
  const subtitle = [
    `Unit: ${history?.product.unit ?? ''}`,
    ownerLabel && `Owner: ${ownerLabel}`,
    `As at ${fmtDate(new Date())}`,
  ].filter(Boolean).join(' · ')
  const sections = history ? withTotals([
    { title: 'Balances', sheet: 'Balances', cols: BALANCE_COLS, rows: history.balances, empty: 'Not held in any store right now.' },
    { title: 'Movements', sheet: 'Movements', cols: MOVEMENT_COLS, rows: history.rows, empty: 'No movements recorded yet.', totals: false },
  ]) : []
  const exportArgs = history && {
    title: `Product history · ${history.product.name}`,
    subtitle,
    settings,
    fileBase: `history-${fileSafe(history.product.name)}`,
    sections,
  }

  return (
    <>
      <PageHeader title="Product history" subtitle="Every movement of a product across all stores, from the opening balance to today" />

      <div className={ui.page}>
        <form className={ui.card} onSubmit={runSearch} data-no-print>
          <div className={ui.cardBody}>
            <div className={`${ui.row} ${ui.rowEnd}`}>
              <div className={`${ui.field} ${ui.toolbarSearch}`} style={{ maxWidth: 520 }}>
                <span className={ui.label}>Product</span>
                <div className={ui.inputWrap}>
                  <span className={ui.inputIcon}><IconSearch size={16} /></span>
                  <input
                    className={`${ui.input} ${ui.inputWithIcon}`}
                    value={q}
                    onChange={e => { setQ(e.target.value); setShowSuggestions(true) }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setShowSuggestions(false)}
                    onKeyDown={e => { if (e.key === 'Escape') setShowSuggestions(false) }}
                    placeholder="Start typing a product name, e.g. cement"
                    aria-label="Product name"
                    autoFocus={!initialHistory}
                  />
                  {showSuggestions && term.length >= 2 && suggestions.length > 0 && (
                    <div className={ui.suggest}>
                      {suggestions.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          className={ui.suggestItem}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => openProduct(p.id)}
                        >
                          <span className={ui.suggestTop}><strong>{p.name}</strong><span className={ui.suggestMeta}>{p.unit.name}</span></span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <label className={ui.field} style={{ width: 200 }}>
                <span className={ui.label}>Stock owner</span>
                <select className={ui.input} value={ownerId} onChange={e => changeOwner(e.target.value)}>
                  <option value="">All owners</option>
                  <option value={NO_OWNER}>No owner</option>
                  {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={loading || !term}>
                {loading ? <span className={ui.spinner} /> : <IconSearch size={16} />} Search
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className={`${ui.alert} ${ui.alertDanger}`} data-no-print>
            <IconAlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}

        {!history && results && (
          <section className={`${ui.card} ${ui.cardFlush}`} data-no-print>
            <div className={ui.cardHeader}>
              <h2 className={ui.cardTitle}><IconPackage size={17} /> {plural(results.length, 'product')} matching &quot;{term}&quot;</h2>
            </div>
            {results.length === 0 ? (
              <EmptyState icon={IconSearch} title="No products found">Try a shorter or different name.</EmptyState>
            ) : (
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Unit</th>
                      <th className={ui.num}>Stores holding it</th>
                      <th className={ui.num}>Total balance</th>
                      <th className={ui.num}>Value (UGX)</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(p => {
                      const balance = p.entries.reduce((s, e) => s + e.quantity, 0)
                      const value = p.entries.reduce((s, e) => s + e.quantity * e.rate, 0)
                      const stores = p.entries.filter(e => !e.store.category.isSystem).length
                      return (
                        <tr key={p.id}>
                          <td className={ui.cellStrong}>{p.name}</td>
                          <td className={ui.cellMuted}>{p.unit.name}</td>
                          <td className={ui.num}>{fmtNum(stores)}</td>
                          <td className={ui.num}>{fmtNum(balance)}</td>
                          <td className={ui.num}>{fmtNum(value)}</td>
                          <td>
                            <div className={ui.cellActions}>
                              <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`} onClick={() => openProduct(p.id)}>
                                <IconHistory size={15} /> View history
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {!history && !results && (
          <section className={ui.card} data-no-print>
            <EmptyState icon={IconHistory} title="Look up a product">
              Search for a product to see where it is held and every movement it has had: received, transferred, used on
              projects, issued and adjusted. The history can be printed, saved as a PDF or exported to Excel.
            </EmptyState>
          </section>
        )}

        {history && (
          <>
            <div className={ui.rowBetween} data-no-print>
              {results ? (
                <button type="button" className={`${ui.btn} ${ui.btnGhost} ${ui.btnSm}`} onClick={backToResults}>
                  <IconArrowLeft size={16} /> Back to results
                </button>
              ) : <span />}
              <div className={ui.chips}>
                <span className={ui.chip}>Balance <strong>{fmtNum(history.totalQuantity)} {history.product.unit}</strong></span>
                <span className={ui.chip}>Value <strong>{fmtMoney(history.totalValue)}</strong></span>
                <span className={ui.chip}>Stores <strong>{fmtNum(history.balances.filter(b => b.storeId).length)}</strong></span>
              </div>
            </div>

            <ExportBar
              info={<strong className={ui.strong}>{plural(history.rows.length, 'movement')}</strong>}
              onPdf={() => exportPdf(exportArgs)}
              onExcel={() => exportExcel(exportArgs)}
            />

            <ReportDocument
              title={`Product history · ${history.product.name}`}
              subtitle={subtitle}
              settings={settings}
              sections={sections}
            />
          </>
        )}
      </div>
    </>
  )
}
